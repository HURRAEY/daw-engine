import { describe, expect, it, vi } from "vitest";
import { Region } from "../domain/Region";
import { Session } from "../domain/Session";
import { MotionState } from "../domain/TransportFSM";
import { AudioEngine } from "./AudioEngine";
import type { AudioProvider } from "./AudioProvider";

interface AudioProviderStub {
  readonly provider: AudioProvider;
  getMethod(methodName: keyof AudioProvider): ReturnType<typeof vi.fn>;
}

function createAudioProviderStub(): AudioProviderStub {
  const methods = new Map<PropertyKey, ReturnType<typeof vi.fn>>();
  const getOrCreateMethod = (
    property: PropertyKey,
  ): ReturnType<typeof vi.fn> => {
    const existingMethod = methods.get(property);
    if (existingMethod) return existingMethod;

    const method = vi.fn();
    methods.set(property, method);
    return method;
  };
  const provider = new Proxy({} as AudioProvider, {
    get: (_target, property) => {
      if (property === "stopWithDeclick" && !methods.has(property)) {
        return undefined;
      }
      return getOrCreateMethod(property);
    },
  });
  return {
    provider,
    getMethod: (methodName) => getOrCreateMethod(methodName),
  };
}

function createDeferred(): {
  readonly promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("AudioEngine lifecycle", () => {
  it("creates isolated engines without sharing a session", () => {
    const firstEngine = AudioEngine.create(createAudioProviderStub().provider);
    const secondEngine = AudioEngine.create(createAudioProviderStub().provider);

    expect(firstEngine).not.toBe(secondEngine);
    expect(firstEngine.session).not.toBe(secondEngine.session);

    firstEngine.dispose();
    secondEngine.dispose();
  });

  it("allows repeated caller cleanup", () => {
    const engine = AudioEngine.create(createAudioProviderStub().provider);

    expect(() => {
      engine.dispose();
      engine.dispose();
    }).not.toThrow();
  });

  it("reconnects processor and playlist signals after loading a session", () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const nextSession = new Session("교체 세션");
    const track = nextSession.addTrack("보컬", undefined, "track-1");
    const region = new Region(
      "region-1",
      "source-1",
      0,
      44_100,
      0,
      "보컬 Region",
    );

    engine.loadSession(nextSession);
    track.route.volume = -6;
    track.playlist.addRegion(region);

    expect(
      providerStub.getMethod("setProcessorParameter"),
    ).toHaveBeenCalledWith("track-1", expect.any(String), "gain", -6);
    expect(providerStub.getMethod("scheduleRegion")).toHaveBeenCalledWith(
      "track-1",
      expect.objectContaining({ id: "region-1" }),
    );
    engine.dispose();
  });

  it("disconnects signals from the previous session when loading a session", () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const previousSession = engine.session;
    const previousTrack = previousSession.addTrack(
      "이전 트랙",
      undefined,
      "previous-track",
    );

    engine.loadSession(new Session("교체 세션"));
    providerStub.getMethod("setProcessorParameter").mockClear();
    providerStub.getMethod("createTrack").mockClear();

    previousTrack.route.volume = -12;
    previousSession.addTrack("남은 트랙", undefined, "stale-track");

    expect(
      providerStub.getMethod("setProcessorParameter"),
    ).not.toHaveBeenCalled();
    expect(providerStub.getMethod("createTrack")).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("hydrates an existing session when loading it", () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const nextSession = new Session("loaded-session");
    const track = nextSession.addTrack("audio-track", undefined, "track-1");
    const region = new Region(
      "region-1",
      "source-1",
      0,
      44_100,
      0,
      "audio-region",
    );
    track.playlist.addRegion(region);

    providerStub.getMethod("createTrack").mockClear();
    providerStub.getMethod("scheduleRegion").mockClear();
    engine.loadSession(nextSession);

    expect(providerStub.getMethod("createTrack")).toHaveBeenCalledWith(
      "track-1",
      "audio-track",
      track.route.input.id,
      track.route.output.id,
    );
    expect(providerStub.getMethod("scheduleRegion")).toHaveBeenCalledWith(
      "track-1",
      expect.objectContaining({ id: "region-1" }),
    );
    engine.dispose();
  });

  it("hydrates the replacement backend with the current session", () => {
    const initialProviderStub = createAudioProviderStub();
    const replacementProviderStub = createAudioProviderStub();
    const engine = AudioEngine.create(initialProviderStub.provider);
    const track = engine.session.addTrack("audio-track", undefined, "track-1");
    track.setMute(true);
    track.setSolo(true);
    track.playlist.addRegion(
      new Region("region-1", "source-1", 0, 44_100, 0, "audio-region"),
    );

    engine.setBackend(replacementProviderStub.provider);

    expect(
      replacementProviderStub.getMethod("createTrack"),
    ).toHaveBeenCalledWith(
      "track-1",
      "audio-track",
      track.route.input.id,
      track.route.output.id,
    );
    expect(
      replacementProviderStub.getMethod("addProcessor"),
    ).toHaveBeenCalledTimes(track.route.processors.length);
    expect(
      replacementProviderStub.getMethod("setTrackMute"),
    ).toHaveBeenCalledWith("track-1", true);
    expect(
      replacementProviderStub.getMethod("setTrackSolo"),
    ).toHaveBeenCalledWith("track-1", true);
    expect(
      replacementProviderStub.getMethod("scheduleRegion"),
    ).toHaveBeenCalledWith(
      "track-1",
      expect.objectContaining({ id: "region-1" }),
    );
    engine.dispose();
  });

  it("publishes an immutable routing snapshot after topology changes", () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    providerStub.getMethod("applyRoutingSnapshot").mockClear();

    engine.session.addTrack("audio-track", undefined, "track-1");

    expect(
      providerStub.getMethod("applyRoutingSnapshot"),
    ).toHaveBeenCalledTimes(1);
    const snapshot = providerStub.getMethod("applyRoutingSnapshot").mock
      .calls[0][0];
    expect(snapshot.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "track-1" })]),
    );
    expect(Object.isFrozen(snapshot)).toBe(true);
    engine.dispose();
  });

  it("publishes sidechain topology changes", () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    engine.session.addTrack("source-track", undefined, "source-track");
    const targetTrack = engine.session.addTrack(
      "target-track",
      undefined,
      "target-track",
    );
    providerStub.getMethod("applyRoutingSnapshot").mockClear();

    const sidechain = engine.session.addSidechainConfig(
      targetTrack.id,
      targetTrack.route.processors[0].id,
      "sidechain-1",
    );
    sidechain.setSource("source-track");
    sidechain.setEnabled(true);

    const applyRoutingSnapshot = providerStub.getMethod("applyRoutingSnapshot");
    expect(applyRoutingSnapshot).toHaveBeenCalled();
    const latestSnapshot = applyRoutingSnapshot.mock.lastCall?.[0];
    expect(latestSnapshot.edges).toContainEqual(
      expect.objectContaining({
        sourceId: "source-track",
        targetId: "target-track",
        type: "sidechain",
      }),
    );
    engine.dispose();
  });
});

