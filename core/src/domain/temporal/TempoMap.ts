import { Beats, TimeDomain, TimePosition, TICKS_PER_BEAT } from "./types";
import { FrameCount } from "../types";
import { Signal } from "../../lib/Signal";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single tempo/time-signature change event in the tempo map.
 */
export interface TempoEvent {
  /** Position in frames */
  frame: number;
  /** Tempo at this point (BPM) */
  bpm: number;
  /** Time signature numerator (optional, inherits previous if unset) */
  timeSigNum?: number;
  /** Time signature denominator (optional, inherits previous if unset) */
  timeSigDen?: number;
}

/**
 * A meter (time signature) change event, stored independently from tempo events.
 */
export interface MeterEvent {
  /** Position in frames */
  frame: number;
  /** Number of beats per bar (time signature numerator) */
  beatsPerBar: number;
  /** Beat value that gets one beat (time signature denominator, e.g. 4 = quarter note) */
  beatValue: number;
}

/**
 * Bar/Beat/Tick representation of a musical position.
 * Tick resolution is 1920 ticks per beat.
 */
export interface BBT {
  /** Bar number (1-based) */
  bar: number;
  /** Beat within bar (1-based) */
  beat: number;
  /** Tick within beat (0-based, 0..1919) */
  tick: number;
}

/**
 * Subdivision types for grid calculations.
 */
export type SubdivisionType =
  | "bar"
  | "beat"
  | "half"
  | "quarter"
  | "eighth"
  | "sixteenth"
  | "triplet"
  | "dotted";

/**
 * Combined tempo and meter information at a point in time.
 */
export interface TempoAndMeter {
  bpm: number;
  beatsPerBar: number;
  beatValue: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Binary search: find the index of the last element whose `frame` is <= the target frame.
 * Returns -1 if no element satisfies the condition.
 */
function findSegmentIndex<T extends { frame: number }>(
  events: T[],
  frame: number,
): number {
  let lo = 0;
  let hi = events.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].frame <= frame) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * Binary search: find the index of an element with exactly the given frame.
 * Returns -1 if not found.
 */
function findExactIndex<T extends { frame: number }>(
  events: T[],
  frame: number,
): number {
  let lo = 0;
  let hi = events.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].frame === frame) {
      return mid;
    } else if (events[mid].frame < frame) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return -1;
}

// ─── TempoMap ────────────────────────────────────────────────────────────────

/**
 * TempoMap handles conversion between AudioTime (samples/frames) and BeatTime (beats/ticks).
 * Supports multiple tempo and meter changes over the timeline.
 *
 * Features:
 * - Dual domain support (AudioTime / BeatTime)
 * - Independent tempo and meter event lists
 * - Bar/Beat/Tick (BBT) conversions with 1920 ticks-per-beat resolution
 * - Grid point generation with subdivision and swing support
 * - Region repositioning on tempo change
 * - Binary search for efficient segment lookup
 */
export class TempoMap {
  private events: TempoEvent[] = [];
  private _meterEvents: MeterEvent[] = [];

  /** Fires after any modification to the tempo map (add/remove tempo or meter changes). */
  public readonly changed = new Signal<void>();

  /**
   * Fires after a tempo value has been modified, providing the frame at which the change occurred.
   * Useful for repositioning regions or cursors after a tempo edit.
   */
  public readonly onTempoChanged = new Signal<{
    frame: number;
    oldBpm: number;
    newBpm: number;
  }>();

  constructor(private sampleRate: number = 44100) {
    // Initialize with default 120 BPM at frame 0
    this.events.push({ frame: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 });
    // Initialize with default 4/4 meter at frame 0
    this._meterEvents.push({ frame: 0, beatsPerBar: 4, beatValue: 4 });
  }

  public restoreFrom(source: TempoMap): void {
    this.sampleRate = source.sampleRate;
    this.events = source.events.map((event) => ({ ...event }));
    this._meterEvents = source._meterEvents.map((event) => ({ ...event }));
    this.changed.emit();
  }

  // ─── Tempo Events ────────────────────────────────────────────────────────

