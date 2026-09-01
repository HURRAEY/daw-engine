import { afterEach, describe, expect, it, vi } from "vitest";

import { AudioEngine } from "../../audio/AudioEngine";
import type { AudioProvider } from "../../audio/AudioProvider";
import { Session } from "../../domain/Session";
import { Source } from "../../domain/Source";
import { MotionState } from "../../domain/TransportFSM";
import { LoadSessionCommand } from "./LoadSessionCommand";

function createAudioProviderStub(): AudioProvider {
  return new Proxy({} as AudioProvider, {
    get: () => vi.fn(),
  });
}

describe("LoadSessionCommand", () => {
  afterEach(() => AudioEngine.resetInstance());

  it("preserves the Session object while fully restoring execute, undo, and redo", async () => {
    const engine = AudioEngine.getInstance(createAudioProviderStub());
    const sessionReference = engine.session;
    const trackAdded = vi.fn();
    sessionReference.trackAdded.connect(trackAdded);
    sessionReference.name = "before";
    sessionReference.addTrack("before-track", undefined, "before-track");
    const before = sessionReference.toJSON();

    const target = new Session("after", "after-id", 48_000);
    target.addSource(
      new Source("source", "source.wav", "file:///source.wav", 48_000),
    );
    const targetTrack = target.addTrack(
      "after-track",
      undefined,
      "after-track",
    );
    targetTrack.route.volume = -9;
    target.addMarker("marker", 120, "#fff", "marker");
    const after = target.toJSON();
    const command = new LoadSessionCommand(after);

    await command.execute();
    expect(engine.session).toBe(sessionReference);
    expect(engine.session.toJSON()).toEqual(after);
    expect(trackAdded).toHaveBeenCalledWith(
      expect.objectContaining({ id: "after-track" }),
    );

    await command.undo();
    expect(engine.session).toBe(sessionReference);
    expect(engine.session.toJSON()).toEqual(before);

    await command.redo();
    expect(engine.session).toBe(sessionReference);
    expect(engine.session.toJSON()).toEqual(after);
  });

  it("stops active transport before execute, undo, and redo", async () => {
    const stop = vi.fn();
    const provider = new Proxy({} as AudioProvider, {
      get: (_target, property) => (property === "stop" ? stop : vi.fn()),
    });
    const engine = AudioEngine.getInstance(provider);
    const command = new LoadSessionCommand(
      new Session("after", "after", 48_000).toJSON(),
    );

    engine.session.startTransport();
    await command.execute();
    expect(engine.session.transportFSM.motionState).toBe(MotionState.STOPPED);

    engine.session.startTransport();
    await command.undo();
    expect(engine.session.transportFSM.motionState).toBe(MotionState.STOPPED);

    engine.session.startTransport();
    await command.redo();
    expect(engine.session.transportFSM.motionState).toBe(MotionState.STOPPED);
    expect(stop).toHaveBeenCalledTimes(3);
  });
});
