import {
  RegionMoveRequest,
  RegionMoveService,
} from "../../domain/RegionMoveService";
import type { Playlist } from "../../domain/Playlist";
import {
  capturePlaylistEditState,
  createPlaylistEditTransaction,
} from "./PlaylistEditHistory";
import type { UndoTransaction } from "../UndoTransaction";

export function moveRegionAndCreateTransaction(
  request: RegionMoveRequest,
): UndoTransaction {
  const playlists = resolveAffectedPlaylists(request);
  const before = capturePlaylistEditState(playlists);

  RegionMoveService.move(request);

  const after = capturePlaylistEditState(playlists);
  return createPlaylistEditTransaction("MoveRegion", before, after);
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