  /**
   * Add or update a tempo change at the given frame position.
   * If a tempo change already exists at the exact frame, it is updated.
   */
  addTempoChange(
    frame: number,
    bpm: number,
    timeSigNum?: number,
    timeSigDen?: number,
  ): void {
    if (bpm <= 0) return;

    const idx = findExactIndex(this.events, frame);
    if (idx !== -1) {
      const oldBpm = this.events[idx].bpm;
      this.events[idx].bpm = bpm;
      if (timeSigNum !== undefined) this.events[idx].timeSigNum = timeSigNum;
      if (timeSigDen !== undefined) this.events[idx].timeSigDen = timeSigDen;
      this.changed.emit();
      if (oldBpm !== bpm) {
        this.onTempoChanged.emit({ frame, oldBpm, newBpm: bpm });
      }
    } else {
      this.events.push({ frame, bpm, timeSigNum, timeSigDen });
      this.events.sort((a, b) => a.frame - b.frame);
      this.changed.emit();
      this.onTempoChanged.emit({
        frame,
        oldBpm: this.getTempoAtFrame(frame),
        newBpm: bpm,
      });
    }
  }

  /**
   * Remove a tempo change at the given frame.
   * The initial event at frame 0 cannot be removed.
   */
  removeTempoChange(frame: number): void {
    if (frame === 0) return; // Cannot remove the initial tempo event
    const index = findExactIndex(this.events, frame);
    if (index !== -1) {
      this.events.splice(index, 1);
      this.changed.emit();
    }
  }

  /**
   * Get the tempo (BPM) at a given frame position.
   * Uses binary search for efficient lookup.
   */
  getTempoAtFrame(frame: number): number {
    const idx = findSegmentIndex(this.events, frame);
    return idx >= 0 ? this.events[idx].bpm : this.events[0].bpm;
  }

  /**
   * Get the time signature at a given frame position.
   * Returns [numerator, denominator].
   * Walks through tempo events that carry time signature overrides.
   */
  getTimeSignatureAtFrame(frame: number): [number, number] {
    let num = 4;
    let den = 4;
    // Walk tempo events for legacy time signature info
    const idx = findSegmentIndex(this.events, frame);
    for (let i = 0; i <= idx; i++) {
      if (this.events[i].timeSigNum !== undefined)
        num = this.events[i].timeSigNum!;
      if (this.events[i].timeSigDen !== undefined)
        den = this.events[i].timeSigDen!;
    }
    return [num, den];
  }

  /**
   * Get all tempo events, sorted by frame.
   */
  getAllEvents(): ReadonlyArray<TempoEvent> {
    return [...this.events];
  }

  // ─── Meter Events ────────────────────────────────────────────────────────

  /**
   * Add or update a meter (time signature) change at the given frame position.
   * If a meter change already exists at the exact frame, it is updated.
   *
   * @param frame - Frame position of the meter change
   * @param beatsPerBar - Number of beats per bar (time signature numerator)
   * @param beatValue - Note value that gets one beat (time signature denominator, e.g. 4 = quarter)
   */
  addMeterChange(frame: number, beatsPerBar: number, beatValue: number): void {
    if (beatsPerBar <= 0 || beatValue <= 0) return;

    const idx = findExactIndex(this._meterEvents, frame);
    if (idx !== -1) {
      this._meterEvents[idx].beatsPerBar = beatsPerBar;
      this._meterEvents[idx].beatValue = beatValue;
    } else {
      this._meterEvents.push({ frame, beatsPerBar, beatValue });
      this._meterEvents.sort((a, b) => a.frame - b.frame);
    }
    this.changed.emit();
  }

  /**
   * Remove a meter change at the given frame.
   * The initial meter event at frame 0 cannot be removed.
   *
   * @param frame - Frame position of the meter change to remove
   */
  removeMeterChange(frame: number): void {
    if (frame === 0) return;
    const idx = findExactIndex(this._meterEvents, frame);
    if (idx !== -1) {
      this._meterEvents.splice(idx, 1);
      this.changed.emit();
    }
  }

  /**
   * Get the meter (time signature) at a given frame position.
   * Uses binary search for efficient lookup.
   *
   * @param frame - Frame position to query
   * @returns The active MeterEvent at the given frame
   */
  getMeterAt(frame: number): MeterEvent {
    const idx = findSegmentIndex(this._meterEvents, frame);
    if (idx >= 0) {
      return { ...this._meterEvents[idx] };
    }
    return { ...this._meterEvents[0] };
  }

