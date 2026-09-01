import { describe, expect, it, vi } from "vitest";

import { MixerSceneManager } from "./MixerScene";

describe("MixerSceneManager rename", () => {
  it("renames an existing scene and emits its id once", () => {
    const manager = new MixerSceneManager();
    const sceneRenamed = vi.fn();
    manager.loadFromJSON([
      {
        id: "scene-1",
        name: "Before",
        createdAt: 1,
        tracks: [],
      },
    ]);
    manager.sceneRenamed.connect(sceneRenamed);

    expect(manager.renameScene("scene-1", "After")).toBe(true);
    expect(manager.getScene("scene-1")?.name).toBe("After");
    expect(sceneRenamed).toHaveBeenCalledOnce();
    expect(sceneRenamed).toHaveBeenCalledWith("scene-1");

    expect(manager.renameScene("scene-1", "After")).toBe(true);
    expect(sceneRenamed).toHaveBeenCalledOnce();
  });

  it("does not emit when the scene does not exist", () => {
    const manager = new MixerSceneManager();
    const sceneRenamed = vi.fn();
    manager.sceneRenamed.connect(sceneRenamed);

    expect(manager.renameScene("missing", "After")).toBe(false);
    expect(sceneRenamed).not.toHaveBeenCalled();
  });
});
