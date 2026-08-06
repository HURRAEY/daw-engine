import { Track, TrackType } from "./Track";
import { MonitorMode } from "./MonitorMode";
import { Route } from "./Route";
import { Source } from "./Source";
import { Range } from "./Range";
import { Region } from "./Region";
import { MidiRegion, MidiRegionSnapshot } from "./MidiRegion";
import { SendBus, SendBusId } from "./SendBus";
import { Marker, MarkerId } from "./Marker";
import { RegionGroup, RegionGroupId } from "./RegionGroup";
import {
  TrackId,
  RouteId,
  SampleRate,
  FrameCount,
  SourceId,
  RangeId,
  RegionId,
} from "./types";
import { Signal } from "../lib/Signal";
import { IO } from "../processing/IO";
import { ExportConfig } from "./ExportConfig";
import { ExportStatus } from "./ExportStatus";
import { GridSettings } from "./GridSettings";
import { TempoMap } from "./temporal/TempoMap";
import { TimeDomain } from "./temporal/types";
import { MixerSceneManager, MixerSceneSnapshot } from "./MixerScene";
import { TrackGroup, TrackGroupSnapshot } from "./TrackGroup";
import { CDMarker, CDMarkerSnapshot } from "./CDMarker";
import { VCATrack, VCATrackSnapshot } from "./VCATrack";
import { ScrubState } from "./TransportMode";
import { TransportFSM, MotionState } from "./TransportFSM";
import { SidechainConfig, SidechainConfigSnapshot } from "./SidechainConfig";
import { Take, TakeLane, TakeSnapshot } from "./Take";
import { TrackGroupLinkingService } from "./TrackGroupLinkingService";
import { RecordMode } from "./RecordMode";

import { logger } from "../utils/Logger";
export class Session {
  public readonly id: string;
  public name: string;
  public sampleRate: SampleRate;

  // Transport State
  public tempo: number = 120.0;
  public timeSignature: [number, number] = [4, 4];
  public timecodeFps: number = 30;
  public transportFrame: FrameCount = 0;
  public recordingStartFrame: FrameCount = 0;

  /**
   * Transport Finite State Machine.
   * Manages transport motion state (stopped/rolling/declick), direction,
   * and variable-speed playback. See TransportFSM.ts for full documentation.
   */
  public readonly transportFSM: TransportFSM = new TransportFSM();

  /**
   * Backwards-compatible `isPlaying` accessor.
   * Delegates to `transportFSM.isRolling()` for reads.
   * Writing `true` enqueues a StartTransport event;
   * writing `false` triggers an immediate stop (for legacy callers
   * like AudioEngine.pause that bypass the FSM lifecycle).
   */
  private _isPlaying: boolean = false;
  public get isPlaying(): boolean {
    return this._isPlaying;
  }
  public set isPlaying(value: boolean) {
    if (this._isPlaying !== value) {
      this._isPlaying = value;
      this.playingChanged.emit(value);
    }
  }

  // Loop & Punch
  public loopRangeId?: RangeId;
  public loopEnabled: boolean = false;
  public punchRangeId?: RangeId;
  public punchEnabled: boolean = false;

  // Loop Recording
  public loopRecordingEnabled: boolean = false;
  public loopRecordingTakeCount: number = 0;

  // Pre-roll / Count-in
  public preRollBars: number = 0;

  // Editing Mode
  public rippleEdit: boolean = false;

  // Structure
  private _tracks: Map<TrackId, Track> = new Map();
  private _ranges: Map<RangeId, Range> = new Map();
  private _sendBuses: Map<SendBusId, SendBus> = new Map();
  private _markers: Map<MarkerId, Marker> = new Map();
  private _regionGroups: Map<RegionGroupId, RegionGroup> = new Map();
  public readonly masterBus: Route;

  // Selection State
  private _selectedRegionIds: Set<string> = new Set();
  public readonly selectionChanged = new Signal<Set<string>>();

  // Region Group Selection
  /** When true, selecting a region auto-selects its group members. */
  public groupSelectEnabled: boolean = true;

  /** Reverse index: RegionId → RegionGroupId for O(1) lookup. */
  private _regionToGroupIndex: Map<string, RegionGroupId> = new Map();

  // Signals
  public readonly trackAdded = new Signal<Track>();
  public readonly trackRemoved = new Signal<TrackId>();
  public readonly rangeAdded = new Signal<Range>();
  public readonly rangeRemoved = new Signal<RangeId>();
  public readonly loopRangeChanged = new Signal<RangeId | undefined>();
  public readonly loopEnabledChanged = new Signal<boolean>();
  public readonly punchRangeChanged = new Signal<RangeId | undefined>();
  public readonly punchEnabledChanged = new Signal<boolean>();
  public readonly playingChanged = new Signal<boolean>();
  public readonly recordingChanged = new Signal<boolean>();
  public readonly loopRecordingChanged = new Signal<boolean>();
  public readonly preRollChanged = new Signal<number>();
  public readonly metronomeChanged = new Signal<boolean>();
  public readonly metronomeVolumeChanged = new Signal<number>();
  public readonly transportPositionChanged = new Signal<FrameCount>();
  public readonly tempoChanged = new Signal<number>();
  public readonly timeSignatureChanged = new Signal<[number, number]>();
  public readonly sendBusAdded = new Signal<SendBus>();
  public readonly sendBusRemoved = new Signal<SendBusId>();
  public readonly markerAdded = new Signal<Marker>();
  public readonly markerRemoved = new Signal<MarkerId>();
  public readonly markerChanged = new Signal<Marker>();
  public readonly trackReordered = new Signal<{
    trackId: TrackId;
    newIndex: number;
  }>();
  public readonly rippleEditChanged = new Signal<boolean>();
  public readonly regionGroupAdded = new Signal<RegionGroup>();
  public readonly regionGroupRemoved = new Signal<RegionGroupId>();

  public isRecording: boolean = false;
  public metronomeEnabled: boolean = false;
  public metronomeVolume: number = 1.0;

  // Grid & Snap settings
  public readonly gridSettings: GridSettings = new GridSettings();
  public readonly tempoMap: TempoMap;

  // Mixer Scenes
  public readonly mixerSceneManager: MixerSceneManager =
    new MixerSceneManager();