  /**
   * Get all meter events, sorted by frame.
   */
  getAllMeterEvents(): ReadonlyArray<MeterEvent> {
    return [...this._meterEvents];
  }

  /**
   * Get combined tempo and meter information at a given frame position.
   * Convenience method that returns both BPM and time signature data.
   *
   * @param frame - Frame position to query
   * @returns Combined tempo and meter data
   */
  getTempoAndMeterAt(frame: number): TempoAndMeter {
    const bpm = this.getTempoAtFrame(frame);
    const meter = this.getMeterAt(frame);
    return {
      bpm,
      beatsPerBar: meter.beatsPerBar,
      beatValue: meter.beatValue,
    };
  }

  // ─── Frame / Seconds Conversion ──────────────────────────────────────────

  /**
   * Convert frames to seconds, accounting for tempo changes across the timeline.
   * Integrates the duration of each tempo segment.
   */
  framesToSeconds(frames: FrameCount, sampleRate?: number): number {
    const sr = sampleRate ?? this.sampleRate;
    if (this.events.length <= 1) {
      return frames / sr;
    }

    let remaining = frames;
    let seconds = 0;

    for (let i = 0; i < this.events.length && remaining > 0; i++) {
      const segmentStart = this.events[i].frame;
      const segmentEnd =
        i + 1 < this.events.length ? this.events[i + 1].frame : Infinity;
      const segmentFrames = Math.min(remaining, segmentEnd - segmentStart);

      if (segmentFrames <= 0) continue;

      seconds += segmentFrames / sr;
      remaining -= segmentFrames;
    }

    return seconds;
  }

  /**
   * Convert seconds to frames, accounting for tempo changes across the timeline.
   */
  secondsToFrames(seconds: number, sampleRate?: number): FrameCount {
    const sr = sampleRate ?? this.sampleRate;
    return Math.round(seconds * sr);
  }

  // ─── Absolute Beat / Frame Conversion ────────────────────────────────────

  /**
   * Convert a frame position to an absolute beat count from the start of the timeline,
   * accounting for ALL tempo changes along the way.
   *
   * For each tempo segment, the number of beats is calculated as:
   *   beats = (segmentFrames / sampleRate) * (bpm / 60)
   *
   * @param frame - Frame position to convert
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Absolute beat count from frame 0
   */
  framesToBeatsAbsolute(frame: number, sampleRate?: number): number {
    const sr = sampleRate ?? this.sampleRate;
    let remaining = frame;
    let totalBeats = 0;

    for (let i = 0; i < this.events.length && remaining > 0; i++) {
      const segmentEnd =
        i + 1 < this.events.length
          ? this.events[i + 1].frame - this.events[i].frame
          : Infinity;
      const segmentFrames = Math.min(remaining, segmentEnd);
      if (segmentFrames <= 0) continue;

      const bpm = this.events[i].bpm;
      const segmentSeconds = segmentFrames / sr;
      totalBeats += segmentSeconds * (bpm / 60);
      remaining -= segmentFrames;
    }

    return totalBeats;
  }

  /**
   * Convert an absolute beat count from the start of the timeline to a frame position,
   * accounting for ALL tempo changes along the way.
   *
   * Inverse of `framesToBeatsAbsolute`.
   *
   * @param beats - Absolute beat count from the start
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Frame position
   */
  beatsToFramesAbsolute(beats: number, sampleRate?: number): number {
    const sr = sampleRate ?? this.sampleRate;
    let remainingBeats = beats;
    let totalFrames = 0;

    for (let i = 0; i < this.events.length && remainingBeats > 0; i++) {
      const bpm = this.events[i].bpm;
      const segmentEnd =
        i + 1 < this.events.length
          ? this.events[i + 1].frame - this.events[i].frame
          : Infinity;

      // Max beats this segment can accommodate
      const segmentMaxBeats = (segmentEnd / sr) * (bpm / 60);
      const beatsInSegment = Math.min(remainingBeats, segmentMaxBeats);
      const framesForBeats = (beatsInSegment / (bpm / 60)) * sr;

      totalFrames += framesForBeats;
      remainingBeats -= beatsInSegment;
    }

    return Math.round(totalFrames);
  }

  // ─── BBT (Bar/Beat/Tick) Conversion ──────────────────────────────────────