describe("AudioEngine transport declick", () => {
  it("starts the backend when the session is rolling before engine start", async () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    engine.session.startTransport();

    await engine.start();

    expect(providerStub.getMethod("start")).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it("completes the stop transition after the provider declick finishes", async () => {
    const providerStub = createAudioProviderStub();
    const declick = createDeferred();
    providerStub.getMethod("stopWithDeclick").mockReturnValue(declick.promise);
    const engine = AudioEngine.create(providerStub.provider);
    await engine.start();
    engine.session.locateTransport(44_100);

    const stopPromise = engine.stop();

    expect(engine.session.transportFSM.motionState).toBe(
      MotionState.DECLICK_TO_STOP,
    );
    expect(engine.session.transportFrame).toBe(44_100);
    expect(providerStub.getMethod("stop")).not.toHaveBeenCalled();

    declick.resolve();
    await stopPromise;

    expect(engine.session.transportFSM.motionState).toBe(MotionState.STOPPED);
    expect(engine.session.transportFrame).toBe(0);
    engine.dispose();
  });

  it("starts the backend after a play request deferred during declick", async () => {
    const providerStub = createAudioProviderStub();
    const declick = createDeferred();
    providerStub.getMethod("stopWithDeclick").mockReturnValue(declick.promise);
    const engine = AudioEngine.create(providerStub.provider);
    await engine.start();
    providerStub.getMethod("start").mockClear();

    const stopPromise = engine.stop();
    const startPromise = engine.start();

    expect(engine.session.transportFSM.motionState).toBe(
      MotionState.DECLICK_TO_STOP,
    );
    expect(providerStub.getMethod("start")).not.toHaveBeenCalled();

    declick.resolve();
    await Promise.all([stopPromise, startPromise]);

    expect(engine.session.transportFSM.motionState).toBe(MotionState.ROLLING);
    expect(providerStub.getMethod("start")).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it("uses immediate stop when the provider has no declick capability", async () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    await engine.start();

    await engine.stop();

    expect(providerStub.getMethod("stop")).toHaveBeenCalledTimes(1);
    expect(engine.session.transportFSM.motionState).toBe(MotionState.STOPPED);
    engine.dispose();
  });

  it("leaves the transport stopped when provider declick fails", async () => {
    const providerStub = createAudioProviderStub();
    providerStub
      .getMethod("stopWithDeclick")
      .mockRejectedValue(new Error("Declick failed"));
    const engine = AudioEngine.create(providerStub.provider);
    await engine.start();

    await expect(engine.stop()).rejects.toThrow("Declick failed");

    expect(engine.session.transportFSM.motionState).toBe(MotionState.STOPPED);
    engine.dispose();
  });
});
