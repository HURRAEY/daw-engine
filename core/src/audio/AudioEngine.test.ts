import { describe, expect, it, vi } from "vitest";
import { AudioEngine } from "./AudioEngine";
import type { AudioProvider } from "./AudioProvider";

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

describe("AudioEngine lifecycle", () => {
  it("creates isolated engines without sharing a session", () => {
    const firstEngine = AudioEngine.create(createAudioProviderStub());
    const secondEngine = AudioEngine.create(createAudioProviderStub());

    expect(firstEngine).not.toBe(secondEngine);
    expect(firstEngine.session).not.toBe(secondEngine.session);

    firstEngine.dispose();
    secondEngine.dispose();
  });

  it("allows repeated caller cleanup", () => {
    const engine = AudioEngine.create(createAudioProviderStub());

    expect(() => {
      engine.dispose();
      engine.dispose();
    }).not.toThrow();
  });
});
