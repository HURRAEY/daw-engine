import { FrameCount, RegionId } from "./types";
import { TimeDomain, TimePosition } from "./temporal/types";
import { TempoMap } from "./temporal/TempoMap";
import { Signal } from "../lib/Signal";
import { OverlapType } from "./OverlapType";
import { FadeShape } from "./FadeEnvelope";
import { Processor } from "../processing/Processor";

export type AudioSourceId = string;

export class Region {
  public id: RegionId;
  public sourceId: AudioSourceId;
  public name: string;

  // Timeline position
  public start: FrameCount;
  public length: FrameCount;

  // Source usage
  public sourceStart: FrameCount = 0;

  // Playback properties
  public gain: number = 1.0;
  public muted: boolean = false;
  public layer: number = 0;
  public opaque: boolean = true;
  public fadeIn: FrameCount = 0;
  public fadeOut: FrameCount = 0;
  public fadeInShape: FadeShape = FadeShape.EQUAL_POWER;
  public fadeOutShape: FadeShape = FadeShape.EQUAL_POWER;
  public playbackRate: number = 1.0;

  /** Pitch-preserving time stretch ratio (1.0 = normal, 0.5 = half speed, 2.0 = double speed) */
  public stretch: number = 1.0;
  /** Pitch shift in semitones (0 = no shift, positive = higher, negative = lower) */
  public pitchSemitones: number = 0;

  // Sync point (offset from region start, used for snap alignment)
  public syncPosition: FrameCount | null = null;

  // Transient positions (frame offsets from region start / source)
  public transients: FrameCount[] = [];

  // Lock state
  public locked: boolean = false;

  /** Time domain for this region (default: AudioTime for backward compatibility) */
  public timeDomain: TimeDomain = TimeDomain.AudioTime;

  // Region FX (per-region plugin chain)
  private _regionFx: Processor[] = [];

  // Ancestral tracking for undo
  private _ancestralStart?: number;
  private _ancestralLength?: number;

  // Enhanced lock types
  private _positionLocked: boolean = false;
  private _videoLocked: boolean = false;

  // Signals
  public readonly lockedChanged = new Signal<boolean>();
  public readonly regionFxAdded = new Signal<Processor>();
  public readonly regionFxRemoved = new Signal<Processor>();

  constructor(
    id: RegionId,
    sourceId: AudioSourceId,
    start: FrameCount,
    length: FrameCount,
    sourceStart: FrameCount,
    name: string,
    layer: number = 0,
  ) {
    this.id = id;
    this.sourceId = sourceId;
    this.start = start;
    this.length = length;
    this.sourceStart = sourceStart;
    this.name = name;
    this.layer = layer;
  }

  public get end(): FrameCount {
    return this.start + this.length;
  }

  /** Get position as TimePosition */
  getPosition(): TimePosition {
    return { domain: this.timeDomain, value: this.start };
  }

  /** Get duration as TimePosition */
  getDuration(): TimePosition {
    return { domain: this.timeDomain, value: this.length };
  }

  /** Set position from TimePosition (converts if needed) */
  setPosition(pos: TimePosition, tempoMap: TempoMap, bpm: number) {
    this.start = tempoMap.toFrames(pos, bpm);
    this.timeDomain = pos.domain;
  }

  /** Set duration from TimePosition (converts if needed) */
  setDuration(duration: TimePosition, tempoMap: TempoMap, bpm: number) {
    this.length = tempoMap.toFrames(duration, bpm);
    // Duration should match position's domain
    this.timeDomain = duration.domain;
  }

  public setLocked(locked: boolean) {
    if (this.locked === locked) return;
    this.locked = locked;
    this.lockedChanged.emit(locked);
  }

  public resize(newLength: FrameCount) {
    if (newLength < 0) return;
    this.length = newLength;
  }

  public move(newStart: FrameCount) {
    if (newStart < 0) newStart = 0;
    this.start = newStart;
  }

  // ─── Trim Operations ──────────────────────────────────────────────────

  /** Minimum region length in frames (1 sample) */
  private static readonly MIN_LENGTH = 1;

