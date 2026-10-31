import { describe, expect, it } from "vitest";

import {
  BWF_ORIGINATOR_REFERENCE_PREFIX,
  DAW_DATABASE_NAME,
  KEY_BINDINGS_STORAGE_KEY,
  PLUGIN_PRESET_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
} from "./product-identifiers";

describe("product identifiers", () => {
  it("uses the hurraey namespace for browser persistence", () => {
    expect(DAW_DATABASE_NAME).toBe("hurraey-daw");
    expect(PLUGIN_PRESET_STORAGE_KEY).toBe("hurraey-plugin-presets");
    expect(KEY_BINDINGS_STORAGE_KEY).toBe("hurraey-keybindings");
    expect(PREFERENCES_STORAGE_KEY).toBe("hurraey-preferences");
  });

  it("uses the HURRAEY prefix for BWF originator references", () => {
    expect(BWF_ORIGINATOR_REFERENCE_PREFIX).toBe("HURRAEY");
  });
});
