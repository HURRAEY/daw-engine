import type { Playlist } from "../../domain/Playlist";
import { UndoTransaction } from "../UndoTransaction";
import {
  capturePlaylistStates,
  PlaylistStateDiffCommand,
  PlaylistStateSnapshot,
} from "../state/PlaylistStateDiffCommand";
import {
  captureRegionStates,
  RegionStateDiffCommand,
  RegionStateSnapshot,
} from "../state/RegionStateDiffCommand";

export interface PlaylistEditState {
  playlists: ReadonlyArray<Playlist>;
  regions: ReadonlyArray<RegionStateSnapshot>;
  playlistStates: ReadonlyArray<PlaylistStateSnapshot>;
}

export function capturePlaylistEditState(
  playlists: ReadonlyArray<Playlist>,
): PlaylistEditState {
  return {
    playlists,
    regions: captureRegionStates(playlists),
    playlistStates: capturePlaylistStates(playlists),
  };
}

export function createPlaylistEditTransaction(
  name: string,
  before: PlaylistEditState,
  after: PlaylistEditState,
): UndoTransaction {
  const transaction = new UndoTransaction(name);

  // Undo는 Region 속성을 먼저 되돌린 뒤 Playlist 소속과 Crossfade를 복원합니다.
  transaction.addCommand(
    new PlaylistStateDiffCommand(before.playlistStates, after.playlistStates),
  );
  transaction.addCommand(
    new RegionStateDiffCommand(after.playlists, before.regions, after.regions),
  );
  return transaction;
}

export function hasPlaylistMembershipChanged(
  before: PlaylistEditState,
  after: PlaylistEditState,
): boolean {
  for (const afterState of after.playlistStates) {
    const beforeState = before.playlistStates.find((state) => {
      return state.playlist === afterState.playlist;
    });
    if (
      !beforeState ||
      beforeState.regions.length !== afterState.regions.length
    ) {
      return true;
    }
    const beforeRegions = new Set(beforeState.regions);
    if (afterState.regions.some((region) => !beforeRegions.has(region))) {
      return true;
    }
  }
  return false;
}
