import { describe, expect, it } from "vitest";
import { GainProcessor } from "../processing/GainProcessor";
import { Session, SessionSnapshot } from "./Session";
import { TrackType } from "./Track";
import { ProcessorId } from "./types";

describe("Session route serialization", () => {
  it("restores the complete track route state", () => {
    const session = new Session("Route serialization");
    const track = session.addTrack("Voice", TrackType.AUDIO);
    const preFaderGain = new GainProcessor(
      "pre-fader-gain" as ProcessorId,
      "Pre-fader gain",
    );

    track.route.volume = -12.5;
    track.route.trim = 3;
    track.route.pan = 0.25;
    track.route.active = false;
    track.route.polarity.setInverted(true);
    track.route.input.name = "Microphone";
    track.route.input.latency = 32;
    track.route.output.bundleName = "Main output";
    preFaderGain.gain = 4.5;
    track.route.addProcessor(preFaderGain, "pre");
    track.route.setCompensationDelay(128);

    const snapshot = JSON.parse(
      JSON.stringify(session.toJSON()),
    ) as SessionSnapshot;
    const restoredTrack = Session.fromJSON(snapshot).tracks[0];

    expect(restoredTrack.route.id).toBe(track.route.id);
    expect(restoredTrack.route.volume).toBe(-12.5);
    expect(restoredTrack.route.trim).toBe(3);
    expect(restoredTrack.route.pan).toBe(0.25);
    expect(restoredTrack.route.active).toBe(false);
    expect(restoredTrack.route.polarity.inverted).toBe(true);
    expect(restoredTrack.route.compensationDelay).toBe(128);
    expect(restoredTrack.route.input.name).toBe("Microphone");
    expect(restoredTrack.route.input.latency).toBe(32);
    expect(restoredTrack.route.output.bundleName).toBe("Main output");
    expect(restoredTrack.route.preFaderProcessors).toHaveLength(1);
    expect(restoredTrack.route.preFaderProcessors[0]).toBeInstanceOf(
      GainProcessor,
    );
    expect(
      (restoredTrack.route.preFaderProcessors[0] as GainProcessor).gain,
    ).toBe(4.5);
  });

  it("uses route defaults for snapshots created before route serialization", () => {
    const session = new Session("Legacy snapshot");
    session.addTrack("Voice", TrackType.AUDIO);
    const snapshot = session.toJSON();

    delete snapshot.tracks[0].route;

    const restoredRoute = Session.fromJSON(snapshot).tracks[0].route;

    expect(restoredRoute.volume).toBe(0);
    expect(restoredRoute.trim).toBe(0);
    expect(restoredRoute.pan).toBe(0);
    expect(restoredRoute.active).toBe(true);
    expect(restoredRoute.preFaderProcessors).toHaveLength(0);
    expect(restoredRoute.postFaderProcessors).toHaveLength(0);
  });
});