  // Track Groups (Phase 10)
  private _trackGroups: Map<string, TrackGroup> = new Map();
  public readonly trackGroupAdded = new Signal<TrackGroup>();
  public readonly trackGroupRemoved = new Signal<string>();

  // CD Markers (Phase 12)
  private _cdMarkers: Map<string, CDMarker> = new Map();
  public readonly cdMarkerAdded = new Signal<CDMarker>();
  public readonly cdMarkerRemoved = new Signal<string>();

  // VCA Tracks (Phase 10-4)
  private _vcaTracks: Map<string, VCATrack> = new Map();
  public readonly vcaTrackAdded = new Signal<VCATrack>();
  public readonly vcaTrackRemoved = new Signal<string>();

  // Scrub/Shuttle (Phase 10-2)
  public readonly scrubState: ScrubState = new ScrubState();

  // Sidechain Configs (Phase 12-3)
  private _sidechainConfigs: Map<string, SidechainConfig> = new Map();

  // ── Latency Compensation ────────────────────────────────────────────────
  /**
   * Emitted after {@link computeLatencyCompensation} recalculates the
   * per-route compensation delays for the session.
   */
  public readonly latencyCompensationChanged = new Signal<void>();

  /** Disposers for per-route latencyChanged subscriptions. */
  private _routeLatencySubs: Map<RouteId, { dispose: () => void }> = new Map();

  // Take Lanes (Phase 9-4)
  private _takeLanes: Map<string, TakeLane> = new Map();

  // Track Group Linking (mute/solo/gain/color propagation)
  private _linkingService: TrackGroupLinkingService | null = null;

  constructor(name: string, id?: string, sampleRate: SampleRate = 44100) {
    this.id = id || crypto.randomUUID();
    this.name = name;
    this.sampleRate = sampleRate;
    this.gridSettings = new GridSettings(undefined, undefined, this.tempo);
    this.gridSettings.setTimeSignature(
      this.timeSignature[0],
      this.timeSignature[1],
    );
    this.tempoMap = new TempoMap(sampleRate);

    // Initialize Master Bus
    this.masterBus = new Route(crypto.randomUUID() as RouteId, "Master");

    // Wire up FSM signals to keep legacy state in sync.
    this.transportFSM.stateChanged.connect((state: MotionState) => {
      const rolling = state === MotionState.ROLLING;
      // Sync the legacy _isPlaying flag when the FSM transitions.
      if (this._isPlaying !== rolling) {
        this._isPlaying = rolling;
        this.playingChanged.emit(rolling);
      }
    });

    this.transportFSM.locateRequested.connect((frame: FrameCount) => {
      this.locateTransport(frame);
    });

    // Subscribe to master bus latency changes.
    this._subscribeToRouteLatency(this.masterBus);

    // Track group linking (mute/solo/gain/color propagation)
    this._linkingService = new TrackGroupLinkingService(this);
  }

  public addTrack(
    name: string,
    type: TrackType = TrackType.AUDIO,
    id?: TrackId,
  ): Track {
    const trackId = id || (crypto.randomUUID() as TrackId);
    const track = new Track(trackId, name, type);
    this._tracks.set(trackId, track);

    // Auto-subscribe to latency changes on the new track's route.
    this._subscribeToRouteLatency(track.route);

    this.trackAdded.emit(track);
    return track;
  }

  public addAuxTrack(name: string, id?: TrackId): Track {
    return this.addTrack(name, TrackType.AUX, id);
  }

  public addBusTrack(name: string, id?: TrackId): Track {
    return this.addTrack(name, TrackType.BUS, id);
  }

  public removeTrack(id: TrackId) {
    if (this._tracks.has(id)) {
      const track = this._tracks.get(id)!;
      this._unsubscribeFromRouteLatency(track.route.id);
      this._tracks.delete(id);
      this.trackRemoved.emit(id);
    }
  }

  public getTrack(id: TrackId): Track | undefined {
    return this._tracks.get(id);
  }

  public get tracks(): ReadonlyArray<Track> {
    return Array.from(this._tracks.values());
  }

  // Range Management
  public addRange(
    name: string,
    start: FrameCount,
    end: FrameCount,
    id?: RangeId,
    color?: string,
  ): Range {
    const rangeId = id || (crypto.randomUUID() as RangeId);
    const range = new Range(rangeId, name, start, end, color);
    this._ranges.set(rangeId, range);
    this.rangeAdded.emit(range);
    return range;
  }

  public removeRange(id: RangeId): void {
    const range = this._ranges.get(id);
    if (range) {
      range.removed.emit();
      this._ranges.delete(id);
      this.rangeRemoved.emit(id);
    }
  }

  public getRange(id: RangeId): Range | undefined {
    return this._ranges.get(id);
  }

  public getRangeByName(name: string): Range | undefined {
    return Array.from(this._ranges.values()).find((r) => r.name === name);
  }

  public get ranges(): ReadonlyArray<Range> {
    return Array.from(this._ranges.values());
  }

  // Loop Range Management
  public setLoopRange(rangeId: RangeId): void {
    const range = this.getRange(rangeId);
    if (!range) {
      throw new Error(`Range not found: ${rangeId}`);
    }
    this.loopRangeId = rangeId;
    this.loopRangeChanged.emit(rangeId);
  }

  public clearLoopRange(): void {
    this.loopRangeId = undefined;
    this.loopEnabled = false;
    this.loopRangeChanged.emit(undefined);
    this.loopEnabledChanged.emit(false);
  }

  public getLoopRange(): Range | undefined {
    return this.loopRangeId ? this.getRange(this.loopRangeId) : undefined;
  }

  public setLoopEnabled(enabled: boolean): void {
    if (!this.loopRangeId && enabled) {
      throw new Error("Cannot enable loop without setting loop range first");
    }
    this.loopEnabled = enabled;
    this.loopEnabledChanged.emit(enabled);
  }

  public toggleLoop(): void {
    if (this.loopRangeId) {
      this.setLoopEnabled(!this.loopEnabled);
    }
  }

  // Punch Range Management
  public setPunchRange(rangeId: RangeId): void {
    const range = this.getRange(rangeId);
    if (!range) {
      throw new Error(`Range not found: ${rangeId}`);
    }
    this.punchRangeId = rangeId;
    this.punchRangeChanged.emit(rangeId);
  }

