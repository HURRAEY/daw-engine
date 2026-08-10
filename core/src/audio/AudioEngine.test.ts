import { describe, expect, it, vi } from "vitest";
import { Region } from "../domain/Region";
import { Session } from "../domain/Session";
import { AudioEngine } from "./AudioEngine";
import type { AudioProvider } from "./AudioProvider";

interface AudioProviderStub {
  readonly provider: AudioProvider;
  getMethod(methodName: keyof AudioProvider): ReturnType<typeof vi.fn>;
}

function createAudioProviderStub(): AudioProviderStub {
  const methods = new Map<PropertyKey, ReturnType<typeof vi.fn>>();
  const provider = new Proxy({} as AudioProvider, {
    get: (_target, property) => {
      const existingMethod = methods.get(property);
      if (existingMethod) return existingMethod;

      const method = vi.fn();
      methods.set(property, method);
      return method;
    },
  });
  return {
    provider,
    getMethod: (methodName) => provider[methodName] as ReturnType<typeof vi.fn>,
  };
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
});
