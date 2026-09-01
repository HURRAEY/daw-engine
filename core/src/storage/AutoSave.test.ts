import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Region } from "../domain/Region";
import { Session } from "../domain/Session";
import { Source } from "../domain/Source";
import { AutoSave } from "./AutoSave";
import { SessionStorage } from "./SessionStorage";
import { PluginInsert } from "../processing/PluginInsert";
import { PluginManager } from "../plugins/PluginManager";
import { InternalReturn, InternalSend } from "../processing/InternalSend";
import { MeterProcessor } from "../processing/MeterProcessor";
import { SurroundPanner } from "../processing/SurroundPanner";
import { Take } from "../domain/Take";
import { MidiRegion } from "../domain/MidiRegion";
import { MidiNote } from "../domain/MidiNote";
import { RegionId } from "../domain/types";

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("AutoSave dirty tracking", () => {
  const autoSave = AutoSave.getInstance();
  const saveSession = vi.fn<SessionStorage["saveSession"]>();

  beforeEach(() => {
    vi.useFakeTimers();
    saveSession.mockReset().mockResolvedValue(undefined);
    vi.spyOn(SessionStorage, "getInstance").mockReturnValue({
      saveSession,
    } as unknown as SessionStorage);
  });

  afterEach(() => {
    autoSave.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("tracks playlist and route changes on existing and newly added tracks", async () => {
    const session = new Session("session");
    const existing = session.addTrack("existing", undefined, "existing");
    autoSave.start(session);

    existing.route.volume = -3;
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    const added = session.addTrack("added", undefined, "added");
    await autoSave.saveNow();
    added.playlist.addRegion(
      new Region("region", "source", 0, 100, 0, "region"),
    );
    expect(autoSave.dirty).toBe(true);
  });

  it("tracks serialized bounce progress", async () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    autoSave.start(session);

    track.setBounceProgress(0.5);

    expect(autoSave.dirty).toBe(true);
  });

  it("tracks serialized processor latency and tail length", async () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    autoSave.start(session);

    track.route.trimProcessor.setLatency(32);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    track.route.trimProcessor.setTailLength(64);
    expect(autoSave.dirty).toBe(true);
  });

  it("tracks serialized processor ordering", async () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    const first = new MeterProcessor("first");
    const second = new MeterProcessor("second");
    track.route.addProcessor(first);
    track.route.addProcessor(second);
    autoSave.start(session);

    track.route.reorderProcessor(second.id, 0);

    expect(autoSave.dirty).toBe(true);
  });

  it("keeps master processor subscriptions when a track id matches the legacy owner key", () => {
    const session = new Session("session");
    session.addTrack("track", undefined, "master");
    autoSave.start(session);

    session.masterBus.trimProcessor.setLatency(32);

    expect(autoSave.dirty).toBe(true);
  });

  it("tracks source additions, removals, and mutable source analysis", async () => {
    const session = new Session("session");
    autoSave.start(session);
    const source = new Source("source", "source", "file:///source", 100);

    session.addSource(source);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    source.setAnalysisData({ transients: [10] });
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    session.removeSource(source.id);
    expect(autoSave.dirty).toBe(true);
  });

  it("does not clear a change made while a save is in flight", async () => {
    const session = new Session("session");
    const deferred = createDeferred();
    const saved = vi.fn();
    const savedSubscription = autoSave.saved.connect(saved);
    saveSession.mockReturnValueOnce(deferred.promise);
    autoSave.start(session);
    autoSave.markDirty();

    const saving = autoSave.saveNow();
    autoSave.markDirty();
    deferred.resolve();
    await saving;

    expect(autoSave.dirty).toBe(true);
    expect(saved).not.toHaveBeenCalled();
    savedSubscription.dispose();
  });

  it("queues concurrent saves so an older snapshot cannot finish last", async () => {
    const session = new Session("session");
    const firstSave = createDeferred();
    const secondSave = createDeferred();
    saveSession
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    autoSave.start(session);
    autoSave.markDirty();

    const firstSaving = autoSave.saveNow();
    await flushMicrotasks();
    session.addTrack("latest", undefined, "latest");
    const secondSaving = autoSave.saveNow();
    await flushMicrotasks();

    expect(saveSession).toHaveBeenCalledTimes(1);
    firstSave.resolve();
    await firstSaving;
    await flushMicrotasks();
    expect(saveSession).toHaveBeenCalledTimes(2);
    expect(autoSave.dirty).toBe(true);

    secondSave.resolve();
    await secondSaving;
    expect(autoSave.dirty).toBe(false);
  });

  it("continues the queue after a failed save", async () => {
    const session = new Session("session");
    saveSession
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce(undefined);
    autoSave.start(session);
    autoSave.markDirty();

    await autoSave.saveNow();
    expect(autoSave.dirty).toBe(true);

    await autoSave.saveNow();
    expect(saveSession).toHaveBeenCalledTimes(2);
    expect(autoSave.dirty).toBe(false);
  });

  it("does not clear edits after restarting the same session", async () => {
    const session = new Session("session", "session");
    const firstSave = createDeferred();
    saveSession.mockReturnValueOnce(firstSave.promise);
    autoSave.start(session);
    autoSave.markDirty();
    const firstSaving = autoSave.saveNow();
    await flushMicrotasks();

    autoSave.start(session);
    autoSave.markDirty();
    firstSave.resolve();
    await firstSaving;

    expect(autoSave.dirty).toBe(true);
  });

  it("does not block a new session behind an unrelated save", async () => {
    const firstSession = new Session("first", "first");
    const secondSession = new Session("second", "second");
    const firstSave = createDeferred();
    saveSession.mockReturnValueOnce(firstSave.promise);
    autoSave.start(firstSession);
    autoSave.markDirty();
    const firstSaving = autoSave.saveNow();
    await flushMicrotasks();

    autoSave.start(secondSession);
    autoSave.markDirty();
    const secondSaving = autoSave.saveNow();
    await flushMicrotasks();

    expect(saveSession).toHaveBeenCalledTimes(2);
    await secondSaving;
    expect(autoSave.dirty).toBe(false);

    firstSave.resolve();
    await firstSaving;
  });

  it("keeps writes ordered when an in-place restore changes the session id", async () => {
    const session = new Session("before", "before");
    const firstSave = createDeferred();
    const secondSave = createDeferred();
    saveSession
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    autoSave.start(session);
    autoSave.markDirty();
    const firstSaving = autoSave.saveNow();
    await flushMicrotasks();

    session.restoreFromJSON(new Session("after", "after").toJSON());
    autoSave.markDirty();
    const secondSaving = autoSave.saveNow();
    await flushMicrotasks();

    expect(saveSession).toHaveBeenCalledTimes(1);
    firstSave.resolve();
    await firstSaving;
    await flushMicrotasks();
    expect(saveSession).toHaveBeenCalledTimes(2);

    secondSave.resolve();
    await secondSaving;
  });

  it("persists immutable snapshot ids across cross-object replacements", async () => {
    const firstSession = new Session("first", "first");
    const firstSave = createDeferred();
    const secondSave = createDeferred();
    saveSession
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    autoSave.start(firstSession);
    autoSave.markDirty();
    const firstSaving = autoSave.saveNow();
    await flushMicrotasks();

    firstSession.restoreFromJSON(new Session("renamed", "shared").toJSON());
    const replacementSession = new Session("replacement", "shared");
    autoSave.start(replacementSession);
    autoSave.markDirty();
    const secondSaving = autoSave.saveNow();
    await flushMicrotasks();

    expect(saveSession).toHaveBeenCalledTimes(2);
    expect(saveSession.mock.calls[0][0].toJSON().id).toBe("first");
    expect(saveSession.mock.calls[1][0].toJSON().id).toBe("shared");

    secondSave.resolve();
    await secondSaving;
    firstSave.resolve();
    await firstSaving;
  });

  it("tracks serialized master mix, plugin, and automation changes", async () => {
    const session = new Session("session");
    autoSave.start(session);

    session.masterBus.volume = -2;
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    const plugin = PluginManager.getInstance().createPlugin("internal-gain");
    if (!plugin) throw new Error("internal-gain plugin is unavailable");
    const insert = new PluginInsert("master-insert", plugin);
    session.masterBus.addProcessor(insert);
    await autoSave.saveNow();
    plugin.setParameter("gain", -4);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    insert.getAutomation("gain").addPoint(0, -4);
    expect(autoSave.dirty).toBe(true);
  });

  it("rebinds dirty tracking to restored master strip processors", async () => {
    const session = new Session("session");
    const target = new Session("target");
    target.masterBus.volume = -6;
    target.masterBus.fader.getAutomation("gain").addPoint(0, -6);
    autoSave.start(session);

    session.restoreFromJSON(target.toJSON());
    await autoSave.saveNow();
    session.masterBus.volume = -3;
    expect(autoSave.dirty).toBe(true);

    await autoSave.saveNow();
    session.masterBus.fader.getAutomation("gain").addPoint(1, -3);
    expect(autoSave.dirty).toBe(true);
  });

  it("tracks grid, range, send bus, and track ordering changes", async () => {
    const session = new Session("session");
    const first = session.addTrack("first", undefined, "first");
    session.addTrack("second", undefined, "second");
    const range = session.addRange("range", 0, 100, "range");
    const sendBus = session.addSendBus(
      first.id,
      session.masterBus.input.id,
      0,
      false,
      "send",
    );
    autoSave.start(session);

    session.gridSettings.setSnapToGrid(false);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    range.setName("renamed");
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    sendBus.setLevel(-6);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    sendBus.setPreFader(true);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    sendBus.setActive(false);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    session.reorderTrack("second", 0);
    expect(autoSave.dirty).toBe(true);
  });

  it("disposes nested subscriptions when serialized objects are removed", async () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    const range = session.addRange("range", 0, 100, "range");
    const sendBus = session.addSendBus(
      track.id,
      session.masterBus.input.id,
      0,
      false,
      "send",
    );
    autoSave.start(session);

    session.removeRange(range.id);
    session.removeSendBus(sendBus.id);
    await autoSave.saveNow();
    range.setName("detached");
    sendBus.setLevel(-12);

    expect(autoSave.dirty).toBe(false);
  });

  it("tracks serialized session setting signals", async () => {
    const session = new Session("session");
    autoSave.start(session);

    session.setPreRollBars(2);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    session.setLoopRecording(true);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    session.toggleMetronome();
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    session.setMetronomeVolume(0.5);
    expect(autoSave.dirty).toBe(true);
  });

  it("tracks take-lane structure and active-take changes", async () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    autoSave.start(session);

    const lane = session.addTakeLane(track.id, "lane");
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    const take = new Take("take", 1, "region" as RegionId, track.id, 0, 100);
    lane.addTake(take);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    lane.selectTake(take.id);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    session.removeTakeLane(lane.id);
    await autoSave.saveNow();
    lane.removeTake(take.id);
    expect(autoSave.dirty).toBe(false);
  });

  it("subscribes to take lanes that already exist when monitoring starts", () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    const lane = session.addTakeLane(track.id, "lane");
    autoSave.start(session);

    lane.addTake(new Take("take", 1, "region" as RegionId, track.id, 0, 100));

    expect(autoSave.dirty).toBe(true);
  });

  it("tracks direct selection changes on takes that already exist", () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    const lane = session.addTakeLane(track.id, "lane");
    const take = new Take("take", 1, "region" as RegionId, track.id, 0, 100);
    lane.addTake(take);
    autoSave.start(session);

    take.setSelected(true);

    expect(autoSave.dirty).toBe(true);
  });

  it("tracks direct selection changes on newly added takes", async () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    const lane = session.addTakeLane(track.id, "lane");
    autoSave.start(session);
    const take = new Take("take", 1, "region" as RegionId, track.id, 0, 100);
    lane.addTake(take);
    await autoSave.saveNow();

    take.setSelected(true);

    expect(autoSave.dirty).toBe(true);
  });

  it("detaches direct selection listeners when a take is removed", async () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    const lane = session.addTakeLane(track.id, "lane");
    const take = new Take("take", 1, "region" as RegionId, track.id, 0, 100);
    lane.addTake(take);
    autoSave.start(session);

    lane.removeTake(take.id);
    await autoSave.saveNow();
    take.setSelected(true);

    expect(autoSave.dirty).toBe(false);
  });

  it("detaches selection listeners for every removed duplicate take id", async () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    const lane = session.addTakeLane(track.id, "lane");
    const first = new Take("take", 1, "first" as RegionId, track.id, 0, 100);
    const second = new Take("take", 2, "second" as RegionId, track.id, 0, 100);
    lane.addTake(first);
    lane.addTake(second);
    autoSave.start(session);

    lane.removeTake("take");
    await autoSave.saveNow();
    first.setSelected(true);
    second.setSelected(true);

    expect(autoSave.dirty).toBe(false);
  });

  it("detaches direct selection listeners when a take lane is removed", async () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    const lane = session.addTakeLane(track.id, "lane");
    const take = new Take("take", 1, "region" as RegionId, track.id, 0, 100);
    lane.addTake(take);
    autoSave.start(session);

    session.removeTakeLane(lane.id);
    await autoSave.saveNow();
    take.setSelected(true);

    expect(autoSave.dirty).toBe(false);
  });

  it("tracks serialized track metadata", async () => {
    const session = new Session("session");
    const parent = session.addTrack("parent", undefined, "parent");
    const track = session.addTrack("track", undefined, "track");
    autoSave.start(session);

    track.rename("renamed");
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    track.setComment("comment");
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    session.setTrackParent(track.id, parent.id);
    expect(autoSave.dirty).toBe(true);
  });

  it("tracks mixer scene renames and VCA automation changes", async () => {
    const session = new Session("session");
    const sceneId = session.mixerSceneManager.saveScene("before", session);
    const vca = session.addVCATrack("vca", "vca");
    autoSave.start(session);

    session.mixerSceneManager.renameScene(sceneId, "after");
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    vca.setAutomationEnabled(true);
    expect(autoSave.dirty).toBe(true);
  });

  it("tracks sidechain filter and nested MIDI note changes", async () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    const config = session.addSidechainConfig(track.id, "processor", "config");
    const region = new MidiRegion(
      "midi-region" as RegionId,
      "midi-region",
      0,
      100,
    );
    track.playlist.addMidiRegion(region);
    autoSave.start(session);

    config.setSidechainFilter(true, 120);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    const note = new MidiNote("note", 60, 100, 0, 10);
    region.addNote(note);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    note.move(20);
    expect(autoSave.dirty).toBe(true);
    await autoSave.saveNow();

    region.removeNote(note.id);
    await autoSave.saveNow();
    note.move(30);
    expect(autoSave.dirty).toBe(false);
  });

  it("saves all public route processor types without a serialization error", async () => {
    const session = new Session("session");
    const track = session.addTrack("track", undefined, "track");
    saveSession.mockImplementationOnce(async (savingSession) => {
      savingSession.toJSON();
    });
    autoSave.start(session);

    track.route.addProcessor(new MeterProcessor("meter"));
    track.route.addProcessor(
      new InternalSend("internal-send", "send", "target"),
    );
    track.route.addProcessor(new InternalReturn("internal-return", "return"));
    track.route.addProcessor(new SurroundPanner("surround"));

    await expect(autoSave.saveNow()).resolves.toBeUndefined();
    expect(saveSession).toHaveBeenCalledOnce();
    expect(autoSave.dirty).toBe(false);
  });
});
