import { Route } from "./Route";
import { Playlist } from "./Playlist";
import { Signal } from "../lib/Signal";
import { TrackId, RouteId, FrameCount } from "./types";
import { MonitorMode } from "./MonitorMode";
import { RecordMode } from "./RecordMode";

export enum TrackType {
  AUDIO = "AUDIO",
  MIDI = "MIDI",
  AUX = "AUX",
  BUS = "BUS",
  FOLDER = "FOLDER",
  VCA = "VCA",
}

export interface BounceConfig {
  startFrame?: number;
  endFrame?: number;
  includePlugins: boolean;
  includeAutomation: boolean;
}

/**
 * @deprecated 녹음 겹침 정책은 RecordMode를 사용합니다.
 * 이 값은 호환성을 위해 유지되며 현재 Playlist 편집과 재생에는 사용되지 않습니다.
 */
export type TrackMode = "normal" | "non_layered" | "tape";

export class Track {
  public readonly id: TrackId;
  public name: string;
  public readonly type: TrackType;

  public readonly route: Route;
  public readonly playlist: Playlist;

  public armed: boolean = false;
  public monitor: boolean = false;
  public mute: boolean = false;
  public solo: boolean = false;
  public color: string = "#4a9eff"; // Default track color

  // Phase 15: Solo system enhancement
  public soloIsolate: boolean = false;
  public soloSafe: boolean = false;

  // Phase 15: Monitor mode
  public monitorMode: MonitorMode = MonitorMode.AUTO;

  // Phase 15: Trim gain (dB, pre-fader input level correction)
  public trimGain: number = 0;

  // Phase 15: Track comment
  public comment: string = "";

  // Freeze state
  public frozen: boolean = false;
  public frozenSourceId: string | null = null;

  // Track Groups / Folders (Phase 10)
  public parentTrackId: TrackId | null = null;
  public groupId: string | null = null;
  public isCollapsed: boolean = false;

  // Alignment style (for recording)
  private _alignStyle: "existing_material" | "capture_time" =
    "existing_material";

  // Track mode
  private _trackMode: TrackMode = "normal";
  private _recordMode: RecordMode = RecordMode.LAYERED;

  // Enhanced bounce/freeze state
  private _bounceProgress: number = 0;

  // Signals
  public readonly armChanged = new Signal<boolean>();
  public readonly monitorChanged = new Signal<boolean>();
  public readonly muteChanged = new Signal<boolean>();
  public readonly soloChanged = new Signal<boolean>();
  public readonly soloIsolateChanged = new Signal<boolean>();
  public readonly soloSafeChanged = new Signal<boolean>();
  public readonly monitorModeChanged = new Signal<MonitorMode>();
  public readonly trimGainChanged = new Signal<number>();
  public readonly colorChanged = new Signal<string>();
  public readonly frozenChanged = new Signal<boolean>();
  public readonly alignStyleChanged = new Signal<string>();
  public readonly trackModeChanged = new Signal<string>();
  public readonly recordModeChanged = new Signal<RecordMode>();
  public readonly bounceProgressChanged = new Signal<number>();
  public readonly bounceCompleted = new Signal<{ sourceId: string }>();

  constructor(id: TrackId, name: string, type: TrackType) {
    this.id = id;
    this.name = name;
    this.type = type;

    // Create associated Route and Playlist
    // In a real scenario, IDs might be deterministic or passed in
    this.route = new Route(crypto.randomUUID() as RouteId, name);
    this.playlist = new Playlist(crypto.randomUUID(), name);
  }

  public rename(newName: string) {
    this.name = newName;
    this.route.name = newName;
    this.playlist.name = newName;
  }

  public setArmed(armed: boolean) {
    if (this.armed !== armed) {
      this.armed = armed;
      this.armChanged.emit(armed);
    }
  }

  public setMonitor(monitor: boolean) {
    if (this.monitor !== monitor) {
      this.monitor = monitor;
      this.monitorChanged.emit(monitor);
    }
  }

  public setMute(mute: boolean) {
    if (this.mute !== mute) {
      this.mute = mute;
      this.muteChanged.emit(mute);
    }
  }

  public setSolo(solo: boolean) {
    if (this.solo !== solo) {
      this.solo = solo;
      this.soloChanged.emit(solo);
    }
  }

  public setColor(color: string) {
    if (this.color !== color) {
      this.color = color;
      this.colorChanged.emit(color);
    }
  }

  public setFrozen(frozen: boolean) {
    if (this.frozen !== frozen) {
      this.frozen = frozen;
      this.frozenChanged.emit(frozen);
    }
  }

  public setSoloIsolate(isolate: boolean) {
    if (this.soloIsolate !== isolate) {
      this.soloIsolate = isolate;
      this.soloIsolateChanged.emit(isolate);
    }
  }

