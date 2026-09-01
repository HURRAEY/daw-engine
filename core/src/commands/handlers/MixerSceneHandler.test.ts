import { describe, expect, it, vi } from "vitest";

import type { AudioEngine } from "../../audio/AudioEngine";
import type { CommandHistory } from "../CommandHistory";
import { CommandType } from "../types";
import { MixerSceneHandler } from "./MixerSceneHandler";

describe("MixerSceneHandler rename", () => {
  it("delegates scene renaming to the manager", async () => {
    const renameScene = vi.fn().mockReturnValue(true);
    const audioEngine = {
      session: { mixerSceneManager: { renameScene } },
    } as unknown as AudioEngine;
    const handler = new MixerSceneHandler();

    const result = await handler.execute(
      CommandType.RENAME_MIXER_SCENE,
      { sceneId: "scene-1", name: "After" },
      audioEngine,
      {} as CommandHistory,
    );

    expect(renameScene).toHaveBeenCalledWith("scene-1", "After");
    expect(result).toEqual({
      success: true,
      message: 'Mixer scene renamed to "After"',
    });
  });

  it("reports a missing scene", async () => {
    const renameScene = vi.fn().mockReturnValue(false);
    const audioEngine = {
      session: { mixerSceneManager: { renameScene } },
    } as unknown as AudioEngine;
    const handler = new MixerSceneHandler();

    const result = await handler.execute(
      CommandType.RENAME_MIXER_SCENE,
      { sceneId: "missing", name: "After" },
      audioEngine,
      {} as CommandHistory,
    );

    expect(result).toEqual({
      success: false,
      message: "Mixer scene not found: missing",
    });
  });
});
