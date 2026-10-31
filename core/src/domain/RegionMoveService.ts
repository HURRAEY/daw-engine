import { CrossfadeEngine } from "./CrossfadeEngine";
import { Session } from "./Session";
import { FrameCount, RegionId, TrackId } from "./types";

export interface RegionMoveRequest {
  session: Session;
  trackId: TrackId;
  regionId: RegionId;
  newStart: FrameCount;
  targetTrackId?: TrackId;
}

export class RegionMoveService {
  public static move(request: RegionMoveRequest): void {
    const { session, trackId, regionId, newStart } = request;
    const targetTrackId = request.targetTrackId ?? trackId;
    const sourceTrack = session.getTrack(trackId);
    if (!sourceTrack) {
      throw new Error(`Track ${trackId} not found`);
    }

    const targetTrack = session.getTrack(targetTrackId);
    if (!targetTrack) {
      throw new Error(`Target track ${targetTrackId} not found`);
    }

    const region = sourceTrack.playlist.getRegion(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }

    const oldStart = region.start;
    const isCrossTrack = targetTrackId !== trackId;

    sourceTrack.playlist.removeRegion(regionId);

    if (!isCrossTrack && session.rippleEdit) {
      const delta = newStart - oldStart;
      if (delta > 0) {
        sourceTrack.playlist.rippleShift(newStart, delta);
      } else if (delta < 0) {
        sourceTrack.playlist.rippleShift(oldStart + region.length, delta);
      }
    }

    region.move(newStart);
    targetTrack.playlist.addRegion(region);

    CrossfadeEngine.calculateCrossfades([...sourceTrack.playlist.getRegions()]);
    if (isCrossTrack) {
      CrossfadeEngine.calculateCrossfades([
        ...targetTrack.playlist.getRegions(),
      ]);
    }
  }
}
