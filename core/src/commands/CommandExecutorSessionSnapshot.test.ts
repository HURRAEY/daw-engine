import { afterEach, describe, expect, it, vi } from "vitest";

import { AudioEngine } from "../audio/AudioEngine";
import type { AudioProvider } from "../audio/AudioProvider";
import { AutomationMode } from "../automation/AutomationMode";
import { Session } from "../domain/Session";
import { Source } from "../domain/Source";
import { PluginInsert } from "../processing/PluginInsert";
import { PluginManager } from "../plugins/PluginManager";
import { CommandExecutor } from "./CommandExecutor";
import { CommandType } from "./types";

function createAudioProviderStub(): AudioProvider {
  const methods = new Map<PropertyKey, ReturnType<typeof vi.fn>>();
  return new Proxy({} as AudioProvider, {
    get: (_target, property) => {
      const method = methods.get(property) ?? vi.fn();
      methods.set(property, method);
      return method;
    },
  });
}

describe("CommandExecutor LOAD_SESSION snapshot parsing", () => {
  afterEach(() => AudioEngine.resetInstance());

  it("preserves extended session state through Zod parsing", async () => {
    const engine = AudioEngine.getInstance(createAudioProviderStub());
    const target = new Session("target", "target-id", 48_000);
    target.addSource(
      new Source("source", "source.wav", "file:///source.wav", 48_000),
    );
    const track = target.addTrack("track", undefined, "track");
    track.route.volume = -8;
    track.route.output.connect(target.masterBus.input.id);
    const plugin = PluginManager.getInstance().createPlugin("internal-gain");
    if (!plugin) throw new Error("internal-gain plugin is unavailable");
    plugin.setParameter("gain", -3);
    const insert = new PluginInsert("insert", plugin, 48_000);
    const automation = insert.getAutomation("gain");
    automation.mode = AutomationMode.TOUCH;
    automation.addPoint(0, -3);
    track.route.addProcessor(insert);
    const snapshot = target.toJSON();

    const result = await CommandExecutor.getInstance().execute({
      type: CommandType.LOAD_SESSION,
      payload: { snapshot },
    });

    expect(result.success).toBe(true);
    expect(engine.session.toJSON()).toEqual(snapshot);
  });
});