  public clearPunchRange(): void {
    this.punchRangeId = undefined;
    this.punchRangeChanged.emit(undefined);
  }

  public getPunchRange(): Range | undefined {
    return this.punchRangeId ? this.getRange(this.punchRangeId) : undefined;
  }

  public setPunchEnabled(enabled: boolean): void {
    if (!this.punchRangeId && enabled) {
      throw new Error("Cannot enable punch without setting punch range first");
    }
    this.punchEnabled = enabled;
    this.punchEnabledChanged.emit(enabled);
  }

  // Loop Recording
  public setLoopRecording(enabled: boolean): void {
    this.loopRecordingEnabled = enabled;
    if (!enabled) {
      this.loopRecordingTakeCount = 0;
    }
    this.loopRecordingChanged.emit(enabled);
  }

  public incrementTakeCount(): number {
    this.loopRecordingTakeCount++;
    return this.loopRecordingTakeCount;
  }

  // Pre-roll / Count-in
  public setPreRollBars(bars: number): void {
    this.preRollBars = Math.max(0, Math.floor(bars));
    this.preRollChanged.emit(this.preRollBars);
  }

  /**
   * Calculate pre-roll duration in seconds based on current tempo and time signature.
   */
  public getPreRollDurationSeconds(): number {
    if (this.preRollBars <= 0) return 0;
    const beatsPerBar = this.timeSignature[0];
    const totalBeats = this.preRollBars * beatsPerBar;
    const secondsPerBeat = 60 / this.tempo;
    return totalBeats * secondsPerBeat;
  }

  /**
   * Calculate pre-roll duration in frames.
   */
  public getPreRollDurationFrames(): FrameCount {
    return Math.floor(this.getPreRollDurationSeconds() * this.sampleRate);
  }

  // Transport Control (Domain Level)
  // These methods only update the 'Truth' state.
  // The AudioProvider will observe these changes.
  public setTempo(bpm: number) {
    if (bpm <= 0 || bpm === this.tempo) return;

    logger.debug(
      "Session.setTempo",
      `Changing tempo from ${this.tempo} to ${bpm}`,
    );
    const oldBpm = this.tempo;
    const ratio = bpm / oldBpm;
    this.tempo = bpm;

    // Update grid settings
    this.gridSettings.setBPM(bpm);

    // Update regions based on their time domain
    this.tracks.forEach((track) => {
      const regions = track.playlist.getRegions();
      logger.debug(
        "Session.setTempo",
        `Track ${track.name} has ${regions.length} region(s)`,
      );

      regions.forEach((region) => {
        logger.debug(
          "Session.setTempo",
          `Region "${region.name}": timeDomain=${region.timeDomain} (0=Audio, 1=Beat)`,
        );

        if (region.timeDomain === TimeDomain.BeatTime) {
          logger.debug(
            "Session.setTempo",
            `Updating Musical Mode region "${region.name}"`,
          );

          // Convert current frame position to beats at old BPM
          const startBeats = this.tempoMap.framesToBeats(region.start, oldBpm);
          const lengthBeats = this.tempoMap.framesToBeats(
            region.length,
            oldBpm,
          );

          logger.debug(
            "Session.setTempo",
            `- Old: start=${region.start} frames, length=${region.length} frames`,
          );
          logger.debug(
            "Session.setTempo",
            `- Beats: start=${startBeats.toNumber()}, length=${lengthBeats.toNumber()}`,
          );

          // Recalculate frames at new BPM
          const newStart = this.tempoMap.beatsToFrames(startBeats, bpm);
          const newLength = this.tempoMap.beatsToFrames(lengthBeats, bpm);

          logger.debug(
            "Session.setTempo",
            `- New: start=${newStart} frames, length=${newLength} frames`,
          );
          logger.debug("Session.setTempo", `- Playback rate: ${ratio}`);

          region.move(newStart);
          region.resize(newLength);

          // Adjust playback rate to compensate for tempo change
          region.playbackRate = ratio;

          // Notify UI that region has changed
          logger.debug(
            "Session.setTempo",
            `Emitting regionChanged signal for "${region.name}"`,
          );
          track.playlist.regionChanged.emit(region);
        } else {
          logger.debug(
            "Session.setTempo",
            `Skipping Audio Mode region "${region.name}" (stays fixed)`,
          );
        }
        // AudioTime regions stay fixed (do nothing)
      });
    });

    logger.debug(
      "Session.setTempo",
      `Emitting tempoChanged signal with bpm=${bpm}`,
    );
    this.tempoChanged.emit(bpm);
  }

  public setTimeSignature(numerator: number, denominator: number) {
    if (numerator > 0 && denominator > 0) {
      this.timeSignature = [numerator, denominator];
      this.gridSettings.setTimeSignature(numerator, denominator);
      this.timeSignatureChanged.emit(this.timeSignature);
    }
  }

  public startTransport() {
    this.transportFSM.enqueue({ type: "StartTransport" });
    // Sync legacy flag so existing AudioEngine / UI code still works.
    this.isPlaying = true;
  }

  public stopTransport() {
    this.transportFSM.enqueue({ type: "StopTransport" });
    // For rapid stop (no declick in domain layer), complete immediately.
    // The audio backend handles its own declick ramp-down independently.
    this.transportFSM.enqueue({ type: "DeclickDone" });
    this.isPlaying = false;
    this.transportFrame = 0;
    this.transportPositionChanged.emit(0);
  }

  public locateTransport(frame: FrameCount) {
    this.transportFrame = frame;
    this.transportPositionChanged.emit(frame);
  }

  /**
   * Locate via the FSM with proper declick handling.
   * Use this when you want declick-aware relocation (e.g. from the timeline ruler).
   *
   * @param frame Target frame position.
   * @param rollAfterLocate Whether to resume playback after the locate completes.
   */
  public locateTransportViaFSM(
    frame: FrameCount,
    rollAfterLocate: boolean = false,
  ): void {
    this.transportFSM.enqueue({
      type: "Locate",
      target: frame,
      rollAfterLocate,
    });
  }

