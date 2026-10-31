import { afterEach, describe, expect, it, vi } from "vitest";
import { Region, Session, Source, TrackType } from "./domain-entry";

afterEach(() => vi.unstubAllGlobals());

describe("platform-independent domain entry", () => {
  it("creates and snapshots audio tracks without browser audio or storage globals", () => {
    for (const name of ["window", "document", "indexedDB", "AudioContext"]) {
      vi.stubGlobal(name, undefined);
    }
    const session = new Session("Native recording", "session", 48000);
    const source = new Source("voice", "Voice", "asset:voice", 48000, 48000, 1);
    session.addSource(source);
    const track = session.addTrack("Voice", TrackType.AUDIO, "track");
    track.playlist.addRegion(
      new Region("region", source.id, 0, 48000, 0, "Voice"),
    );

    expect(session.toJSON().sources?.[0]?.url).toBe("asset:voice");
    expect(track.playlist.getRegions()[0]?.length).toBe(48000);
  });
});
