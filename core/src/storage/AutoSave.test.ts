import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Session } from "../domain/Session";
import { AutoSave } from "./AutoSave";
import { SessionStorage } from "./SessionStorage";

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

describe("AutoSave write ordering", () => {
  const autoSave = AutoSave.getInstance();
  const saveSession = vi.fn<(session: Session) => Promise<void>>();

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
    await Promise.resolve();
    autoSave.markDirty();
    const secondSaving = autoSave.saveNow();
    await Promise.resolve();

    expect(saveSession).toHaveBeenCalledTimes(1);
    firstSave.resolve();
    await firstSaving;
    await Promise.resolve();
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
    await Promise.resolve();

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
    await Promise.resolve();

    autoSave.start(secondSession);
    autoSave.markDirty();
    const secondSaving = autoSave.saveNow();
    await Promise.resolve();

    expect(saveSession).toHaveBeenCalledTimes(2);
    await secondSaving;
    expect(autoSave.dirty).toBe(false);

    firstSave.resolve();
    await firstSaving;
  });
});