  /**
   * Convert a frame position to Bar/Beat/Tick notation.
   *
   * Walks through tempo and meter segments to calculate the cumulative
   * bar, beat, and tick position. Uses 1920 ticks per beat.
   *
   * @param frame - Frame position to convert
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns BBT position (bars and beats are 1-based, ticks are 0-based)
   */
  framesToBBT(frame: number, sampleRate?: number): BBT {
    const sr = sampleRate ?? this.sampleRate;
    const totalBeats = this.framesToBeatsAbsolute(frame, sr);

    // Walk through meter events to convert absolute beats to BBT.
    // We need to figure out how many beats fall in each meter segment.
    let remainingBeats = totalBeats;
    let bar = 1;

    // Compute beat boundaries for meter segments
    // Each meter segment starts at a certain absolute beat count
    const meterBeatStarts = this._computeMeterBeatStarts(sr);

    for (let i = 0; i < this._meterEvents.length; i++) {
      const meter = this._meterEvents[i];
      const meterStart = meterBeatStarts[i];
      const meterEnd =
        i + 1 < meterBeatStarts.length ? meterBeatStarts[i + 1] : Infinity;

      // Effective beats per bar, adjusted for beat value.
      // If beatValue = 8 (eighth notes), each "beat" in the bar is half a quarter note.
      // We normalize to quarter-note beats: beatsPerBar * (4 / beatValue)
      const quarterBeatsPerBar = meter.beatsPerBar * (4 / meter.beatValue);

      const beatsInThisSegment = Math.min(
        remainingBeats,
        meterEnd - meterStart,
      );
      if (beatsInThisSegment <= 0) continue;

      const fullBars = Math.floor(beatsInThisSegment / quarterBeatsPerBar);
      const leftover = beatsInThisSegment - fullBars * quarterBeatsPerBar;

      if (remainingBeats <= meterEnd - meterStart) {
        // We land in this segment
        bar += fullBars;
        // leftover is fractional beats within the current bar
        const beatInBar = Math.floor(leftover) + 1;
        const fractionalBeat = leftover - Math.floor(leftover);
        const tick = Math.round(fractionalBeat * TICKS_PER_BEAT);
        return { bar, beat: beatInBar, tick };
      }

      bar += fullBars;
      // If there's leftover when moving to next segment, it means incomplete bar
      // For simplicity, we only add full bars and carry the remainder
      remainingBeats -= beatsInThisSegment;
    }

    // Fallback: should not normally reach here
    return { bar: 1, beat: 1, tick: 0 };
  }

  /**
   * Convert Bar/Beat/Tick notation to a frame position.
   *
   * @param bar - Bar number (1-based)
   * @param beat - Beat within bar (1-based)
   * @param tick - Tick within beat (0-based, 0..1919)
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Frame position
   */
  bbtToFrames(
    bar: number,
    beat: number,
    tick: number,
    sampleRate?: number,
  ): number {
    const sr = sampleRate ?? this.sampleRate;

    // Convert BBT to absolute beats, then to frames
    const meterBeatStarts = this._computeMeterBeatStarts(sr);
    let targetBeats = 0;

    // Walk meters to accumulate beats up to the requested bar/beat/tick
    let currentBar = 1;

    for (let i = 0; i < this._meterEvents.length; i++) {
      const meter = this._meterEvents[i];
      const meterEnd =
        i + 1 < meterBeatStarts.length ? meterBeatStarts[i + 1] : Infinity;
      const segmentBeats = meterEnd - meterBeatStarts[i];

      const quarterBeatsPerBar = meter.beatsPerBar * (4 / meter.beatValue);

      // How many full bars fit in this meter segment
      const fullBarsInSegment = isFinite(segmentBeats)
        ? Math.floor(segmentBeats / quarterBeatsPerBar)
        : Infinity;

      const barsNeeded = bar - currentBar;

      if (barsNeeded < fullBarsInSegment || !isFinite(fullBarsInSegment)) {
        // Target bar is within this meter segment
        targetBeats =
          meterBeatStarts[i] +
          barsNeeded * quarterBeatsPerBar +
          (beat - 1) +
          tick / TICKS_PER_BEAT;
        return this.beatsToFramesAbsolute(targetBeats, sr);
      }

      // Skip past this meter segment
      currentBar += fullBarsInSegment;
      targetBeats = meterBeatStarts[i] + fullBarsInSegment * quarterBeatsPerBar;
    }

    // Fallback
    return this.beatsToFramesAbsolute(targetBeats, sr);
  }

