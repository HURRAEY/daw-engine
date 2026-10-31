import { describe, expect, it } from "vitest";

import { RecordMode } from "./RecordMode";
import { Region } from "./Region";
import { Session } from "./Session";
import { TrackType } from "./Track";

describe("Session layer mode serialization", () => {
  it("Track RecordMode와 Region opaque를 저장하고 복원한다", () => {
    const session = new Session("test");
    const track = session.addTrack("track", TrackType.AUDIO, "track");
    track.setRecordMode(RecordMode.SOUND_ON_SOUND);
    const region = new Region("region", "source", 0, 100, 0, "region");
    region.opaque = false;
    track.playlist.addRegion(region);

    const restored = Session.fromJSON(session.toJSON());
    const restoredTrack = restored.getTrack(track.id);
    const restoredRegion = restoredTrack?.playlist.getRegion(region.id);

    expect(restoredTrack?.recordMode).toBe(RecordMode.SOUND_ON_SOUND);
    expect(restoredRegion?.opaque).toBe(false);
  });
});