  /**
   * Trim the front of the region by an amount (delta-based).
   * Positive amount moves start forward (shortens region).
   * Negative amount moves start backward (extends region, if source allows).
   */
  public trimFront(amount: FrameCount) {
    if (amount >= this.length) return; // Prevent full deletion via trim
    // Source boundary constraint: don't go before source start 0
    if (this.sourceStart + amount < 0) {
      amount = -this.sourceStart;
    }
    if (amount === 0) return;
    this.start += amount;
    this.sourceStart += amount;
    this.length -= amount;
    // Invalidate cached transients on trim
    if (this.transients.length > 0) {
      this.transients = this.transients
        .map((t) => t - amount)
        .filter((t) => t >= 0 && t < this.length);
    }
  }

  /**
   * Trim the back of the region by an amount (delta-based).
   * Positive amount extends region, negative shortens it.
   */
  public trimBack(amount: FrameCount) {
    if (-amount >= this.length) return; // Prevent full deletion via trim
    this.length += amount;
    // Invalidate transients beyond new length
    if (this.transients.length > 0) {
      this.transients = this.transients.filter((t) => t < this.length);
    }
  }

  /**
   * Trim front to a new absolute timeline position.
   * Adjusts start, sourceStart, and length so the end stays fixed.
   * @param newPosition - The new timeline start position
   * @param sourceDuration - Optional source duration for boundary constraint
   */
  public trimFrontTo(
    newPosition: FrameCount,
    sourceDuration?: FrameCount,
  ): void {
    if (this.locked || this._positionLocked) return;
    if (newPosition < 0) newPosition = 0;

    const currentEnd = this.end;
    if (newPosition >= currentEnd) return; // Cannot trim past end

    const delta = newPosition - this.start;
    const newSourceStart = this.sourceStart + delta;

    // Source boundary: cannot go before source start
    if (newSourceStart < 0) return;

    // Source boundary: check we don't exceed source duration
    const newLength = currentEnd - newPosition;
    if (
      sourceDuration !== undefined &&
      newSourceStart + newLength > sourceDuration
    )
      return;

    // Ensure minimum length
    if (newLength < Region.MIN_LENGTH) return;

    this.start = newPosition;
    this.sourceStart = newSourceStart;
    this.length = newLength;

    // Adjust fades: if fadeIn exceeds new length, clamp it
    if (this.fadeIn + this.fadeOut > this.length) {
      this.fadeIn = Math.max(0, this.length - this.fadeOut);
    }

    // Invalidate transients
    if (this.transients.length > 0) {
      this.transients = this.transients
        .map((t) => t - delta)
        .filter((t) => t >= 0 && t < this.length);
    }
  }

  /**
   * Trim end to a new absolute timeline endpoint.
   * Adjusts length while keeping start and sourceStart fixed.
   * @param newEndpoint - The new timeline end position
   * @param sourceDuration - Optional source duration for boundary constraint
   */
  public trimEndTo(newEndpoint: FrameCount, sourceDuration?: FrameCount): void {
    if (this.locked || this._positionLocked) return;
    if (newEndpoint <= this.start) return; // Cannot trim before start

    const newLength = newEndpoint - this.start;

    // Source boundary constraint
    if (
      sourceDuration !== undefined &&
      this.sourceStart + newLength > sourceDuration
    )
      return;

    // Ensure minimum length
    if (newLength < Region.MIN_LENGTH) return;

    this.length = newLength;

    // Adjust fades: if fadeOut exceeds new length, clamp it
    if (this.fadeIn + this.fadeOut > this.length) {
      this.fadeOut = Math.max(0, this.length - this.fadeIn);
    }

    // Invalidate transients
    if (this.transients.length > 0) {
      this.transients = this.transients.filter((t) => t < this.length);
    }
  }

