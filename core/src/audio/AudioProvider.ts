import { TrackId, FrameCount, ProcessorId, RouteId } from "../domain/types";
import { Source } from "../domain/Source";
import { RegionDTO, MidiRegionDTO } from "./dto";
import { MeterData } from "../domain/MeterData";
import { AutomationPoint } from "../automation/types";
import type { RoutingSnapshot } from "./engine/RoutingSnapshot";

export interface AudioProvider {
  // Initialization
  initialize(): Promise<void>;

  // Session의 가변 객체 대신 동결된 실행 구조만 audio runtime에 전달한다.
  applyRoutingSnapshot(snapshot: RoutingSnapshot): void;

  // Transport Control
  start(): void;
  /**
   * Declick으로 출력을 무음까지 낮춘 뒤 transport를 정지한다.
   * 다음 start()가 정상 음량으로 재생할 수 있는 상태에서 Promise를 완료해야 한다.
   */
  stopWithDeclick?(): Promise<void>;
  stop(): void;
  pause(): void;
  seek(time: number): void;

  // Track/Route Management
  createTrack(
    trackId: TrackId,
    name: string,
    inputId: string,
    outputId: string,
  ): void;
  createAuxTrack(
    trackId: TrackId,
    name: string,
    inputId: string,
    outputId: string,
  ): void;
  createBusTrack(
    trackId: TrackId,
    name: string,
    inputId: string,
    outputId: string,
  ): void;
  deleteTrack(trackId: TrackId): void;

  // IO Management
  connectIO(sourceId: string, destId: string): void;
  disconnectIO(sourceId: string, destId: string): void;

  // Processor Management (Dynamic Chain)
  addProcessor(
    trackId: TrackId,
    processorId: ProcessorId,
    type: string,
    index: number,
  ): void;
  removeProcessor(trackId: TrackId, processorId: ProcessorId): void;

  // Parameter Control
  setProcessorParameter(
    trackId: TrackId,
    processorId: ProcessorId,
    parameter: string,
    value: number,
  ): void;

  // Automation Control
  setProcessorAutomation(
    trackId: TrackId,
    processorId: ProcessorId,
    parameter: string,
    events: ReadonlyArray<AutomationPoint>,
  ): void;

  // Legacy Helpers (Optional, can be implemented via setProcessorParameter if IDs are known)
  setTrackGain(trackId: string, gain: number): void;
  setTrackPan(trackId: string, pan: number): void;
  setMonitor(trackId: string, enabled: boolean): void;

  // Track Mute / Solo
  setTrackMute(trackId: string, muted: boolean): void;
  setTrackSolo(trackId: string, soloed: boolean): void;
  setTrackSoloIsolate(trackId: string, isolate: boolean): void;
  setTrackSoloSafe(trackId: string, safe: boolean): void;

  // Monitor Mode
  setMonitorMode(trackId: string, mode: string): void;

  // Region Management (Playback)
  // Scheduling regions to play at specific times
  scheduleRegion(trackId: TrackId, region: RegionDTO): void;
  updateRegions(trackId: TrackId, regions: RegionDTO[]): void;
  removeRegion(trackId: TrackId, regionId: string): void;

  // Metering
  getMeterLevel(routeId: RouteId): number;
  getMeterData(trackId: string): MeterData;
  getMasterMeterData(): MeterData;

  // Spectrum Analysis
  getAnalyserNode(trackId?: string): AnalyserNode | null;

  // Waveform Data
  getAudioBuffer(sourceId: string): Promise<AudioBuffer | null>;
  addAudioBuffer(sourceId: string, buffer: AudioBuffer): void;

  // Recording
  prepareRecording(trackId: TrackId): Promise<void>;
  startRecording(trackId: TrackId): void;
  stopRecording(trackId: TrackId): Promise<Blob>;

  // Punch Recording
  enablePunchRecording(enabled: boolean): void;
  setPunchRange(startFrame: FrameCount, endFrame: FrameCount): void;
  setRecordingMuted(trackId: TrackId, muted: boolean): void;

