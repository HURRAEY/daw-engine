import { describe, expect, it } from "vitest";

import { PluginType } from "./Plugin";
import { PluginManager } from "./PluginManager";
import { GenericPlugin } from "./impl/GenericPlugin";

describe("PluginManager", () => {
  it("rejects an unregistered descriptor during normal plugin creation", () => {
    expect(
      PluginManager.getInstance().createPlugin("missing-descriptor"),
    ).toBeNull();
  });

  it("creates a generic fallback only for snapshot restoration", () => {
    const plugin = PluginManager.getInstance().createPluginFromSnapshot({
      descriptorId: "missing-descriptor",
      instanceId: "plugin-id",
      name: "Missing Plugin",
      type: PluginType.ANALYZER,
    });

    expect(plugin).toBeInstanceOf(GenericPlugin);
    expect(plugin.id).toBe("plugin-id");
    expect(plugin.name).toBe("Missing Plugin");
    expect(plugin.type).toBe(PluginType.ANALYZER);
  });
});
