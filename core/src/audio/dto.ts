import { RegionId, SourceId, FrameCount } from "../domain/types";
import { TimeDomain } from "../domain/temporal/types";

export interface RegionDTO {
  id: RegionId;
  sourceId: SourceId;
  start: FrameCount;
  length: FrameCount;
  end: FrameCount; // Computed property, essential for Worklet
  sourceStart: FrameCount;
  name: string;
  gain: number;
  muted: boolean;
  layer: number;
  /** false면 아래 Layer와 함께 재생합니다. 생략하면 true로 처리합니다. */
  opaque?: boolean;
  fadeIn: FrameCount;
  fadeOut: FrameCount;
  playbackRate: number;
  /** Pitch-preserving time stretch ratio (1.0 = normal) */
  stretch: number;
  /** Pitch shift in semitones (0 = no shift) */
  pitchSemitones: number;
  timeDomain: TimeDomain;
}

export interface TrackDTO {
  id: string;
  gain: number;
  pan: number;
  regions: RegionDTO[];
}

export interface MidiNoteDTO {
  id: string;
  pitch: number; // 0-127
  velocity: number; // 0-127
  startFrame: number; // relative to region start
  durationFrames: number;
  channel: number; // 0-15
}

export interface MidiRegionDTO {
  id: string;
  name: string;
  start: number; // region start in frames (timeline position)
  length: number; // region length in frames
  end: number; // computed: start + length
  muted: boolean;
  notes: MidiNoteDTO[];
}

export interface AudioWorkletMessage {
  type: string;
  payload?: Record<string, unknown>;
}
