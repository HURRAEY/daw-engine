import type { UndoableCommand } from "../Command";
import type { Playlist } from "../../domain/Playlist";
import type { Region } from "../../domain/Region";
import type { FadeShape } from "../../domain/FadeEnvelope";
import type { TimeDomain } from "../../domain/temporal/types";

export interface RegionStateSnapshot {
  region: Region;
  start: number;
  length: number;
  sourceStart: number;
  gain: number;
  muted: boolean;
  layer: number;
  opaque: boolean;
  fadeIn: number;
  fadeOut: number;
  fadeInShape: FadeShape;
  fadeOutShape: FadeShape;
  playbackRate: number;
  stretch: number;
  pitchSemitones: number;
  syncPosition: number | null;
  transients: number[];
  locked: boolean;
  timeDomain: TimeDomain;
}

export function captureRegionStates(
  playlists: ReadonlyArray<Playlist>,
): RegionStateSnapshot[] {
  const states = new Map<Region, RegionStateSnapshot>();

  for (const playlist of playlists) {
    for (const region of playlist.getRegions()) {
      states.set(region, {
        region,
        start: region.start,
        length: region.length,
        sourceStart: region.sourceStart,
        gain: region.gain,
        muted: region.muted,
        layer: region.layer,
        opaque: region.opaque,
        fadeIn: region.fadeIn,
        fadeOut: region.fadeOut,
        fadeInShape: region.fadeInShape,
        fadeOutShape: region.fadeOutShape,
        playbackRate: region.playbackRate,
        stretch: region.stretch,
        pitchSemitones: region.pitchSemitones,
        syncPosition: region.syncPosition,
        transients: [...region.transients],
        locked: region.locked,
        timeDomain: region.timeDomain,
      });
    }
  }

  return Array.from(states.values());
}

export class RegionStateDiffCommand implements UndoableCommand {
  public constructor(
    private readonly playlists: ReadonlyArray<Playlist>,
    private readonly before: ReadonlyArray<RegionStateSnapshot>,
    private readonly after: ReadonlyArray<RegionStateSnapshot>,
  ) {}

  public async execute(): Promise<void> {
    this.apply(this.after);
  }

  public async undo(): Promise<void> {
    this.apply(this.before);
  }

  public async redo(): Promise<void> {
    this.apply(this.after);
  }

  private apply(states: ReadonlyArray<RegionStateSnapshot>): void {
    for (const state of states) {
      const { region } = state;
      region.start = state.start;
      region.length = state.length;
      region.sourceStart = state.sourceStart;
      region.gain = state.gain;
      region.muted = state.muted;
      region.layer = state.layer;
      region.opaque = state.opaque;
      region.fadeIn = state.fadeIn;
      region.fadeOut = state.fadeOut;
      region.fadeInShape = state.fadeInShape;
      region.fadeOutShape = state.fadeOutShape;
      region.playbackRate = state.playbackRate;
      region.stretch = state.stretch;
      region.pitchSemitones = state.pitchSemitones;
      region.syncPosition = state.syncPosition;
      region.transients = [...state.transients];
      region.locked = state.locked;
      region.timeDomain = state.timeDomain;

      const currentPlaylist = this.playlists.find(
        (playlist) => playlist.getRegion(region.id) === region,
      );
      currentPlaylist?.notifyRegionChanged(region);
    }
  }
}
