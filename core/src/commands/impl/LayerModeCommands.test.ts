import { describe, expect, it } from "vitest";

import { RecordMode } from "../../domain/RecordMode";
import { Region } from "../../domain/Region";
import { Session } from "../../domain/Session";
import { TrackType } from "../../domain/Track";
import { SetRegionLayerCommand } from "./SetRegionLayerCommand";
import { SetRegionOpaqueCommand } from "./SetRegionOpaqueCommand";
import { SetTrackRecordModeCommand } from "./SetTrackRecordModeCommand";

describe("Layer mode commands", () => {
  it("트랙 RecordMode 변경을 Undo와 Redo한다", async () => {
    const session = new Session("test");
    const track = session.addTrack("track", TrackType.AUDIO, "track");
    const command = new SetTrackRecordModeCommand(
      session,
      track.id,
      RecordMode.NON_LAYERED,
    );

    await command.execute();
    expect(track.recordMode).toBe(RecordMode.NON_LAYERED);
    await command.undo();
    expect(track.recordMode).toBe(RecordMode.LAYERED);
    await command.redo();
    expect(track.recordMode).toBe(RecordMode.NON_LAYERED);
  });

  it("Region Layer 변경을 Undo한다", async () => {
    const session = new Session("test");
    const track = session.addTrack("track", TrackType.AUDIO, "track");
    const region = new Region("region", "source", 0, 100, 0, "region");
    track.playlist.addRegion(region);
    const command = new SetRegionLayerCommand(session, track.id, region.id, 3);

    await command.execute();
    expect(region.layer).toBe(3);
    await command.undo();
    expect(region.layer).toBe(0);
  });

  it("Region 불투명도 변경을 Undo한다", async () => {
    const session = new Session("test");
    const track = session.addTrack("track", TrackType.AUDIO, "track");
    const region = new Region("region", "source", 0, 100, 0, "region");
    track.playlist.addRegion(region);
    const command = new SetRegionOpaqueCommand(
      session,
      track.id,
      region.id,
      false,
    );

    await command.execute();
    expect(region.opaque).toBe(false);
    await command.undo();
    expect(region.opaque).toBe(true);
  });
});
