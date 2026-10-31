import { describe, expect, it } from "vitest";

import { AutomationMode } from "../automation/AutomationMode";
import { InterpolationType } from "../automation/types";
import { MeterPoint } from "./MeterType";
import { InternalReturn, InternalSend } from "../processing/InternalSend";
import { MeterProcessor } from "../processing/MeterProcessor";
import { PluginInsert } from "../processing/PluginInsert";
import { SpeakerLayout, SurroundPanner } from "../processing/SurroundPanner";
import { PluginManager } from "../plugins/PluginManager";
import { PluginType } from "../plugins/Plugin";
import { GenericPlugin } from "../plugins/impl/GenericPlugin";
import { Session, SessionSnapshot } from "./Session";
import { Source, SourceFlags } from "./Source";
import { Region } from "./Region";
import { FadeShape } from "./FadeEnvelope";

function createSerializableSession(): Session {
  const session = new Session("복원 대상", "session-id", 48_000);
  const source = new Source(
    "source-id",
    "voice.wav",
    "file:///voice.wav",
    96_000,
    48_000,
    1,
  );
  source.flags = SourceFlags.WRITABLE | SourceFlags.CAN_RENAME;
  source.takeId = "take-id";
  source.naturalPosition = 240;
  source.transients = [120, 480];
  source.cueMarkers.set(720, "Chorus");
  source.xrunPositions = [960];
  source.capturedFor = "Vocal";
  source.setAnalysisData({ transients: [120, 480], bpm: 123 });
  session.addSource(source);

  const track = session.addTrack("Vocal", undefined, "track-id");
  const firstRegion = new Region("region-1", source.id, 0, 1_000, 0, "first");
  firstRegion.stretch = 1.25;
  firstRegion.pitchSemitones = 3;
  firstRegion.fadeInShape = FadeShape.S_CURVE;
  firstRegion.transients = [120];
  track.playlist.addRegion(firstRegion);
  track.playlist.addRegion(
    new Region("region-2", source.id, 500, 1_000, 500, "second"),
  );
  track.route.volume = -7;
  track.route.pan = 0.35;
  track.route.trim = 2;
  track.route.active = false;
  track.route.polarity.setInverted(true);
  track.route.input.latency = 12;
  track.route.input.bundleName = "Mic 1";
  track.route.output.connect(session.masterBus.input.id);

  const plugin = PluginManager.getInstance().createPlugin("internal-gain");
  if (!plugin) throw new Error("internal-gain plugin is unavailable");
  plugin.setParameter("gain", -4);
  const insert = new PluginInsert("insert-id", plugin, 48_000);
  insert.active = false;
  const automation = insert.getAutomation("gain");
  automation.mode = AutomationMode.TOUCH;
  automation.addPoint(0.5, -6, InterpolationType.Curved, "point-id");
  track.route.addProcessor(insert, "post");

  session.masterBus.volume = -2;
  session.masterBus.pan = -0.2;
  return session;
}