  /**
   * Get the current playback speed from the transport FSM.
   * Positive = forward, negative = reverse.
   * Range: -8.0 to +8.0 (absolute minimum 0.0625 when non-zero).
   */
  public getSpeed(): number {
    return this.transportFSM.getSpeed();
  }

  /**
   * Set the playback speed via the transport FSM.
   * If the sign changes while rolling, the FSM will handle
   * the declick and direction reversal automatically.
   *
   * @param speed Desired speed. Negative = reverse. Range: -8.0 to +8.0.
   */
  public setSpeed(speed: number): void {
    this.transportFSM.setSpeed(speed);
  }

  public startRecording() {
    this.isRecording = true;
    this.recordingStartFrame = this.transportFrame;
    this.recordingChanged.emit(true);
    this.startTransport();
  }

  public stopRecording() {
    this.isRecording = false;
    this.recordingChanged.emit(false);
    this.stopTransport(); // Usually stop recording stops transport too, or independent? standard DAW behavior is stop both.
  }

  // Metronome
  public toggleMetronome() {
    this.metronomeEnabled = !this.metronomeEnabled;
    this.metronomeChanged.emit(this.metronomeEnabled);
  }

  public setMetronomeVolume(volume: number) {
    this.metronomeVolume = Math.max(0, Math.min(1, volume));
    this.metronomeVolumeChanged.emit(this.metronomeVolume);
  }

  // Source Management
  private _sources: Map<SourceId, Source> = new Map();
  public readonly sourceAdded = new Signal<Source>();

  public addSource(source: Source) {
    if (!this._sources.has(source.id)) {
      this._sources.set(source.id, source);
      this.sourceAdded.emit(source);
    }
  }

  public removeSource(id: SourceId) {
    if (this._sources.has(id)) {
      this._sources.delete(id);
      // emit sourceRemoved?
    }
  }

  public getSource(id: SourceId): Source | undefined {
    return this._sources.get(id);
  }

  public get sources(): ReadonlyMap<SourceId, Source> {
    return this._sources;
  }

  public getIO(id: string): IO | undefined {
    // Check Master Bus
    if (this.masterBus.input.id === id) return this.masterBus.input;
    if (this.masterBus.output.id === id) return this.masterBus.output;

    // Check Tracks
    for (const track of this._tracks.values()) {
      if (track.route.input.id === id) return track.route.input;
      if (track.route.output.id === id) return track.route.output;
    }

    return undefined;
  }

  // Export
  private _exportConfig?: ExportConfig;
  private _exportStatus?: ExportStatus;

  public getExportConfig(): ExportConfig {
    if (!this._exportConfig) {
      this._exportConfig = new ExportConfig();
      this._exportConfig.sampleRate = this.sampleRate;
    }
    return this._exportConfig;
  }

  public getExportStatus(): ExportStatus {
    if (!this._exportStatus) {
      this._exportStatus = new ExportStatus();
    }
    return this._exportStatus;
  }

  public getSessionDuration(): FrameCount {
    let maxEnd = 0;
    this.tracks.forEach((track) => {
      track.playlist.getRegions().forEach((region) => {
        maxEnd = Math.max(maxEnd, region.end);
      });
      track.playlist.getMidiRegions().forEach((midiRegion) => {
        maxEnd = Math.max(maxEnd, midiRegion.end);
      });
    });
    return maxEnd;
  }

  // Region Selection

  public selectRegion(regionId: string, addToSelection: boolean = false): void {
    if (!addToSelection) {
      this._selectedRegionIds.clear();
    }
    const expanded = this.expandSelection([regionId]);
    for (const id of expanded) {
      this._selectedRegionIds.add(id);
    }
    this.selectionChanged.emit(new Set(this._selectedRegionIds));
  }

  public selectRegions(
    regionIds: string[],
    addToSelection: boolean = false,
  ): void {
    if (!addToSelection) {
      this._selectedRegionIds.clear();
    }
    const expanded = this.expandSelection(regionIds);
    for (const id of expanded) {
      this._selectedRegionIds.add(id);
    }
    this.selectionChanged.emit(new Set(this._selectedRegionIds));
  }

  public deselectRegion(regionId: string): void {
    this._selectedRegionIds.delete(regionId);
    this.selectionChanged.emit(new Set(this._selectedRegionIds));
  }

  public clearSelection(): void {
    this._selectedRegionIds.clear();
    this.selectionChanged.emit(new Set(this._selectedRegionIds));
  }

  public getSelectedRegionIds(): ReadonlySet<string> {
    return this._selectedRegionIds;
  }

  public isRegionSelected(regionId: string): boolean {
    return this._selectedRegionIds.has(regionId);
  }

  // ─── Region Group Selection Expansion ────────────────────────────────────

  /**
   * Find the track that owns a region. Returns undefined if not found.
   */
  public findTrackForRegion(regionId: string): Track | undefined {
    for (const track of this._tracks.values()) {
      if (track.playlist.getRegion(regionId)) return track;
    }
    return undefined;
  }

  /**
   * Expand a set of region IDs by including group members.
   *
   * Tier 1 — Explicit: regions in the same RegionGroup.
   * Tier 2 — Implicit: equivalent regions on sibling tracks in the same
   *          TrackGroup (when regionSelectLinked is enabled).
   */
  private expandSelection(regionIds: string[]): string[] {
    if (!this.groupSelectEnabled) return regionIds;

    const result = new Set<string>(regionIds);

    for (const regionId of regionIds) {
      // Tier 1: Explicit RegionGroup
      const groupId = this._regionToGroupIndex.get(regionId);
      if (groupId) {
        const group = this._regionGroups.get(groupId);
        if (group) {
          for (const rid of group.getRegionIds()) {
            result.add(rid);
          }
        }
      }

      // Tier 2: Implicit — TrackGroup with regionSelectLinked
      const track = this.findTrackForRegion(regionId);
      if (!track) continue;

      const trackGroup = this.getTrackGroupForTrack(track.id);
      if (!trackGroup || !trackGroup.regionSelectLinked) continue;

      const region = track.playlist.getRegion(regionId);
      if (!region) continue;

      for (const siblingTrackId of trackGroup.memberTrackIds) {
        if (siblingTrackId === track.id) continue;
        const siblingTrack = this.getTrack(siblingTrackId);
        if (!siblingTrack) continue;

        for (const siblingRegion of siblingTrack.playlist.getRegions()) {
          if (region.layerAndTimeEquivalent(siblingRegion)) {
            result.add(siblingRegion.id);
          }
        }
      }
    }

    return Array.from(result);
  }