  // Input Monitoring with Effects
  setMonitorWithEffects(trackId: TrackId, enabled: boolean): void;
  getInputLatencyMs(): number;

  // Transport
  getCurrentFrame(): FrameCount;
  getCurrentTime(): number;
  setTempo(bpm: number): void;

  // Cache
  cacheBlob(url: string, blob: Blob): Promise<void>;

  // Metronome
  enableMetronome(enabled: boolean): void | Promise<void>;
  setMetronomeVolume(volume: number): void;

  // Source Management
  addSource(source: Source): Promise<void>;
  // Query Mode
  getEngineType(): "Worklet" | "ToneFallback";

  // Export
  exportAudio(
    startFrame: FrameCount,
    endFrame: FrameCount,
    sampleRate: number,
    trackIds?: TrackId[],
  ): Promise<AudioBuffer>;

  // Region Merging
  renderRegionsToBuffer(
    trackId: TrackId,
    regionIds: string[],
  ): Promise<AudioBuffer>;

  // Master Bus
  setMasterGain(gain: number): void;
  addMasterProcessor(
    processorId: ProcessorId,
    type: string,
    index: number,
  ): void;
  removeMasterProcessor(processorId: ProcessorId): void;
  setMasterProcessorParameter(
    processorId: ProcessorId,
    parameter: string,
    value: number,
  ): void;
  setMasterProcessorAutomation(
    processorId: ProcessorId,
    parameter: string,
    events: ReadonlyArray<AutomationPoint>,
  ): void;
  registerMasterIO(inputId: string, outputId: string): void;

  // Send Bus (Side-chain / Parallel Processing)
  addSendBus(
    sendBusId: string,
    sourceTrackId: TrackId,
    destId: string,
    level: number,
    preFader: boolean,
  ): void;
  removeSendBus(sendBusId: string): void;
  setSendBusLevel(sendBusId: string, level: number): void;
  setSendBusPreFader(sendBusId: string, preFader: boolean): void;
  setSendBusActive(sendBusId: string, active: boolean): void;

  // Region Audition
  auditionRegion(trackId: TrackId, regionId: string): void;
  stopAudition(): void;

  // Strip Silence: analyze buffer and return non-silent segments
  stripSilence(
    trackId: TrackId,
    regionId: string,
    thresholdDb: number,
    minLengthFrames: number,
  ): Promise<Array<{ start: number; length: number }>>;

  // Normalize Region: find peak and return gain needed to reach targetDb
  normalizeRegion(
    trackId: TrackId,
    regionId: string,
    targetDb: number,
  ): Promise<number>;

  // ─── MIDI ──────────────────────────────────────────────────────────────────

  /** Create a MIDI track with a synth instrument */
  createMidiTrack(
    trackId: TrackId,
    name: string,
    inputId: string,
    outputId: string,
  ): void;

  /** Schedule a MIDI region for playback */
  scheduleMidiRegion(trackId: TrackId, region: MidiRegionDTO): void;

  /** Remove a scheduled MIDI region */
  removeMidiRegion(trackId: TrackId, regionId: string): void;

  /** Switch the synth instrument type for a MIDI track */
  setMidiInstrument(trackId: TrackId, instrumentType: string): void;

  // ─── Loop Playback ──────────────────────────────────────────────────────
  /** Enable/disable native transport loop */
  enableLoop(enabled: boolean): void;
  /** Set the loop range on the transport */
  setLoopRange(startTime: number, endTime: number): void;

  // ─── MIDI Panic ─────────────────────────────────────────────────────────
  /** Release all sounding MIDI notes immediately */
  midiPanic(): void;

  // ─── Stereo Master Metering ─────────────────────────────────────────────
  /** Get separate L/R meter data for the master bus */
  getMasterStereoMeterData(): { left: MeterData; right: MeterData };

  // ─── Region Reverse ─────────────────────────────────────────────────────
  /** Reverse the audio buffer data for a region in-place */
  reverseRegionBuffer(trackId: TrackId, regionId: string): Promise<void>;
}