describe("Session serialization", () => {
  it("restores sources, mix state, plugins, automation, and routing", () => {
    const source = createSerializableSession();
    const snapshot = source.toJSON();
    const restored = Session.fromJSON(snapshot);
    const restoredTrack = restored.getTrack("track-id");
    const restoredInsert = restoredTrack?.route.postFaderProcessors[0];

    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.tracks[0].route?.postFaderProcessors).toHaveLength(1);
    expect(restored.toJSON()).toEqual(snapshot);
    expect(restored.getSource("source-id")?.getAnalysisData()?.bpm).toBe(123);
    expect(restoredTrack?.route.volume).toBe(-7);
    expect(restoredTrack?.route.pan).toBe(0.35);
    expect(restoredTrack?.route.output.connections).toEqual([
      restored.masterBus.input.id,
    ]);
    expect(restoredInsert).toBeInstanceOf(PluginInsert);
    expect((restoredInsert as PluginInsert).plugin.getState()).toEqual({
      gain: -4,
    });
    expect(restoredInsert?.getAutomation("gain").getPoints()).toEqual([
      expect.objectContaining({ id: "point-id", time: 0.5, value: -6 }),
    ]);
  });

  it("loads older optional source and grid fields with defaults", () => {
    const legacySnapshot = {
      id: "legacy",
      name: "legacy",
      sampleRate: 48_000,
      tempo: 140,
      timeSignature: [3, 4],
      transportFrame: 0,
      sources: [
        {
          id: "legacy-source",
          name: "legacy.wav",
          url: "file:///legacy.wav",
          duration: 100,
          sampleRate: 48_000,
          channelCount: 1,
        },
      ],
      tracks: [],
      ranges: [],
      sendBuses: [],
      loopEnabled: false,
    } as unknown as SessionSnapshot;

    const restored = Session.fromJSON(legacySnapshot);

    expect(restored.getSource("legacy-source")?.transients).toEqual([]);
    expect(restored.getSource("legacy-source")?.cueMarkers.size).toBe(0);
    expect(restored.gridSettings.bpm).toBe(140);
    expect(restored.gridSettings.timeSignatureNumerator).toBe(3);
    expect(restored.gridSettings.timeSignatureDenominator).toBe(4);
  });

  it("keeps grid and tempo map signal objects during in-place restore", () => {
    const session = new Session("before");
    const gridReference = session.gridSettings;
    const tempoMapReference = session.tempoMap;
    const target = new Session("after", "after", 48_000);
    target.gridSettings.setSnapToGrid(false);
    target.tempoMap.addTempoChange(48_000, 90);

    session.restoreFromJSON(target.toJSON());

    expect(session.gridSettings).toBe(gridReference);
    expect(session.tempoMap).toBe(tempoMapReference);
    expect(session.gridSettings.snapToGridEnabled).toBe(false);
    expect(session.tempoMap.getTempoAtFrame(48_000)).toBe(90);
  });

  it("round-trips every public route processor type", () => {
    const session = new Session("processors", "processors", 96_000);
    const sourceTrack = session.addTrack("source", undefined, "source-track");
    const targetTrack = session.addTrack("target", undefined, "target-track");

    const meter = new MeterProcessor("meter-id", MeterPoint.INPUT, 6);
    const internalSend = new InternalSend(
      "internal-send-id",
      "Internal Send",
      targetTrack.id,
    );
    internalSend.setSendLevel(-8);
    internalSend.setPreFader(true);
    internalSend.setMuted(true);
    const internalReturn = new InternalReturn(
      "internal-return-id",
      "Internal Return",
    );
    internalReturn.addSource(sourceTrack.id);
    const surroundPanner = new SurroundPanner(
      "surround-id",
      SpeakerLayout.SURROUND_5_1,
    );
    surroundPanner.setPosition(45, 15);
    surroundPanner.setSpread(0.4);
    surroundPanner.setLFELevel(0.25);

    for (const processor of [
      meter,
      internalSend,
      internalReturn,
      surroundPanner,
    ]) {
      processor.setLatency(32);
      processor.setTailLength(64);
      const automation = processor.getAutomation("active");
      automation.mode = AutomationMode.LATCH;
      automation.addPoint(10, 1, InterpolationType.Linear, `${processor.id}-p`);
      sourceTrack.route.addProcessor(processor);
    }

    const snapshot = session.toJSON();
    const restored = Session.fromJSON(snapshot);
    const processors = restored.getTrack(sourceTrack.id)?.route
      .preFaderProcessors;

    expect(restored.toJSON()).toEqual(snapshot);
    expect(processors?.[0]).toBeInstanceOf(MeterProcessor);
    expect((processors?.[0] as MeterProcessor).getMeterPoint()).toBe(
      MeterPoint.INPUT,
    );
    expect(
      (processors?.[0] as MeterProcessor).getChannelMeterData(),
    ).toHaveLength(6);
    expect(processors?.[1]).toBeInstanceOf(InternalSend);
    expect((processors?.[1] as InternalSend).targetTrackId).toBe(
      targetTrack.id,
    );
    expect((processors?.[1] as InternalSend).sendLevel).toBe(-8);
    expect(processors?.[2]).toBeInstanceOf(InternalReturn);
    expect((processors?.[2] as InternalReturn).sourceTrackIds).toEqual([
      sourceTrack.id,
    ]);
    expect(processors?.[3]).toBeInstanceOf(SurroundPanner);
    expect((processors?.[3] as SurroundPanner).layout).toBe(
      SpeakerLayout.SURROUND_5_1,
    );
  });

  it("preserves core strip processor identity and processing metadata", () => {
    const session = new Session("core strip", "core-strip", 48_000);
    const track = session.addTrack("track", undefined, "track");
    const processors = [
      track.route.trimProcessor,
      track.route.fader,
      track.route.polarity,
      track.route.panner,
    ];

    processors.forEach((processor, index) => {
      processor.setLatency(index + 1);
      processor.setTailLength(index + 11);
      const automation = processor.getAutomation("value");
      automation.mode = AutomationMode.WRITE;
      automation.addPoint(index, index + 0.5, InterpolationType.Hold);
    });

    const snapshot = session.toJSON();
    const routeSnapshot = snapshot.tracks[0].route;
    const restored = Session.fromJSON(snapshot);
    const restoredRoute = restored.getTrack("track")?.route;

    expect(routeSnapshot?.trim.id).toBe(track.route.trimProcessor.id);
    expect(routeSnapshot?.fader.id).toBe(track.route.fader.id);
    expect(routeSnapshot?.polarity.id).toBe(track.route.polarity.id);
    expect(routeSnapshot?.panner.id).toBe(track.route.panner.id);
    expect(restoredRoute?.trimProcessor.id).toBe(track.route.trimProcessor.id);
    expect(restoredRoute?.fader.id).toBe(track.route.fader.id);
    expect(restoredRoute?.polarity.id).toBe(track.route.polarity.id);
    expect(restoredRoute?.panner.id).toBe(track.route.panner.id);
    expect(restored.toJSON()).toEqual(snapshot);
  });

  it("restores plugin inserts with the session sample rate", () => {
    const session = new Session("plugin rate", "plugin-rate", 96_000);
    const track = session.addTrack("track", undefined, "track");
    const plugin = PluginManager.getInstance().createPlugin("internal-reverb");
    if (!plugin) throw new Error("internal-reverb plugin is unavailable");
    track.route.addProcessor(new PluginInsert("insert", plugin, 96_000));

    const restored = Session.fromJSON(session.toJSON());
    const insert = restored.getTrack("track")?.route.preFaderProcessors[0];

    expect(insert).toBeInstanceOf(PluginInsert);
    expect((insert as PluginInsert).sampleRate).toBe(96_000);
  });

  it("detaches route latency listeners after removing a restored track", () => {
    const restored = Session.fromJSON(createSerializableSession().toJSON());
    const restoredTrack = restored.getTrack("track-id");
    let compensationChangeCount = 0;
    restored.latencyCompensationChanged.connect(() => {
      compensationChangeCount += 1;
    });

    restored.removeTrack("track-id");
    restoredTrack?.route.latencyChanged.emit(0);

    expect(compensationChangeCount).toBe(0);
  });

  it("round-trips an unavailable plugin through the snapshot-only fallback", () => {
    const session = new Session("missing plugin", "missing-plugin", 48_000);
    const track = session.addTrack("track", undefined, "track");
    const plugin = PluginManager.getInstance().createPluginFromSnapshot({
      descriptorId: "external-missing",
      instanceId: "external-instance",
      name: "Unavailable Analyzer",
      type: PluginType.ANALYZER,
    });
    if (!(plugin instanceof GenericPlugin)) {
      throw new Error("snapshot fallback was not created");
    }
    plugin.addParameter({
      id: "threshold",
      name: "Threshold",
      value: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
    });
    track.route.addProcessor(
      new PluginInsert("missing-insert", plugin, 48_000),
    );

    const snapshot = session.toJSON();
    const restored = Session.fromJSON(snapshot);
    const restoredInsert =
      restored.getTrack("track")?.route.preFaderProcessors[0];

    expect(restored.toJSON()).toEqual(snapshot);
    expect(restoredInsert).toBeInstanceOf(PluginInsert);
    expect((restoredInsert as PluginInsert).plugin).toBeInstanceOf(
      GenericPlugin,
    );
    expect((restoredInsert as PluginInsert).plugin.getState()).toEqual({
      threshold: 0.25,
    });
  });
});
