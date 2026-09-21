import { describe, expect, it, vi } from "vitest";
import { Region } from "../../domain/Region";
import { Session } from "../../domain/Session";
import { TrackType } from "../../domain/Track";
import { RegionId, SourceId, TrackId } from "../../domain/types";
import { SetRegionsGainCommand } from "./SetRegionsGainCommand";

const addRegion = (
  session: Session,
  trackId: TrackId,
  regionId: RegionId,
  gain: number,
): Region => {
  const track = session.getTrack(trackId);
  if (!track) {
    throw new Error(`Track ${trackId} not found`);
  }

  const region = new Region(
    regionId,
    "source-1" as SourceId,
    0,
    48_000,
    0,
    regionId,
  );
  region.gain = gain;
  track.playlist.addRegion(region);
  return region;
};

describe("SetRegionsGainCommand", () => {
  it("sets one region gain and supports undo and redo", async () => {
    const session = new Session("Region gain");
    const track = session.addTrack("Voice", TrackType.AUDIO);
    const region = addRegion(session, track.id, "region-1" as RegionId, 0.5);
    const command = new SetRegionsGainCommand(session, [
      { trackId: track.id, regionId: region.id, linearGain: 1.25 },
    ]);

    await command.execute();
    expect(region.gain).toBe(1.25);

    await command.undo();
    expect(region.gain).toBe(0.5);

    await command.redo();
    expect(region.gain).toBe(1.25);
  });

  it("changes multiple tracks atomically and emits once per track", async () => {
    const session = new Session("Multiple region gains");
    const firstTrack = session.addTrack("Voice", TrackType.AUDIO);
    const secondTrack = session.addTrack("Music", TrackType.AUDIO);
    const firstRegion = addRegion(
      session,
      firstTrack.id,
      "region-1" as RegionId,
      0.5,
    );
    const secondRegion = addRegion(
      session,
      firstTrack.id,
      "region-2" as RegionId,
      0.75,
    );
    const thirdRegion = addRegion(
      session,
      secondTrack.id,
      "region-3" as RegionId,
      1,
    );
    const firstTrackListener = vi.fn();
    const secondTrackListener = vi.fn();
    firstTrack.playlist.regionChanged.connect(firstTrackListener);
    secondTrack.playlist.regionChanged.connect(secondTrackListener);
    const command = new SetRegionsGainCommand(session, [
      { trackId: firstTrack.id, regionId: firstRegion.id, linearGain: 0.25 },
      { trackId: firstTrack.id, regionId: secondRegion.id, linearGain: 0.5 },
      { trackId: secondTrack.id, regionId: thirdRegion.id, linearGain: 1.5 },
    ]);

    await command.execute();

    expect(firstRegion.gain).toBe(0.25);
    expect(secondRegion.gain).toBe(0.5);
    expect(thirdRegion.gain).toBe(1.5);
    expect(firstTrackListener).toHaveBeenCalledTimes(1);
    expect(secondTrackListener).toHaveBeenCalledTimes(1);

    firstTrackListener.mockClear();
    secondTrackListener.mockClear();
    await command.undo();
    expect(firstTrackListener).toHaveBeenCalledTimes(1);
    expect(secondTrackListener).toHaveBeenCalledTimes(1);

    firstTrackListener.mockClear();
    secondTrackListener.mockClear();
    await command.redo();
    expect(firstTrackListener).toHaveBeenCalledTimes(1);
    expect(secondTrackListener).toHaveBeenCalledTimes(1);
  });

  it("does not change any region when a target does not exist", async () => {
    const session = new Session("Missing region");
    const track = session.addTrack("Voice", TrackType.AUDIO);
    const region = addRegion(session, track.id, "region-1" as RegionId, 0.5);
    const listener = vi.fn();
    track.playlist.regionChanged.connect(listener);
    const command = new SetRegionsGainCommand(session, [
      { trackId: track.id, regionId: region.id, linearGain: 1.25 },
      {
        trackId: track.id,
        regionId: "missing-region" as RegionId,
        linearGain: 2,
      },
    ]);

    await expect(command.execute()).rejects.toThrow("missing-region");
    expect(region.gain).toBe(0.5);
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.1])(
    "rejects invalid linear gain %s without partial changes",
    async invalidGain => {
      const session = new Session("Invalid gain");
      const track = session.addTrack("Voice", TrackType.AUDIO);
      const firstRegion = addRegion(
        session,
        track.id,
        "region-1" as RegionId,
        0.5,
      );
      const secondRegion = addRegion(
        session,
        track.id,
        "region-2" as RegionId,
        0.75,
      );
      const command = new SetRegionsGainCommand(session, [
        { trackId: track.id, regionId: firstRegion.id, linearGain: 1.25 },
        {
          trackId: track.id,
          regionId: secondRegion.id,
          linearGain: invalidGain,
        },
      ]);

      await expect(command.execute()).rejects.toThrow("linearGain");
      expect(firstRegion.gain).toBe(0.5);
      expect(secondRegion.gain).toBe(0.75);
    },
  );
});
