import { describe, expect, it, vi } from "vitest";
import { MidiNote } from "../domain/MidiNote";
import { MidiRegion } from "../domain/MidiRegion";
import { MonitorMode } from "../domain/MonitorMode";
import { Region } from "../domain/Region";
import { Session } from "../domain/Session";
import { Source } from "../domain/Source";
import { TrackType } from "../domain/Track";
import { MotionState } from "../domain/TransportFSM";
import { GainProcessor } from "../processing/GainProcessor";
import { PluginInsert } from "../processing/PluginInsert";
import { PluginManager } from "../plugins/PluginManager";
import { AudioEngine } from "./AudioEngine";
import type { AudioProvider } from "./AudioProvider";
import type { RoutingSnapshot } from "./engine/RoutingSnapshot";

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
  it("creates the default session with the intended name and generated id", () => {
    const engine = AudioEngine.create(createAudioProviderStub().provider);

    expect(engine.session.name).toBe("Untitled Session");
    expect(engine.session.id).not.toBe("Untitled Session");
    engine.dispose();
  });

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

  it("publishes the updated track processor order without recreating processors", () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const track = engine.session.addTrack("audio-track", undefined, "track-1");
    const firstProcessor = new GainProcessor("first-processor", "First");
    const secondProcessor = new GainProcessor("second-processor", "Second");
    track.route.addProcessor(firstProcessor, "pre");
    track.route.addProcessor(secondProcessor, "pre");
    const applyRoutingSnapshot = providerStub.getMethod("applyRoutingSnapshot");
    const addProcessor = providerStub.getMethod("addProcessor");
    const removeProcessor = providerStub.getMethod("removeProcessor");
    applyRoutingSnapshot.mockClear();
    addProcessor.mockClear();
    removeProcessor.mockClear();

    track.route.reorderProcessor(secondProcessor.id, 0);

    expect(applyRoutingSnapshot).toHaveBeenCalledTimes(1);
    const snapshot = applyRoutingSnapshot.mock.lastCall?.[0] as
      RoutingSnapshot | undefined;
    const trackNode = snapshot?.nodes.find((node) => node.id === track.id);
    expect(
      trackNode?.processors.map((processor) => ({
        id: processor.id,
        index: processor.index,
      })),
    ).toEqual(
      track.route.processors.map((processor, index) => ({
        id: processor.id,
        index,
      })),
    );
    expect(addProcessor).not.toHaveBeenCalled();
    expect(removeProcessor).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("publishes the updated master processor order without recreating processors", () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const firstProcessor = new GainProcessor("master-first", "First");
    const secondProcessor = new GainProcessor("master-second", "Second");
    engine.session.masterBus.addProcessor(firstProcessor, "pre");
    engine.session.masterBus.addProcessor(secondProcessor, "pre");
    const applyRoutingSnapshot = providerStub.getMethod("applyRoutingSnapshot");
    const addMasterProcessor = providerStub.getMethod("addMasterProcessor");
    const removeMasterProcessor = providerStub.getMethod(
      "removeMasterProcessor",
    );
    applyRoutingSnapshot.mockClear();
    addMasterProcessor.mockClear();
    removeMasterProcessor.mockClear();

    engine.session.masterBus.reorderProcessor(secondProcessor.id, 0);

    expect(applyRoutingSnapshot).toHaveBeenCalledTimes(1);
    const snapshot = applyRoutingSnapshot.mock.lastCall?.[0] as
      RoutingSnapshot | undefined;
    const masterNode = snapshot?.nodes.find(
      (node) => node.id === engine.session.masterBus.id,
    );
    expect(
      masterNode?.processors.map((processor) => ({
        id: processor.id,
        index: processor.index,
      })),
    ).toEqual(
      engine.session.masterBus.processors.map((processor, index) => ({
        id: processor.id,
        index,
      })),
    );
    expect(addMasterProcessor).not.toHaveBeenCalled();
    expect(removeMasterProcessor).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("does not publish a routing snapshot for a no-op processor reorder", () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const track = engine.session.addTrack("audio-track", undefined, "track-1");
    const processor = new GainProcessor("processor", "Processor");
    track.route.addProcessor(processor, "pre");
    const applyRoutingSnapshot = providerStub.getMethod("applyRoutingSnapshot");
    applyRoutingSnapshot.mockClear();

    track.route.reorderProcessor(processor.id, 0);

    expect(applyRoutingSnapshot).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("disconnects processor reorder signals after removing a track", () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const track = engine.session.addTrack("audio-track", undefined, "track-1");
    const firstProcessor = new GainProcessor("first-processor", "First");
    const secondProcessor = new GainProcessor("second-processor", "Second");
    track.route.addProcessor(firstProcessor, "pre");
    track.route.addProcessor(secondProcessor, "pre");
    engine.session.removeTrack(track.id);
    const applyRoutingSnapshot = providerStub.getMethod("applyRoutingSnapshot");
    applyRoutingSnapshot.mockClear();

    track.route.reorderProcessor(secondProcessor.id, 0);

    expect(applyRoutingSnapshot).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("rebinds processor reorder signals to restored tracks", async () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const previousTrack = engine.session.addTrack(
      "previous-track",
      undefined,
      "previous-track",
    );
    const previousFirst = new GainProcessor("previous-first", "First");
    const previousSecond = new GainProcessor("previous-second", "Second");
    previousTrack.route.addProcessor(previousFirst, "pre");
    previousTrack.route.addProcessor(previousSecond, "pre");
    const target = new Session("target", "target");
    const targetTrack = target.addTrack(
      "target-track",
      undefined,
      "target-track",
    );
    targetTrack.route.addProcessor(new GainProcessor("target-first", "First"));
    targetTrack.route.addProcessor(
      new GainProcessor("target-second", "Second"),
    );

    await engine.restoreSessionFromSnapshot(target.toJSON());

    const restoredTrack = engine.session.getTrack(targetTrack.id);
    if (!restoredTrack) throw new Error("restored track is unavailable");
    const applyRoutingSnapshot = providerStub.getMethod("applyRoutingSnapshot");
    applyRoutingSnapshot.mockClear();

    previousTrack.route.reorderProcessor(previousSecond.id, 0);
    expect(applyRoutingSnapshot).not.toHaveBeenCalled();

    restoredTrack.route.reorderProcessor("target-second", 0);

    expect(applyRoutingSnapshot).toHaveBeenCalledTimes(1);
    const snapshot = applyRoutingSnapshot.mock.lastCall?.[0] as
      RoutingSnapshot | undefined;
    const trackNode = snapshot?.nodes.find(
      (node) => node.id === restoredTrack.id,
    );
    expect(trackNode?.processors.map((processor) => processor.id)).toEqual(
      restoredTrack.route.processors.map((processor) => processor.id),
    );
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

  it("disconnects removed master processor signals", () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const plugin = PluginManager.getInstance().createPlugin("internal-gain");
    if (!plugin) throw new Error("internal-gain plugin is unavailable");
    const insert = new PluginInsert("master-insert", plugin);
    engine.session.masterBus.addProcessor(insert);
    providerStub.getMethod("setMasterProcessorParameter").mockClear();

    engine.session.masterBus.removeProcessor(insert.id);
    plugin.setParameter("gain", -6);

    expect(
      providerStub.getMethod("setMasterProcessorParameter"),
    ).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("registers restored master IO before publishing restored routing", async () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const target = new Session("target", "target", 48_000);
    const plugin = PluginManager.getInstance().createPlugin("internal-gain");
    if (!plugin) throw new Error("internal-gain plugin is unavailable");
    target.masterBus.addProcessor(new PluginInsert("master-insert", plugin));
    const registerMasterIO = providerStub.getMethod("registerMasterIO");
    const addMasterProcessor = providerStub.getMethod("addMasterProcessor");
    const applyRoutingSnapshot = providerStub.getMethod("applyRoutingSnapshot");
    registerMasterIO.mockClear();
    addMasterProcessor.mockClear();
    applyRoutingSnapshot.mockClear();

    await engine.restoreSessionFromSnapshot(target.toJSON());

    expect(registerMasterIO).toHaveBeenCalledWith(
      target.masterBus.input.id,
      target.masterBus.output.id,
    );
    expect(registerMasterIO.mock.invocationCallOrder[0]).toBeLessThan(
      Math.min(...applyRoutingSnapshot.mock.invocationCallOrder),
    );
    expect(applyRoutingSnapshot).toHaveBeenCalledTimes(1);
    expect(
      Math.max(...addMasterProcessor.mock.invocationCallOrder),
    ).toBeLessThan(applyRoutingSnapshot.mock.invocationCallOrder[0]);
    engine.dispose();
  });

  it("waits for restored sources before creating dependent tracks", async () => {
    const providerStub = createAudioProviderStub();
    const sourceReady = createDeferred();
    providerStub
      .getMethod("addSource")
      .mockReturnValueOnce(sourceReady.promise);
    const engine = AudioEngine.create(providerStub.provider);
    const target = new Session("target", "target", 48_000);
    target.addSource(
      new Source("source", "source.wav", "file:///source.wav", 48_000),
    );
    target.addTrack("track", undefined, "track");
    providerStub.getMethod("createTrack").mockClear();

    const restoration = engine.restoreSessionFromSnapshot(target.toJSON());

    expect(providerStub.getMethod("addSource")).toHaveBeenCalledTimes(1);
    expect(providerStub.getMethod("createTrack")).not.toHaveBeenCalled();

    sourceReady.resolve();
    await restoration;

    expect(providerStub.getMethod("createTrack")).toHaveBeenCalledWith(
      "track",
      "track",
      expect.any(String),
      expect.any(String),
    );
    engine.dispose();
  });

  it("preserves the current session when restored source loading fails", async () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const currentSession = engine.session;
    const target = new Session("target", "target", 48_000);
    target.addSource(
      new Source("source", "source.wav", "file:///source.wav", 48_000),
    );
    providerStub
      .getMethod("addSource")
      .mockRejectedValueOnce(new Error("source unavailable"));

    await expect(
      engine.restoreSessionFromSnapshot(target.toJSON()),
    ).rejects.toThrow("source unavailable");

    expect(engine.session).toBe(currentSession);
    expect(engine.session.name).toBe("Untitled Session");
    expect(
      providerStub.getMethod("removeMasterProcessor"),
    ).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("synchronizes restored transport and punch state", async () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const target = new Session("target", "target", 48_000);
    const punchRange = target.addRange("punch", 24_000, 72_000, "punch");
    target.transportFrame = 96_000;
    target.punchRangeId = punchRange.id;
    target.punchEnabled = true;
    providerStub.getMethod("seek").mockClear();
    providerStub.getMethod("enablePunchRecording").mockClear();
    providerStub.getMethod("setPunchRange").mockClear();

    await engine.restoreSessionFromSnapshot(target.toJSON());

    expect(providerStub.getMethod("seek")).toHaveBeenCalledWith(2);
    expect(providerStub.getMethod("enablePunchRecording")).toHaveBeenCalledWith(
      true,
    );
    expect(providerStub.getMethod("setPunchRange")).toHaveBeenCalledWith(
      24_000,
      72_000,
    );
    engine.dispose();
  });

  it("rebinds restored master processors and hydrates their backend state", async () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const target = new Session("target", "target", 48_000);
    target.masterBus.trim = 2;
    target.masterBus.volume = -6;
    target.masterBus.pan = 0.25;
    target.masterBus.polarity.setInverted(true);
    target.masterBus.fader.active = false;
    target.masterBus.fader
      .getAutomation("gain")
      .addPoint(0, -6, undefined, "master-point");
    const snapshot = target.toJSON();
    const previousMasterProcessorIds = engine.session.masterBus.processors.map(
      (processor) => processor.id,
    );
    providerStub.getMethod("addMasterProcessor").mockClear();
    providerStub.getMethod("removeMasterProcessor").mockClear();
    providerStub.getMethod("setMasterProcessorParameter").mockClear();
    providerStub.getMethod("setMasterProcessorAutomation").mockClear();

    await engine.restoreSessionFromSnapshot(snapshot);

    const restoredMaster = engine.session.masterBus;
    expect(restoredMaster.processors.map((processor) => processor.id)).toEqual(
      snapshot.masterBus?.trim
        ? [
            snapshot.masterBus.trim.id,
            snapshot.masterBus.fader.id,
            snapshot.masterBus.polarity.id,
            snapshot.masterBus.panner.id,
          ]
        : [],
    );
    previousMasterProcessorIds.forEach((processorId) => {
      expect(
        providerStub.getMethod("removeMasterProcessor"),
      ).toHaveBeenCalledWith(processorId);
    });
    expect(
      providerStub.getMethod("setMasterProcessorParameter"),
    ).toHaveBeenCalledWith(restoredMaster.trimProcessor.id, "gain", 2);
    expect(
      providerStub.getMethod("setMasterProcessorParameter"),
    ).toHaveBeenCalledWith(restoredMaster.fader.id, "gain", -6);
    expect(
      providerStub.getMethod("setMasterProcessorParameter"),
    ).toHaveBeenCalledWith(restoredMaster.fader.id, "active", 0);
    expect(
      providerStub.getMethod("setMasterProcessorParameter"),
    ).toHaveBeenCalledWith(restoredMaster.polarity.id, "polarity", 1);
    expect(
      providerStub.getMethod("setMasterProcessorParameter"),
    ).toHaveBeenCalledWith(restoredMaster.panner.id, "pan", 0.25);
    expect(
      providerStub.getMethod("setMasterProcessorAutomation"),
    ).toHaveBeenCalledWith(restoredMaster.fader.id, "gain", [
      expect.objectContaining({ id: "master-point", value: -6 }),
    ]);

    await engine.restoreSessionFromSnapshot(snapshot);
    const repeatedlyRestoredMaster = engine.session.masterBus;
    providerStub.getMethod("setMasterProcessorParameter").mockClear();
    providerStub.getMethod("setMasterProcessorAutomation").mockClear();
    repeatedlyRestoredMaster.volume = -3;
    repeatedlyRestoredMaster.fader.getAutomation("gain").addPoint(1, -3);

    expect(
      providerStub.getMethod("setMasterProcessorParameter"),
    ).toHaveBeenCalledTimes(1);
    expect(
      providerStub.getMethod("setMasterProcessorParameter"),
    ).toHaveBeenCalledWith(repeatedlyRestoredMaster.fader.id, "gain", -3);
    expect(
      providerStub.getMethod("setMasterProcessorAutomation"),
    ).toHaveBeenCalledTimes(1);
    expect(
      providerStub.getMethod("setMasterProcessorAutomation"),
    ).toHaveBeenCalledWith(
      repeatedlyRestoredMaster.fader.id,
      "gain",
      expect.arrayContaining([
        expect.objectContaining({ id: "master-point", value: -6 }),
        expect.objectContaining({ value: -3 }),
      ]),
    );
    engine.dispose();
  });

  it("hydrates restored track state before subscribing to live changes", async () => {
    const providerStub = createAudioProviderStub();
    const engine = AudioEngine.create(providerStub.provider);
    const target = new Session("target", "target", 48_000);
    const track = target.addTrack("midi-track", TrackType.MIDI, "track-1");
    track.setMonitor(true);
    track.setMute(true);
    track.setSolo(true);
    track.setSoloIsolate(true);
    track.setSoloSafe(true);
    track.setMonitorMode(MonitorMode.INPUT);
    track.route.volume = -8;
    track.route.pan = 0.25;

    const plugin = PluginManager.getInstance().createPlugin("internal-gain");
    if (!plugin) throw new Error("internal-gain plugin is unavailable");
    plugin.setParameter("gain", -4);
    track.route.addProcessor(new PluginInsert("track-insert", plugin), "post");

    const midiRegion = new MidiRegion("midi-region", "restored-midi", 120, 960);
    midiRegion.addNote(new MidiNote("note-1", 60, 100, 0, 480));
    track.playlist.addMidiRegion(midiRegion);

    const snapshot = target.toJSON();
    await engine.restoreSessionFromSnapshot(snapshot);

    const restoredTrack = engine.session.getTrack("track-1");
    if (!restoredTrack) throw new Error("restored track is unavailable");
    expect(providerStub.getMethod("setMonitor")).toHaveBeenCalledWith(
      "track-1",
      true,
    );
    expect(providerStub.getMethod("setTrackMute")).toHaveBeenCalledWith(
      "track-1",
      true,
    );
    expect(providerStub.getMethod("setTrackSolo")).toHaveBeenCalledWith(
      "track-1",
      true,
    );
    expect(providerStub.getMethod("setTrackSoloIsolate")).toHaveBeenCalledWith(
      "track-1",
      true,
    );
    expect(providerStub.getMethod("setTrackSoloSafe")).toHaveBeenCalledWith(
      "track-1",
      true,
    );
    expect(providerStub.getMethod("setMonitorMode")).toHaveBeenCalledWith(
      "track-1",
      MonitorMode.INPUT,
    );
    expect(
      providerStub.getMethod("setProcessorParameter"),
    ).toHaveBeenCalledWith("track-1", restoredTrack.route.fader.id, "gain", -8);
    expect(
      providerStub.getMethod("setProcessorParameter"),
    ).toHaveBeenCalledWith(
      "track-1",
      restoredTrack.route.panner.id,
      "pan",
      0.25,
    );
    expect(
      providerStub.getMethod("setProcessorParameter"),
    ).toHaveBeenCalledWith("track-1", "track-insert", "gain", -4);
    expect(providerStub.getMethod("scheduleMidiRegion")).toHaveBeenCalledWith(
      "track-1",
      expect.objectContaining({
        id: "midi-region",
        notes: [expect.objectContaining({ id: "note-1" })],
      }),
    );

    await engine.restoreSessionFromSnapshot(snapshot);
    const repeatedlyRestoredTrack = engine.session.getTrack("track-1");
    if (!repeatedlyRestoredTrack) {
      throw new Error("repeatedly restored track is unavailable");
    }
    providerStub.getMethod("setProcessorParameter").mockClear();
    repeatedlyRestoredTrack.route.volume = -3;

    expect(
      providerStub.getMethod("setProcessorParameter"),
    ).toHaveBeenCalledTimes(1);
    expect(
      providerStub.getMethod("setProcessorParameter"),
    ).toHaveBeenCalledWith(
      "track-1",
      repeatedlyRestoredTrack.route.fader.id,
      "gain",
      -3,
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