  public setSoloSafe(safe: boolean) {
    if (this.soloSafe !== safe) {
      this.soloSafe = safe;
      this.soloSafeChanged.emit(safe);
    }
  }

  public setMonitorMode(mode: MonitorMode) {
    if (this.monitorMode !== mode) {
      this.monitorMode = mode;
      this.monitorModeChanged.emit(mode);
    }
  }

  public setTrimGain(db: number) {
    const clamped = Math.max(-20, Math.min(20, db));
    if (this.trimGain !== clamped) {
      this.trimGain = clamped;
      this.route.trim = clamped; // Sync Route's Trim GainProcessor
      this.trimGainChanged.emit(clamped);
    }
  }

  // ─── Bounce / Freeze Configuration ──────────────────────────────────────

  /**
   * Whether the track can be frozen. Returns false if already frozen.
   */
  public canFreeze(): boolean {
    return !this.frozen;
  }

  /**
   * Whether the track can be bounced.
   * Audio and MIDI tracks can be bounced; AUX, BUS, FOLDER, and VCA cannot.
   */
  public canBounce(): boolean {
    return this.type === TrackType.AUDIO || this.type === TrackType.MIDI;
  }

  /**
   * Get the default bounce configuration for this track.
   */
  public getBounceConfig(): BounceConfig {
    const extent = this.playlist.getExtent();
    return {
      startFrame: extent.start,
      endFrame: extent.end,
      includePlugins: true,
      includeAutomation: true,
    };
  }

  /**
   * Get a bounce configuration for a specific frame range.
   *
   * @param startFrame The start frame of the bounce range.
   * @param endFrame   The end frame of the bounce range.
   * @returns A BounceConfig with the specified range.
   */
  public getBounceRangeConfig(
    startFrame: FrameCount,
    endFrame: FrameCount,
  ): BounceConfig {
    return {
      startFrame,
      endFrame,
      includePlugins: true,
      includeAutomation: true,
    };
  }

  /**
   * Freeze the track, storing a reference to the rendered source.
   *
   * Freezing renders the track's output (including all plugins and
   * automation) to a new audio source. The original playlist is preserved
   * so it can be restored on unfreeze. While frozen, the track plays
   * back from the rendered source and plugins are bypassed.
   *
   * @param sourceId Identifier of the rendered audio source.
   */
  public freeze(sourceId: string): void {
    if (this.frozen) return;
    this.frozen = true;
    this.frozenSourceId = sourceId;
    this.frozenChanged.emit(true);
  }

  /**
   * Unfreeze the track, restoring the original playlist and plugins.
   * Discards the frozen source reference.
   */
  public unfreeze(): void {
    if (!this.frozen) return;
    this.frozen = false;
    this.frozenSourceId = null;
    this.frozenChanged.emit(false);
  }

  /**
   * Update the bounce progress.
   * Used by the engine to report rendering progress to the UI.
   *
   * @param progress A value between 0 (not started) and 1 (complete).
   */
  public setBounceProgress(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress));
    if (this._bounceProgress !== clamped) {
      this._bounceProgress = clamped;
      this.bounceProgressChanged.emit(clamped);
    }
  }

  /** Current bounce progress (0 to 1). */
  public get bounceProgress(): number {
    return this._bounceProgress;
  }

  /**
   * Signal that a bounce operation has completed.
   * Resets bounce progress to 0 and emits the bounceCompleted signal.
   *
   * @param sourceId Identifier of the newly created audio source.
   */
  public completeBounce(sourceId: string): void {
    this._bounceProgress = 0;
    this.bounceProgressChanged.emit(0);
    this.bounceCompleted.emit({ sourceId });
  }

  // ─── Alignment Style ────────────────────────────────────────────────────

  /** Get the current alignment style for recording. */
  public getAlignStyle(): string {
    return this._alignStyle;
  }

  /** Set the alignment style for recording. */
  public setAlignStyle(style: "existing_material" | "capture_time"): void {
    if (this._alignStyle !== style) {
      this._alignStyle = style;
      this.alignStyleChanged.emit(style);
    }
  }

  // ─── Track Mode ─────────────────────────────────────────────────────────

  /** Get the current track mode. */
  public getTrackMode(): string {
    return this._trackMode;
  }

  /**
   * Set the track mode.
   * - 'normal': standard layered playback (default)
   * - 'non_layered': only one region plays at a time (highest layer wins)
   * - 'tape': destructive recording, new audio replaces old
   */
  public setTrackMode(mode: TrackMode): void {
    if (this._trackMode !== mode) {
      this._trackMode = mode;
      this.trackModeChanged.emit(mode);
    }
  }

  public get recordMode(): RecordMode {
    return this._recordMode;
  }

  public setRecordMode(mode: RecordMode): void {
    if (this._recordMode === mode) {
      return;
    }
    this._recordMode = mode;
    this.recordModeChanged.emit(mode);
  }
}