  // ─── Send Bus Management ──────────────────────────────────────────────────

  public addSendBus(
    sourceTrackId: TrackId,
    destId: string,
    level: number = 0,
    preFader: boolean = false,
    id?: SendBusId,
  ): SendBus {
    const sendBusId = id ?? (crypto.randomUUID() as SendBusId);
    const sendBus = new SendBus(
      sendBusId,
      sourceTrackId,
      destId,
      level,
      preFader,
    );
    this._sendBuses.set(sendBusId, sendBus);
    this.sendBusAdded.emit(sendBus);
    return sendBus;
  }

  public removeSendBus(sendBusId: SendBusId): void {
    if (this._sendBuses.has(sendBusId)) {
      this._sendBuses.delete(sendBusId);
      this.sendBusRemoved.emit(sendBusId);
    }
  }

  public getSendBus(sendBusId: SendBusId): SendBus | undefined {
    return this._sendBuses.get(sendBusId);
  }

  public getSendBusesForTrack(sourceTrackId: TrackId): ReadonlyArray<SendBus> {
    return Array.from(this._sendBuses.values()).filter(
      (sendBus) => sendBus.sourceTrackId === sourceTrackId,
    );
  }

  public get sendBuses(): ReadonlyArray<SendBus> {
    return Array.from(this._sendBuses.values());
  }

  // ─── Marker Management ─────────────────────────────────────────────────────

  public addMarker(
    name: string,
    position: FrameCount,
    color?: string,
    id?: MarkerId,
  ): Marker {
    const markerId = id ?? (crypto.randomUUID() as MarkerId);
    const marker = new Marker(markerId, name, position, color);
    this._markers.set(markerId, marker);

    // Subscribe to marker changes
    marker.changed.connect(() => {
      this.markerChanged.emit(marker);
    });

    this.markerAdded.emit(marker);
    return marker;
  }

  public removeMarker(markerId: MarkerId): void {
    const marker = this._markers.get(markerId);
    if (marker) {
      marker.removed.emit();
      this._markers.delete(markerId);
      this.markerRemoved.emit(markerId);
    }
  }

  public getMarker(markerId: MarkerId): Marker | undefined {
    return this._markers.get(markerId);
  }

  public get markers(): ReadonlyArray<Marker> {
    return Array.from(this._markers.values()).sort(
      (a, b) => a.position - b.position,
    );
  }

  /**
   * Find the next marker after the given position.
   */
  public getNextMarker(position: FrameCount): Marker | undefined {
    const sorted = this.markers;
    return sorted.find((m) => m.position > position);
  }

