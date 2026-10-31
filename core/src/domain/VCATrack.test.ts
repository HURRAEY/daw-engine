import { describe, expect, it, vi } from "vitest";

import { VCATrack } from "./VCATrack";

describe("VCATrack automation state", () => {
  it("emits automation changes only when the value changes", () => {
    const vcaTrack = new VCATrack("vca-1", "VCA");
    const automationEnabledChanged = vi.fn();
    vcaTrack.automationEnabledChanged.connect(automationEnabledChanged);

    vcaTrack.setAutomationEnabled(false);
    vcaTrack.setAutomationEnabled(true);
    vcaTrack.setAutomationEnabled(true);
    vcaTrack.setAutomationEnabled(false);

    expect(automationEnabledChanged.mock.calls).toEqual([[true], [false]]);
  });
});
