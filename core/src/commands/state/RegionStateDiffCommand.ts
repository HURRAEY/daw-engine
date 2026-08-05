import type { UndoableCommand } from "../Command";
import type { Playlist } from "../../domain/Playlist";
import type { Region } from "../../domain/Region";
import type { FadeShape } from "../../domain/FadeEnvelope";

export interface RegionStateSnapshot {
  region: Region;
  start: number;
  layer: number;
  fadeIn: number;
  fadeOut: number;
  fadeInShape: FadeShape;
  fadeOutShape: FadeShape;
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
        layer: region.layer,
        fadeIn: region.fadeIn,
        fadeOut: region.fadeOut,
        fadeInShape: region.fadeInShape,
        fadeOutShape: region.fadeOutShape,
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
      region.move(state.start);
      region.layer = state.layer;
      region.fadeIn = state.fadeIn;
      region.fadeOut = state.fadeOut;
      region.fadeInShape = state.fadeInShape;
      region.fadeOutShape = state.fadeOutShape;

      const currentPlaylist = this.playlists.find(
        (playlist) => playlist.getRegion(region.id) === region,
      );
      currentPlaylist?.notifyRegionChanged(region);
    }
  }
}