  /**
   * Find the previous marker before the given position.
   */
  public getPreviousMarker(position: FrameCount): Marker | undefined {
    const sorted = this.markers;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].position < position) return sorted[i];
    }
    return undefined;
  }

  // ─── Track Reorder ────────────────────────────────────────────────────────

  public reorderTrack(trackId: TrackId, newIndex: number): void {
    const trackEntries = Array.from(this._tracks.entries());
    const currentIndex = trackEntries.findIndex(([id]) => id === trackId);
    if (currentIndex === -1) {
      throw new Error(`Track not found: ${trackId}`);
    }
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= trackEntries.length) newIndex = trackEntries.length - 1;
    if (currentIndex === newIndex) return;

    const [entry] = trackEntries.splice(currentIndex, 1);
    trackEntries.splice(newIndex, 0, entry);

    this._tracks.clear();
    for (const [id, track] of trackEntries) {
      this._tracks.set(id, track);
    }

    this.trackReordered.emit({ trackId, newIndex });
  }

  public getTrackIndex(trackId: TrackId): number {
    const keys = Array.from(this._tracks.keys());
    return keys.indexOf(trackId);
  }

  // ─── Ripple Edit ──────────────────────────────────────────────────────────

  public setRippleEdit(enabled: boolean): void {
    if (this.rippleEdit === enabled) return;
    this.rippleEdit = enabled;
    this.rippleEditChanged.emit(enabled);
  }

  // ─── Region Grouping ────────────────────────────────────────────────────

  public groupRegions(
    regionIds: string[],
    name?: string,
    id?: RegionGroupId,
  ): string {
    const groupId = id ?? crypto.randomUUID();
    const groupName = name ?? `Group ${this._regionGroups.size + 1}`;
    const group = new RegionGroup(groupId, groupName, regionIds);
    this._regionGroups.set(groupId, group);
    for (const rid of regionIds) {
      this._regionToGroupIndex.set(rid, groupId);
    }
    this.regionGroupAdded.emit(group);
    return groupId;
  }

  public ungroupRegions(groupId: RegionGroupId): void {
    const group = this._regionGroups.get(groupId);
    if (group) {
      for (const rid of group.getRegionIds()) {
        this._regionToGroupIndex.delete(rid);
      }
      this._regionGroups.delete(groupId);
      this.regionGroupRemoved.emit(groupId);
    }
  }

  public getRegionGroup(groupId: RegionGroupId): RegionGroup | undefined {
    return this._regionGroups.get(groupId);
  }

  public getRegionGroupForRegion(regionId: string): RegionGroup | undefined {
    const groupId = this._regionToGroupIndex.get(regionId);
    if (groupId) return this._regionGroups.get(groupId);
    return undefined;
  }

  public get regionGroups(): ReadonlyArray<RegionGroup> {
    return Array.from(this._regionGroups.values());
  }

  // ─── Track Groups ────────────────────────────────────────────────────────

  public addTrackGroup(name: string, id?: string): TrackGroup {
    const groupId = id ?? crypto.randomUUID();
    const group = new TrackGroup(groupId, name);
    this._trackGroups.set(groupId, group);
    this.trackGroupAdded.emit(group);
    return group;
  }

  public removeTrackGroup(groupId: string): void {
    const group = this._trackGroups.get(groupId);
    if (group) {
      // Clear groupId on member tracks
      for (const trackId of group.memberTrackIds) {
        const track = this.getTrack(trackId);
        if (track) track.groupId = null;
      }
      this._trackGroups.delete(groupId);
      this.trackGroupRemoved.emit(groupId);
    }
  }

  public getTrackGroup(groupId: string): TrackGroup | undefined {
    return this._trackGroups.get(groupId);
  }

  public getTrackGroupForTrack(trackId: TrackId): TrackGroup | undefined {
    for (const group of this._trackGroups.values()) {
      if (group.hasMember(trackId)) return group;
    }
    return undefined;
  }

  public get trackGroups(): ReadonlyArray<TrackGroup> {
    return Array.from(this._trackGroups.values());
  }

  // ─── Folder Track Helpers ────────────────────────────────────────────────

  public getChildTracks(parentId: TrackId): ReadonlyArray<Track> {
    return this.tracks.filter((t) => t.parentTrackId === parentId);
  }

  public setTrackParent(trackId: TrackId, parentId: TrackId | null): void {
    const track = this.getTrack(trackId);
    if (track) {
      track.parentTrackId = parentId;
    }
  }

  // ─── VCA Tracks ──────────────────────────────────────────────────────────

  public addVCATrack(name: string, id?: string): VCATrack {
    const vcaId = id ?? crypto.randomUUID();
    const vca = new VCATrack(vcaId, name);
    this._vcaTracks.set(vcaId, vca);
    this.vcaTrackAdded.emit(vca);
    return vca;
  }

  public removeVCATrack(vcaId: string): void {
    if (this._vcaTracks.has(vcaId)) {
      this._vcaTracks.delete(vcaId);
      this.vcaTrackRemoved.emit(vcaId);
    }
  }

  public getVCATrack(vcaId: string): VCATrack | undefined {
    return this._vcaTracks.get(vcaId);
  }

  public get vcaTracks(): ReadonlyArray<VCATrack> {
    return Array.from(this._vcaTracks.values());
  }

  // ─── Sidechain Configs ──────────────────────────────────────────────────

  public addSidechainConfig(
    targetTrackId: TrackId,
    targetProcessorId: string,
    id?: string,
  ): SidechainConfig {
    const configId = id ?? crypto.randomUUID();
    const config = new SidechainConfig(
      configId,
      targetTrackId,
      targetProcessorId,
    );
    this._sidechainConfigs.set(configId, config);
    return config;
  }

  public removeSidechainConfig(configId: string): void {
    this._sidechainConfigs.delete(configId);
  }

  public getSidechainConfig(configId: string): SidechainConfig | undefined {
    return this._sidechainConfigs.get(configId);
  }

  public getSidechainConfigsForTrack(
    trackId: TrackId,
  ): ReadonlyArray<SidechainConfig> {
    return Array.from(this._sidechainConfigs.values()).filter(
      (c) => c.targetTrackId === trackId,
    );
  }

  // ─── Latency Compensation ────────────────────────────────────────────────

  /**
   * Recompute per-route latency compensation for the entire session.
   *
   * Finds the maximum processor latency across every track route and the
   * master bus, then calls {@link Route.computeLatencyCompensation} on
   * each route so that they all align to the slowest path.
   *
   * This is automatically invoked when any route emits `latencyChanged`,
   * but can also be called manually after bulk route / processor changes.
   */
  public computeLatencyCompensation(): void {
    const allRoutes = this._getAllRoutes();

    // Determine the maximum inherent latency across all routes.
    let maxLatency = 0;
    for (const route of allRoutes) {
      const lat = route.getProcessorLatency();
      if (lat > maxLatency) maxLatency = lat;
    }

    // Apply compensation to each route.
    for (const route of allRoutes) {
      route.computeLatencyCompensation(maxLatency);
    }

    this.latencyCompensationChanged.emit();
  }

  /**
   * Subscribe to a route's {@link Route.latencyChanged} signal so that
   * global compensation is recalculated automatically.
   */
  private _subscribeToRouteLatency(route: Route): void {
    const sub = route.latencyChanged.connect(() => {
      this.computeLatencyCompensation();
    });
    this._routeLatencySubs.set(route.id, sub);
  }

  /**
   * Unsubscribe from a route's latency-changed signal.
   */
  private _unsubscribeFromRouteLatency(routeId: RouteId): void {
    const sub = this._routeLatencySubs.get(routeId);
    if (sub) {
      sub.dispose();
      this._routeLatencySubs.delete(routeId);
    }
  }

  /**
   * Collect every Route in the session (track routes + master bus).
   */
  private _getAllRoutes(): Route[] {
    const routes: Route[] = [this.masterBus];
    for (const track of this._tracks.values()) {
      routes.push(track.route);
    }
    return routes;
  }

  // ─── Take Lanes ─────────────────────────────────────────────────────────

  public addTakeLane(trackId: TrackId, id?: string): TakeLane {
    const laneId = id ?? crypto.randomUUID();
    const lane = new TakeLane(laneId, trackId);
    this._takeLanes.set(laneId, lane);
    return lane;
  }

  public removeTakeLane(laneId: string): void {
    this._takeLanes.delete(laneId);
  }

  public getTakeLane(laneId: string): TakeLane | undefined {
    return this._takeLanes.get(laneId);
  }

  public getTakeLanesForTrack(trackId: TrackId): ReadonlyArray<TakeLane> {
    return Array.from(this._takeLanes.values()).filter(
      (l) => l.trackId === trackId,
    );
  }

  // ─── CD Markers ─────────────────────────────────────────────────────────

  public addCDMarker(
    index: number,
    title: string,
    position: FrameCount,
    performer?: string,
    isrc?: string,
    id?: string,
  ): CDMarker {
    const markerId = id ?? crypto.randomUUID();
    const marker = new CDMarker(
      markerId,
      index,
      title,
      position,
      performer,
      isrc,
    );
    this._cdMarkers.set(markerId, marker);
    this.cdMarkerAdded.emit(marker);
    return marker;
  }

  public removeCDMarker(markerId: string): void {
    if (this._cdMarkers.has(markerId)) {
      this._cdMarkers.delete(markerId);
      this.cdMarkerRemoved.emit(markerId);
    }
  }

  public getCDMarker(markerId: string): CDMarker | undefined {
    return this._cdMarkers.get(markerId);
  }

  public get cdMarkers(): ReadonlyArray<CDMarker> {
    return Array.from(this._cdMarkers.values()).sort(
      (a, b) => a.index - b.index,
    );
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  /**
   * 세션 전체 상태를 JSON-직렬화 가능한 객체로 변환합니다.
   */
  public toJSON(): SessionSnapshot {
    return {
      id: this.id,
      name: this.name,
      sampleRate: this.sampleRate,
      tempo: this.tempo,
      timeSignature: this.timeSignature,
      transportFrame: this.transportFrame,
      tracks: this.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        armed: t.armed,
        mute: t.mute,
        solo: t.solo,
        color: t.color,
        soloIsolate: t.soloIsolate,
        soloSafe: t.soloSafe,
        monitorMode: t.monitorMode,
        trimGain: t.trimGain,
        comment: t.comment,
        recordMode: t.recordMode,
        regions: t.playlist.getRegions().map((r) => ({
          id: r.id,
          sourceId: r.sourceId,
          name: r.name,
          start: r.start,
          length: r.length,
          sourceStart: r.sourceStart,
          gain: r.gain,
          muted: r.muted,
          layer: r.layer,
          opaque: r.opaque,
          fadeIn: r.fadeIn,
          fadeOut: r.fadeOut,
          playbackRate: r.playbackRate,
          timeDomain: r.timeDomain,
          locked: r.locked,
        })),
        midiRegions: t.playlist.getMidiRegions().map((mr) => mr.toJSON()),
      })),
      ranges: Array.from(this._ranges.values()).map((r) => ({
        id: r.id,
        name: r.name,
        start: r.start,
        end: r.end,
      })),
      sendBuses: Array.from(this._sendBuses.values()).map((sb) => ({
        id: sb.id,
        sourceTrackId: sb.sourceTrackId,
        destId: sb.destId,
        level: sb.level,
        preFader: sb.preFader,
        active: sb.active,
      })),
      markers: Array.from(this._markers.values()).map((m) => ({
        id: m.id,
        name: m.name,
        position: m.position,
        color: m.color,
        locked: m.locked,
      })),
      loopRangeId: this.loopRangeId,
      loopEnabled: this.loopEnabled,
      punchRangeId: this.punchRangeId,
      punchEnabled: this.punchEnabled,
      preRollBars: this.preRollBars,
      loopRecordingEnabled: this.loopRecordingEnabled,
      rippleEdit: this.rippleEdit,
      regionGroups: Array.from(this._regionGroups.values()).map((g) => ({
        id: g.id,
        name: g.name,
        regionIds: g.getRegionIds(),
      })),
      tempoMapEvents: this.tempoMap.getAllEvents().map((e) => ({
        frame: e.frame,
        bpm: e.bpm,
        timeSigNum: e.timeSigNum,
        timeSigDen: e.timeSigDen,
      })),
      mixerScenes: this.mixerSceneManager.toJSON(),
      trackGroups2: Array.from(this._trackGroups.values()).map((g) =>
        g.toJSON(),
      ),
      cdMarkers: Array.from(this._cdMarkers.values()).map((m) => m.toJSON()),
      vcaTracks: Array.from(this._vcaTracks.values()).map((v) => v.toJSON()),
      sidechainConfigs: Array.from(this._sidechainConfigs.values()).map((c) =>
        c.toJSON(),
      ),
      takeLanes: Array.from(this._takeLanes.values()).map((lane) => ({
        id: lane.id,
        trackId: lane.trackId,
        takes: lane.takes.map((t) => t.toJSON()),
      })),
    };
  }

  /**
   * JSON 스냅샷으로부터 Session을 복원합니다.
   * 트랙, 리전, Range, SendBus를 복원하지만 Signal 연결(AudioEngine)은 별도로 처리해야 합니다.
   */
  public static fromJSON(snapshot: SessionSnapshot): Session {
    const session = new Session(
      snapshot.name,
      snapshot.id,
      snapshot.sampleRate,
    );
    session.tempo = snapshot.tempo;
    session.timeSignature = snapshot.timeSignature;
    session.transportFrame = snapshot.transportFrame;

    // Restore Tracks + Regions
    for (const trackData of snapshot.tracks) {
      const track = session.addTrack(
        trackData.name,
        trackData.type as TrackType,
        trackData.id as TrackId,
      );
      track.armed = trackData.armed;
      track.mute = trackData.mute;
      track.solo = trackData.solo;
      if (trackData.color) track.color = trackData.color;
      if (trackData.soloIsolate) track.setSoloIsolate(trackData.soloIsolate);
      if (trackData.soloSafe) track.setSoloSafe(trackData.soloSafe);
      if (trackData.monitorMode)
        track.setMonitorMode(trackData.monitorMode as MonitorMode);
      if (trackData.trimGain !== undefined)
        track.setTrimGain(trackData.trimGain);
      if (trackData.comment !== undefined) track.comment = trackData.comment;
      if (trackData.recordMode !== undefined) {
        track.setRecordMode(trackData.recordMode);
      }

      for (const regionData of trackData.regions) {
        const region = new Region(
          regionData.id as RegionId,
          regionData.sourceId,
          regionData.start,
          regionData.length,
          regionData.sourceStart,
          regionData.name,
          regionData.layer,
        );
        region.gain = regionData.gain;
        region.muted = regionData.muted;
        region.opaque = regionData.opaque ?? true;
        region.fadeIn = regionData.fadeIn;
        region.fadeOut = regionData.fadeOut;
        region.playbackRate = regionData.playbackRate;
        region.timeDomain = regionData.timeDomain;
        if (regionData.locked) region.locked = regionData.locked;
        track.playlist.addRegion(region);
      }

      // Restore MIDI Regions
      if (trackData.midiRegions) {
        for (const midiRegionData of trackData.midiRegions) {
          const midiRegion = MidiRegion.fromJSON(midiRegionData);
          track.playlist.addMidiRegion(midiRegion);
        }
      }
    }

    // Restore Ranges
    for (const rangeData of snapshot.ranges) {
      const range = new Range(
        rangeData.id as RangeId,
        rangeData.name,
        rangeData.start,
        rangeData.end,
      );
      session._ranges.set(range.id, range);
    }

    // Restore SendBuses (no signal emission – backend will sync via re-add on session load)
    for (const sbData of snapshot.sendBuses) {
      const sb = new SendBus(
        sbData.id,
        sbData.sourceTrackId,
        sbData.destId,
        sbData.level,
        sbData.preFader,
      );
      session._sendBuses.set(sb.id, sb);
    }

    // Restore Markers
    if (snapshot.markers) {
      for (const markerData of snapshot.markers) {
        const marker = new Marker(
          markerData.id as MarkerId,
          markerData.name,
          markerData.position,
          markerData.color,
          markerData.locked,
        );
        session._markers.set(marker.id, marker);
      }
    }

    session.loopRangeId = snapshot.loopRangeId as RangeId | undefined;
    session.loopEnabled = snapshot.loopEnabled;
    session.punchRangeId = snapshot.punchRangeId as RangeId | undefined;
    session.punchEnabled = snapshot.punchEnabled ?? false;
    session.preRollBars = snapshot.preRollBars ?? 0;
    session.loopRecordingEnabled = snapshot.loopRecordingEnabled ?? false;
    session.rippleEdit = snapshot.rippleEdit ?? false;

    // Restore Region Groups
    if (snapshot.regionGroups) {
      for (const groupData of snapshot.regionGroups) {
        const group = new RegionGroup(
          groupData.id,
          groupData.name,
          groupData.regionIds,
        );
        session._regionGroups.set(group.id, group);
        for (const rid of groupData.regionIds) {
          session._regionToGroupIndex.set(rid, group.id);
        }
      }
    }

    // Restore Tempo Map Events
    if (snapshot.tempoMapEvents) {
      for (const eventData of snapshot.tempoMapEvents) {
        session.tempoMap.addTempoChange(
          eventData.frame,
          eventData.bpm,
          eventData.timeSigNum,
          eventData.timeSigDen,
        );
      }
    }

    // Restore Mixer Scenes
    if (snapshot.mixerScenes) {
      session.mixerSceneManager.loadFromJSON(snapshot.mixerScenes);
    }

    // Restore Track Groups (Phase 10)
    if (snapshot.trackGroups2) {
      for (const groupData of snapshot.trackGroups2) {
        const group = TrackGroup.fromJSON(groupData);
        session._trackGroups.set(group.id, group);
      }
    }

    // Restore CD Markers (Phase 12)
    if (snapshot.cdMarkers) {
      for (const markerData of snapshot.cdMarkers as CDMarkerSnapshot[]) {
        const cdMarker = CDMarker.fromJSON(markerData);
        session._cdMarkers.set(cdMarker.id, cdMarker);
      }
    }

    // Restore VCA Tracks (Phase 10-4)
    if (snapshot.vcaTracks) {
      for (const vcaData of snapshot.vcaTracks) {
        const vca = VCATrack.fromJSON(vcaData);
        session._vcaTracks.set(vca.id, vca);
      }
    }

    // Restore Sidechain Configs (Phase 12-3)
    if (snapshot.sidechainConfigs) {
      for (const scData of snapshot.sidechainConfigs) {
        const config = SidechainConfig.fromJSON(scData);
        session._sidechainConfigs.set(config.id, config);
      }
    }

    // Restore Take Lanes (Phase 9-4)
    if (snapshot.takeLanes) {
      for (const laneData of snapshot.takeLanes) {
        const lane = new TakeLane(laneData.id, laneData.trackId as TrackId);
        for (const takeData of laneData.takes) {
          const take = Take.fromJSON(takeData);
          lane.addTake(take);
        }
        session._takeLanes.set(lane.id, lane);
      }
    }

    return session;
  }
}