  /**
   * Compute the absolute beat position at which each meter event begins.
   * This integrates tempo across the timeline to find beat offsets for each meter point.
   */
  private _computeMeterBeatStarts(sr: number): number[] {
    const starts: number[] = [];
    for (let i = 0; i < this._meterEvents.length; i++) {
      starts.push(this.framesToBeatsAbsolute(this._meterEvents[i].frame, sr));
    }
    return starts;
  }

  // ─── Grid Points & Snapping ──────────────────────────────────────────────

  /**
   * Returns the number of quarter-note beats per subdivision unit.
   * For example, 'eighth' = 0.5 beats, 'bar' depends on current meter.
   */
  private _subdivisionToBeats(
    subdivisionType: SubdivisionType,
    beatsPerBar: number,
    beatValue: number,
  ): number {
    const quarterBeatsPerBar = beatsPerBar * (4 / beatValue);
    switch (subdivisionType) {
      case "bar":
        return quarterBeatsPerBar;
      case "beat":
        return 1;
      case "half":
        return 2;
      case "quarter":
        return 1;
      case "eighth":
        return 0.5;
      case "sixteenth":
        return 0.25;
      case "triplet":
        return 1 / 3;
      case "dotted":
        return 1.5;
      default:
        return 1;
    }
  }

  /**
   * Generate grid points between two frame positions for a given subdivision type.
   *
   * Walks through tempo and meter segments, generating evenly spaced grid points
   * according to the active tempo and subdivision at each point.
   *
   * @param startFrame - Start of the range (inclusive)
   * @param endFrame - End of the range (inclusive)
   * @param subdivisionType - Grid subdivision type
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Array of frame positions for grid points within the range
   */
  getGridPoints(
    startFrame: number,
    endFrame: number,
    subdivisionType: SubdivisionType,
    sampleRate?: number,
  ): number[] {
    const sr = sampleRate ?? this.sampleRate;
    const points: number[] = [];

    if (startFrame >= endFrame) return points;

    // Convert start to absolute beats, quantize to subdivision, then walk forward
    const startBeats = this.framesToBeatsAbsolute(startFrame, sr);
    const meter = this.getMeterAt(startFrame);
    const subBeats = this._subdivisionToBeats(
      subdivisionType,
      meter.beatsPerBar,
      meter.beatValue,
    );

    // Quantize start to the nearest grid line at or before startFrame
    const firstGridBeat = Math.ceil(startBeats / subBeats) * subBeats;

    let currentBeat = firstGridBeat;
    // Safety limit: avoid infinite loops
    const maxIterations = 1_000_000;
    let iterations = 0;

    while (iterations++ < maxIterations) {
      const frame = this.beatsToFramesAbsolute(currentBeat, sr);
      if (frame > endFrame) break;
      if (frame >= startFrame) {
        points.push(frame);
      }

      // Get meter at current frame to determine subdivision size
      const currentMeter = this.getMeterAt(frame);
      const currentSubBeats = this._subdivisionToBeats(
        subdivisionType,
        currentMeter.beatsPerBar,
        currentMeter.beatValue,
      );
      currentBeat += currentSubBeats;
    }

    return points;
  }

  /**
   * Snap a frame position to the nearest grid point for the given subdivision type.
   *
   * @param frame - Frame position to snap
   * @param subdivisionType - Grid subdivision type
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns The nearest grid-aligned frame position
   */
  snapToGrid(
    frame: number,
    subdivisionType: SubdivisionType,
    sampleRate?: number,
  ): number {
    const sr = sampleRate ?? this.sampleRate;
    const meter = this.getMeterAt(frame);
    const subBeats = this._subdivisionToBeats(
      subdivisionType,
      meter.beatsPerBar,
      meter.beatValue,
    );

    const beats = this.framesToBeatsAbsolute(frame, sr);
    const snappedBeats = Math.round(beats / subBeats) * subBeats;
    return this.beatsToFramesAbsolute(snappedBeats, sr);
  }

