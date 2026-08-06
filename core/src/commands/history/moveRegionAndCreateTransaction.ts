import {
  RegionMoveRequest,
  RegionMoveService,
} from "../../domain/RegionMoveService";
import type { Playlist } from "../../domain/Playlist";
import { UndoTransaction } from "../UndoTransaction";
import {
  capturePlaylistStates,
  PlaylistStateDiffCommand,
} from "../state/PlaylistStateDiffCommand";
import {
  captureRegionStates,
  RegionStateDiffCommand,
} from "../state/RegionStateDiffCommand";

export function moveRegionAndCreateTransaction(
  request: RegionMoveRequest,
): UndoTransaction {
  const playlists = resolveAffectedPlaylists(request);
  const beforeRegions = captureRegionStates(playlists);
  const beforePlaylists = capturePlaylistStates(playlists);

  RegionMoveService.move(request);

  const afterRegions = captureRegionStates(playlists);
  const afterPlaylists = capturePlaylistStates(playlists);
  const transaction = new UndoTransaction("MoveRegion");

  // Undo는 Region 상태를 먼저 되돌리고 Playlist 소속과 Crossfade를 복원해야 합니다.
  transaction.addCommand(
    new PlaylistStateDiffCommand(beforePlaylists, afterPlaylists),
  );
  transaction.addCommand(
    new RegionStateDiffCommand(playlists, beforeRegions, afterRegions),
  );

  return transaction;
}

function resolveAffectedPlaylists(
  request: RegionMoveRequest,
): ReadonlyArray<Playlist> {
  const sourceTrack = request.session.getTrack(request.trackId);
  if (!sourceTrack) {
    throw new Error(`Track ${request.trackId} not found`);
  }

  const targetTrackId = request.targetTrackId ?? request.trackId;
  const targetTrack = request.session.getTrack(targetTrackId);
  if (!targetTrack) {
    throw new Error(`Target track ${targetTrackId} not found`);
  }

  if (sourceTrack === targetTrack) {
    return [sourceTrack.playlist];
  }
  return [sourceTrack.playlist, targetTrack.playlist];
}

export type { RegionMoveRequest };
