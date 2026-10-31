import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../../audio/AudioEngine";
import type { AudioProvider } from "../../audio/AudioProvider";
import { CommandHistory } from "../CommandHistory";
import { MarkerHandler } from "../handlers/MarkerHandler";
import { CommandType } from "../types";

function createAudioProviderStub(): AudioProvider {
  const methods = new Map<PropertyKey, ReturnType<typeof vi.fn>>();
  return new Proxy({} as AudioProvider, {
    get: (_target, property) => {
      const existingMethod = methods.get(property);
      if (existingMethod) return existingMethod;

      const method = vi.fn();
      methods.set(property, method);
      return method;
    },
  });
}

describe("marker commands", () => {
  let audioEngine: AudioEngine;
  let history: CommandHistory;
  let handler: MarkerHandler;

  beforeEach(() => {
    AudioEngine.resetInstance();
    audioEngine = AudioEngine.getInstance(createAudioProviderStub());
    history = new CommandHistory();
    handler = new MarkerHandler();
  });

  afterEach(() => {
    AudioEngine.resetInstance();
  });

  it("returns the marker ID and preserves it across undo and redo", async () => {
    const result = await handler.execute(
      CommandType.ADD_MARKER,
      { name: "Chorus", position: 48_000, color: "#ffcc00" },
      audioEngine,
      history,
    );
    const markerId = (result.data as { markerId: string }).markerId;

    expect(result.success).toBe(true);
    expect(markerId).toEqual(expect.any(String));
    expect(audioEngine.session.getMarker(markerId)).toBeDefined();

    await history.undo();
    expect(audioEngine.session.getMarker(markerId)).toBeUndefined();

    await history.redo();
    expect(audioEngine.session.getMarker(markerId)).toBeDefined();
    expect(audioEngine.session.markers).toHaveLength(1);
  });

  it("records marker renames in command history", async () => {
    const marker = audioEngine.session.addMarker(
      "Verse",
      12_000,
      "#ffcc00",
      "marker-1",
    );

    const result = await handler.execute(
      CommandType.RENAME_MARKER,
      { markerId: marker.id, name: "Intro" },
      audioEngine,
      history,
    );

    expect(result.success).toBe(true);
    expect(history.undoDepth).toBe(1);
    expect(marker.name).toBe("Intro");

    await history.undo();
    expect(marker.name).toBe("Verse");

    await history.redo();
    expect(marker.name).toBe("Intro");
  });

  it("records marker lock changes in command history", async () => {
    const marker = audioEngine.session.addMarker(
      "Verse",
      12_000,
      "#ffcc00",
      "marker-1",
    );

    const result = await handler.execute(
      CommandType.SET_MARKER_LOCKED,
      { markerId: marker.id, locked: true },
      audioEngine,
      history,
    );

    expect(result.success).toBe(true);
    expect(history.undoDepth).toBe(1);
    expect(marker.locked).toBe(true);

    await history.undo();
    expect(marker.locked).toBe(false);

    await history.redo();
    expect(marker.locked).toBe(true);
  });

  it("rejects moves for locked markers without recording history", async () => {
    const marker = audioEngine.session.addMarker(
      "Locked marker",
      12_000,
      "#ffcc00",
      "marker-1",
    );
    marker.locked = true;

    const result = await handler.execute(
      CommandType.MOVE_MARKER,
      { markerId: marker.id, position: 24_000 },
      audioEngine,
      history,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("locked");
    expect(marker.position).toBe(12_000);
    expect(history.undoDepth).toBe(0);
  });

  it("lists markers without a payload", async () => {
    const marker = audioEngine.session.addMarker(
      "Verse",
      12_000,
      "#ffcc00",
      "marker-1",
    );

    const result = await handler.execute(
      CommandType.LIST_MARKERS,
      undefined,
      audioEngine,
      history,
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      {
        id: marker.id,
        name: marker.name,
        position: marker.position,
        time: "0.27s",
        color: marker.color,
        locked: marker.locked,
      },
    ]);
  });

  it("goes to the next marker without a payload", async () => {
    audioEngine.session.addMarker("Chorus", 48_000, "#ffcc00", "marker-1");
    vi.spyOn(audioEngine, "getCurrentFrame").mockReturnValue(24_000);
    const seekSpy = vi.spyOn(audioEngine, "seek");

    const result = await handler.execute(
      CommandType.GOTO_NEXT_MARKER,
      undefined,
      audioEngine,
      history,
    );

    expect(result.success).toBe(true);
    expect(seekSpy).toHaveBeenCalledWith(
      48_000 / audioEngine.session.sampleRate,
    );
  });

  it("goes to the previous marker without a payload", async () => {
    audioEngine.session.addMarker("Verse", 24_000, "#ffcc00", "marker-1");
    vi.spyOn(audioEngine, "getCurrentFrame").mockReturnValue(48_000);
    const seekSpy = vi.spyOn(audioEngine, "seek");

    const result = await handler.execute(
      CommandType.GOTO_PREV_MARKER,
      undefined,
      audioEngine,
      history,
    );

    expect(result.success).toBe(true);
    expect(seekSpy).toHaveBeenCalledWith(
      24_000 / audioEngine.session.sampleRate,
    );
  });
});