  /**
   * Generate a swing grid between two frame positions.
   *
   * Swing offsets every other grid point by shifting it forward in time.
   * A `swingAmount` of 0 produces a straight grid; 1 pushes the off-beat
   * to the maximum position (the next grid point).
   *
   * @param startFrame - Start of the range (inclusive)
   * @param endFrame - End of the range (inclusive)
   * @param subdivision - Grid subdivision type
   * @param swingAmount - Swing amount between 0 (straight) and 1 (max swing)
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Array of frame positions for the swing-adjusted grid
   */
  getSwingGrid(
    startFrame: number,
    endFrame: number,
    subdivision: SubdivisionType,
    swingAmount: number,
    sampleRate?: number,
  ): number[] {
    const sr = sampleRate ?? this.sampleRate;
    const clampedSwing = Math.max(0, Math.min(1, swingAmount));
    const straightPoints = this.getGridPoints(
      startFrame,
      endFrame,
      subdivision,
      sr,
    );

    if (clampedSwing === 0 || straightPoints.length < 2) {
      return straightPoints;
    }

    const result: number[] = [];
    for (let i = 0; i < straightPoints.length; i++) {
      if (i % 2 === 0) {
        // On-beat: unchanged
        result.push(straightPoints[i]);
      } else {
        // Off-beat: shift toward next on-beat
        const prev = straightPoints[i - 1];
        const next =
          i + 1 < straightPoints.length
            ? straightPoints[i + 1]
            : straightPoints[i] + (straightPoints[i] - prev);
        const interval = next - prev;
        // Normal position is at 50% of interval; swing shifts it toward next
        const swungOffset = (0.5 + clampedSwing * 0.5) * interval;
        const swungFrame = Math.round(prev + swungOffset);
        // Clamp to not exceed endFrame
        result.push(Math.min(swungFrame, endFrame));
      }
    }

    return result;
  }

  // ─── Region Repositioning ────────────────────────────────────────────────

  /**
   * Recalculate a frame position after a tempo change, preserving its musical position.
   *
   * When tempo changes from `oldTempo` to `newTempo`, a region that was at a certain
   * beat position should move to maintain the same musical position. This method
   * calculates the new frame position.
   *
   * @param frame - Original frame position
   * @param oldTempo - Previous tempo in BPM
   * @param newTempo - New tempo in BPM
   * @param sampleRate - Sample rate override (defaults to constructor value)
   * @returns Recalculated frame position
   */
  repositionFrameForTempoChange(
    frame: number,
    oldTempo: number,
    newTempo: number,
    sampleRate?: number,
  ): number {
    if (oldTempo <= 0 || newTempo <= 0) return frame;
    const sr = sampleRate ?? this.sampleRate;
    // The frame represents a musical position. At oldTempo, that frame
    // corresponds to a certain number of beats. At newTempo, those same
    // beats take a different number of frames.
    const seconds = frame / sr;
    const beats = (seconds * oldTempo) / 60;
    const newSeconds = (beats * 60) / newTempo;
    return Math.round(newSeconds * sr);
  }

  // ─── Frame / Seconds (Legacy) ────────────────────────────────────────────

  // ─── Legacy API (backward-compatible with constant-tempo callers) ─────────

  /** Convert beats to frames at given BPM */
  beatsToFrames(beats: Beats, bpm: number): FrameCount {
    const seconds = (beats.toNumber() / bpm) * 60;
    return Math.round(seconds * this.sampleRate);
  }

  /** Convert frames to beats at given BPM */
  framesToBeats(frames: FrameCount, bpm: number): Beats {
    const seconds = frames / this.sampleRate;
    const beatCount = (seconds / 60) * bpm;
    return new Beats(beatCount);
  }

  /** Convert TimePosition to frames */
  toFrames(pos: TimePosition, bpm: number): FrameCount {
    if (pos.domain === TimeDomain.AudioTime) {
      return pos.value;
    } else {
      return this.beatsToFrames(Beats.fromTicks(pos.value), bpm);
    }
  }

  /** Convert TimePosition to beats */
  toBeats(pos: TimePosition, bpm: number): Beats {
    if (pos.domain === TimeDomain.BeatTime) {
      return Beats.fromTicks(pos.value);
    } else {
      return this.framesToBeats(pos.value, bpm);
    }
  }
}