  /**
   * Trim both position and length atomically.
   * @param position - New timeline position
   * @param length - New length
   * @param sourceDuration - Optional source duration for constraint
   */
  public trimTo(
    position: FrameCount,
    length: FrameCount,
    sourceDuration?: FrameCount,
  ): void {
    if (this.locked || this._positionLocked) return;
    if (position < 0 || length < Region.MIN_LENGTH) return;

    const delta = position - this.start;
    const newSourceStart = this.sourceStart + delta;
    if (newSourceStart < 0) return;

    if (
      sourceDuration !== undefined &&
      newSourceStart + length > sourceDuration
    ) {
      length = sourceDuration - newSourceStart;
      if (length < Region.MIN_LENGTH) return;
    }

    this.start = position;
    this.sourceStart = newSourceStart;
    this.length = length;

    // Clamp fades
    if (this.fadeIn + this.fadeOut > this.length) {
      this.fadeIn = Math.min(this.fadeIn, this.length);
      this.fadeOut = Math.max(0, this.length - this.fadeIn);
    }

    // Invalidate transients
    if (this.transients.length > 0) {
      this.transients = this.transients
        .map((t) => t - delta)
        .filter((t) => t >= 0 && t < this.length);
    }
  }

  /**
   * Check if this region can trim its start before the source's beginning.
   * Audio regions cannot (they'd read silence); MIDI regions can.
   */
  public canTrimStartBeforeSourceStart(): boolean {
    return false; // Default: audio region. Override in MidiRegion.
  }

  /**
   * Verify and clamp start + length to source boundaries.
   * @returns true if the values were valid (or clamped successfully)
   */
  public verifyStartAndLength(sourceDuration?: FrameCount): boolean {
    if (sourceDuration === undefined) return true;
    if (this.sourceStart < 0) {
      this.sourceStart = 0;
    }
    const maxLength = sourceDuration - this.sourceStart;
    if (maxLength <= 0) return false;
    if (this.length > maxLength) {
      this.length = maxLength;
    }
    return true;
  }

  public setFadeIn(amount: FrameCount) {
    if (amount < 0) amount = 0;
    if (amount + this.fadeOut > this.length) {
      amount = this.length - this.fadeOut;
    }
    this.fadeIn = amount;
  }

  public setFadeOut(amount: FrameCount) {
    if (amount < 0) amount = 0;
    if (this.fadeIn + amount > this.length) {
      amount = this.length - this.fadeIn;
    }
    this.fadeOut = amount;
  }

  // ─── C-2: Advanced Fade System ────────────────────────────────────────────

  /** Set the fade-in curve shape. */
  public setFadeInShape(shape: FadeShape): void {
    this.fadeInShape = shape;
  }

  /** Set the fade-out curve shape. */
  public setFadeOutShape(shape: FadeShape): void {
    this.fadeOutShape = shape;
  }

  // ─── C-1: Region Overlap & Coverage Detection ────────────────────────────

  /**
   * Determine how a query range [start, end) relates to this region.
   */
  public coverage(start: FrameCount, end: FrameCount): OverlapType {
    const rStart = this.start;
    const rEnd = this.end;

    // No overlap at all
    if (start >= rEnd || end <= rStart) {
      return OverlapType.NONE;
    }

    // Region is fully inside the query range
    if (start <= rStart && end >= rEnd) {
      return OverlapType.EXTERNAL;
    }

    // Query is fully inside the region
    if (start >= rStart && end <= rEnd) {
      return OverlapType.INTERNAL;
    }

    // Query overlaps the region's start (query starts before region)
    if (start < rStart) {
      return OverlapType.START;
    }

    // Query overlaps the region's end (query ends after region)
    return OverlapType.END;
  }

  /**
   * Does this region cover the given frame position?
   */
  public covers(frame: FrameCount): boolean {
    return frame >= this.start && frame < this.end;
  }

  // ─── C-3: Sync Point ─────────────────────────────────────────────────────

  /** Set the sync point as an offset from the region start. */
  public setSyncPosition(offset: FrameCount): void {
    this.syncPosition = offset;
  }

  /** Clear the sync point. */
  public clearSyncPosition(): void {
    this.syncPosition = null;
  }

  /**
   * Get the sync offset. Returns 0 if no sync point is set.
   */
  public getSyncOffset(): FrameCount {
    return this.syncPosition ?? 0;
  }

  /**
   * Adjust a frame position by the sync offset.
   * Useful for snap-to-grid alignment: if the region has a sync point,
   * the snap target should account for this offset.
   */
  public adjustToSync(frame: FrameCount): FrameCount {
    return frame - this.getSyncOffset();
  }

  // ─── C-4: Region Equivalence & Grouping ──────────────────────────────────