// ─── Snapshot Types ───────────────────────────────────────────────────────────

export interface RegionSnapshot {
  id: string;
  sourceId: string;
  name: string;
  start: number;
  length: number;
  sourceStart: number;
  gain: number;
  muted: boolean;
  layer: number;
  opaque?: boolean;
  fadeIn: number;
  fadeOut: number;
  playbackRate: number;
  timeDomain: number;
  locked?: boolean;
}

export interface TrackSnapshot {
  id: string;
  name: string;
  type: string;
  armed: boolean;
  mute: boolean;
  solo: boolean;
  color?: string;
  soloIsolate?: boolean;
  soloSafe?: boolean;
  monitorMode?: string;
  trimGain?: number;
  comment?: string;
  recordMode?: RecordMode;
  regions: RegionSnapshot[];
  midiRegions?: MidiRegionSnapshot[];
}

export interface RangeSnapshot {
  id: string;
  name: string;
  start: number;
  end: number;
}

export interface SendBusSnapshot {
  id: string;
  sourceTrackId: string;
  destId: string;
  level: number;
  preFader: boolean;
  active: boolean;
}

export interface MarkerSnapshot {
  id: string;
  name: string;
  position: number;
  color: string;
  locked: boolean;
}

export interface SessionSnapshot {
  id: string;
  name: string;
  sampleRate: number;
  tempo: number;
  timeSignature: [number, number];
  transportFrame: number;
  tracks: TrackSnapshot[];
  ranges: RangeSnapshot[];
  sendBuses: SendBusSnapshot[];
  markers?: MarkerSnapshot[];
  loopRangeId?: string;
  loopEnabled: boolean;
  punchRangeId?: string;
  punchEnabled?: boolean;
  preRollBars?: number;
  loopRecordingEnabled?: boolean;
  rippleEdit?: boolean;
  regionGroups?: RegionGroupSnapshot[];
  tempoMapEvents?: TempoEventSnapshot[];
  mixerScenes?: MixerSceneSnapshot[];
  trackGroups2?: TrackGroupSnapshot[];
  cdMarkers?: CDMarkerSnapshot[];
  vcaTracks?: VCATrackSnapshot[];
  sidechainConfigs?: SidechainConfigSnapshot[];
  takeLanes?: TakeLaneSnapshot[];
}

export interface TempoEventSnapshot {
  frame: number;
  bpm: number;
  timeSigNum?: number;
  timeSigDen?: number;
}

export interface RegionGroupSnapshot {
  id: string;
  name: string;
  regionIds: string[];
}

export interface TakeLaneSnapshot {
  id: string;
  trackId: string;
  takes: TakeSnapshot[];
}
