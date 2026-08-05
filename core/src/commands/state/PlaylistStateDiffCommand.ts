import type { UndoableCommand } from "../Command";
import {
  Crossfade,
  CrossfadeId,
  CrossfadeType,
  FadeCurve,
} from "../../domain/Crossfade";
import type { Playlist } from "../../domain/Playlist";
import type { Region } from "../../domain/Region";
import type { RegionId } from "../../domain/types";

interface CrossfadeStateSnapshot {
  id: CrossfadeId;
  inRegionId: RegionId;
  outRegionId: RegionId;
  position: number;
  length: number;
  type: CrossfadeType;
  fadeInCurve: FadeCurve;
  fadeOutCurve: FadeCurve;
  active: boolean;
}

export interface PlaylistStateSnapshot {
  playlist: Playlist;
  regions: ReadonlyArray<Region>;
  crossfades: ReadonlyArray<CrossfadeStateSnapshot>;
}

export function capturePlaylistStates(
  playlists: ReadonlyArray<Playlist>,
): PlaylistStateSnapshot[] {
  return playlists.map((playlist) => ({
    playlist,
    regions: [...playlist.getRegions()],
    crossfades: playlist.getCrossfades().map((crossfade) => ({
      id: crossfade.id,
      inRegionId: crossfade.inRegionId,
      outRegionId: crossfade.outRegionId,
      position: crossfade.position,
      length: crossfade.length,
      type: crossfade.type,
      fadeInCurve: crossfade.fadeInCurve,
      fadeOutCurve: crossfade.fadeOutCurve,
      active: crossfade.active,
    })),
  }));
}

export class PlaylistStateDiffCommand implements UndoableCommand {
  public constructor(
    private readonly before: ReadonlyArray<PlaylistStateSnapshot>,
    private readonly after: ReadonlyArray<PlaylistStateSnapshot>,
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

  private apply(states: ReadonlyArray<PlaylistStateSnapshot>): void {
    for (const state of states) {
      this.applyPlaylistState(state);
    }
  }

  private applyPlaylistState(state: PlaylistStateSnapshot): void {
    const { playlist } = state;
    const desiredRegions = new Set(state.regions);
    playlist.freeze();

    try {
      for (const currentRegion of [...playlist.getRegions()]) {
        if (!desiredRegions.has(currentRegion)) {
          playlist.removeRegion(currentRegion.id);
        }
      }

      for (const desiredRegion of state.regions) {
        const currentRegion = playlist.getRegion(desiredRegion.id);
        if (currentRegion === desiredRegion) {
          continue;
        }
        if (currentRegion) {
          playlist.removeRegion(currentRegion.id);
        }
        playlist.addRegion(desiredRegion);
      }

      for (const crossfade of [...playlist.getCrossfades()]) {
        playlist.removeCrossfade(crossfade.id);
      }
      for (const crossfadeState of state.crossfades) {
        playlist.addCrossfade(this.restoreCrossfade(crossfadeState));
      }
    } finally {
      playlist.thaw();
    }
  }

  private restoreCrossfade(state: CrossfadeStateSnapshot): Crossfade {
    const crossfade = new Crossfade(
      state.id,
      state.inRegionId,
      state.outRegionId,
      state.position,
      state.length,
      state.type,
      state.fadeInCurve,
      state.fadeOutCurve,
    );
    crossfade.setActive(state.active);
    return crossfade;
  }
}