  /**
   * True if both regions reference the same source, have the same position,
   * length, and source start.
   */
  public exactEquivalent(other: Region): boolean {
    return (
      this.sourceId === other.sourceId &&
      this.start === other.start &&
      this.length === other.length &&
      this.sourceStart === other.sourceStart
    );
  }

  /** True if both regions reference the same source file. */
  public sourceEquivalent(other: Region): boolean {
    return this.sourceId === other.sourceId;
  }

  /** True if the two regions overlap in time. */
  public overlapEquivalent(other: Region): boolean {
    return this.start < other.end && other.start < this.end;
  }

  /** True if the two regions share the same layer and overlap in time. */
  public layerAndTimeEquivalent(other: Region): boolean {
    return this.layer === other.layer && this.overlapEquivalent(other);
  }

  // ─── C-6: Transient helpers ──────────────────────────────────────────────

  /** Add a transient at the given frame position. Keeps the list sorted. */
  public addTransient(frame: FrameCount): void {
    // Avoid duplicates
    if (this.transients.includes(frame)) return;
    this.transients.push(frame);
    this.transients.sort((a, b) => a - b);
  }

  /** Remove the transient at the given frame position (if present). */
  public removeTransient(frame: FrameCount): void {
    const idx = this.transients.indexOf(frame);
    if (idx !== -1) {
      this.transients.splice(idx, 1);
    }
  }

  /** Get a readonly copy of the transient positions. */
  public getTransients(): ReadonlyArray<FrameCount> {
    return this.transients;
  }

  /** Whether this region has any detected/manual transients. */
  public hasTransients(): boolean {
    return this.transients.length > 0;
  }

  // ─── Region FX (Per-Region Plugin Chain) ────────────────────────────────

  /** Add a processor to the region's FX chain. */
  public addRegionFx(processor: Processor): void {
    this._regionFx.push(processor);
    this.regionFxAdded.emit(processor);
  }

  /** Remove a processor from the region's FX chain by its ID. */
  public removeRegionFx(processorId: string): void {
    const idx = this._regionFx.findIndex((p) => p.id === processorId);
    if (idx === -1) return;
    const [removed] = this._regionFx.splice(idx, 1);
    this.regionFxRemoved.emit(removed);
  }

  /** Get a readonly copy of the region's FX chain. */
  public getRegionFx(): Processor[] {
    return [...this._regionFx];
  }

  /** Move a processor to a new index in the FX chain. */
  public moveRegionFx(processorId: string, newIndex: number): void {
    const idx = this._regionFx.findIndex((p) => p.id === processorId);
    if (idx === -1) return;
    const clamped = Math.max(0, Math.min(newIndex, this._regionFx.length - 1));
    const [processor] = this._regionFx.splice(idx, 1);
    this._regionFx.splice(clamped, 0, processor);
  }

  /** Remove all processors from the region's FX chain. */
  public clearRegionFx(): void {
    const removed = [...this._regionFx];
    this._regionFx = [];
    for (const processor of removed) {
      this.regionFxRemoved.emit(processor);
    }
  }

  /** Whether this region has any FX processors. */
  public hasRegionFx(): boolean {
    return this._regionFx.length > 0;
  }

  // ─── Ancestral Tracking (Undo) ──────────────────────────────────────────

  /** Get the ancestral start position (before any edits). */
  public getAncestralStart(): number | undefined {
    return this._ancestralStart;
  }

  /** Get the ancestral length (before any edits). */
  public getAncestralLength(): number | undefined {
    return this._ancestralLength;
  }

  /** Set the ancestral data for undo tracking. */
  public setAncestralData(start: number, length: number): void {
    this._ancestralStart = start;
    this._ancestralLength = length;
  }

  // ─── Enhanced Lock Types ────────────────────────────────────────────────

  /** Whether the region's position is locked (cannot be moved). */
  public isPositionLocked(): boolean {
    return this._positionLocked;
  }

  /** Set the position lock state. */
  public setPositionLocked(locked: boolean): void {
    this._positionLocked = locked;
  }

  /** Whether the region is video-locked (synced to video timeline). */
  public isVideoLocked(): boolean {
    return this._videoLocked;
  }

  /** Set the video lock state. */
  public setVideoLocked(locked: boolean): void {
    this._videoLocked = locked;
  }
}
