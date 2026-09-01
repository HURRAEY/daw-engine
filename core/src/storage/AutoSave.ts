import { SessionStorage } from "./SessionStorage";
import { Session } from "../domain/Session";
import { Signal } from "../lib/Signal";

import { logger } from "../utils/Logger";
const AUTO_SAVE_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Auto-save manager.
 *
 * Periodically saves the current session to IndexedDB when the
 * dirty flag is set. The dirty flag is set automatically whenever
 * session signals fire, and cleared after a successful save.
 */
export class AutoSave {
  private static instance: AutoSave;

  private _dirty = false;
  private _lastModified: Date = new Date();
  private _timerId: ReturnType<typeof setInterval> | null = null;
  private _session: Session | null = null;
  private _subscriptions: Array<{ dispose: () => void }> = [];
  private _changeVersion = 0;
  private _lifecycleVersion = 0;
  private _saveQueues = new Map<string, Promise<void>>();

  /** Emitted after each successful auto-save. */
  public readonly saved = new Signal<Date>();

  /** Emitted when the dirty flag changes. */
  public readonly dirtyChanged = new Signal<boolean>();

  private constructor() {}

  public static getInstance(): AutoSave {
    if (!AutoSave.instance) {
      AutoSave.instance = new AutoSave();
    }
    return AutoSave.instance;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  public get dirty(): boolean {
    return this._dirty;
  }

  public get lastModified(): Date {
    return this._lastModified;
  }

  /**
   * Start monitoring the given session for changes and auto-saving.
   */
  public start(session: Session): void {
    this.stop(); // clean up any previous session

    this._session = session;
    this._dirty = false;
    this._changeVersion = 0;
    this._lifecycleVersion++;
    this._lastModified = new Date();

    this.subscribeToSessionSignals(session);
    this.startTimer();

    logger.debug("AutoSave", `Started for session: ${session.name}`);
  }

  /**
   * Stop auto-saving and clean up subscriptions.
   */
  public stop(): void {
    this.stopTimer();
    this.disposeSubscriptions();
    this._session = null;
    this._dirty = false;
    this._lifecycleVersion++;
  }

  /**
   * Mark the session as dirty (has unsaved changes).
   */
  public markDirty(): void {
    const wasDirty = this._dirty;
    this._dirty = true;
    this._changeVersion++;
    this._lastModified = new Date();
    if (!wasDirty) this.dirtyChanged.emit(true);
  }

  /**
   * Force an immediate save (e.g. on window beforeunload).
   */
  public saveNow(): Promise<void> {
    const requestedSession = this._session;
    if (!requestedSession || !this._dirty) return Promise.resolve();
    const requestedVersion = this._changeVersion;
    const requestedLifecycleVersion = this._lifecycleVersion;
    const previousSave =
      this._saveQueues.get(requestedSession.id) ?? Promise.resolve();

    const queuedSave = previousSave.then(() =>
      this.saveSession(
        requestedSession,
        requestedVersion,
        requestedLifecycleVersion,
      ),
    );
    const retainedQueue = queuedSave.catch(() => undefined);
    this._saveQueues.set(requestedSession.id, retainedQueue);
    void retainedQueue.finally(() => {
      if (this._saveQueues.get(requestedSession.id) === retainedQueue) {
        this._saveQueues.delete(requestedSession.id);
      }
    });
    return queuedSave;
  }

  private async saveSession(
    session: Session,
    requestedVersion: number,
    requestedLifecycleVersion: number,
  ): Promise<void> {
    if (
      this._session !== session ||
      this._lifecycleVersion !== requestedLifecycleVersion ||
      !this._dirty
    ) {
      return;
    }

    try {
      const storage = SessionStorage.getInstance();
      await storage.saveSession(session);
      if (
        this._session === session &&
        this._lifecycleVersion === requestedLifecycleVersion &&
        this._changeVersion === requestedVersion
      ) {
        this._dirty = false;
        this.dirtyChanged.emit(false);
        this.saved.emit(new Date());
      }
      logger.debug("AutoSave", `Session saved: ${session.name}`);
    } catch (err) {
      logger.error("AutoSave", "Failed to save session:", err);
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private startTimer(): void {
    this._timerId = setInterval(() => {
      this.saveNow();
    }, AUTO_SAVE_INTERVAL_MS);
  }

  private stopTimer(): void {
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
  }

  private disposeSubscriptions(): void {
    for (const sub of this._subscriptions) {
      sub.dispose();
    }
    this._subscriptions = [];
  }

  /**
   * Subscribe to relevant session signals so that any structural or
   * transport change automatically marks the session as dirty.
   */
  private subscribeToSessionSignals(session: Session): void {
    const markDirty = () => this.markDirty();

    this._subscriptions.push(
      session.trackAdded.connect(markDirty),
      session.trackRemoved.connect(markDirty),
      session.rangeAdded.connect(markDirty),
      session.rangeRemoved.connect(markDirty),
      session.tempoChanged.connect(markDirty),
      session.timeSignatureChanged.connect(markDirty),
      session.sendBusAdded.connect(markDirty),
      session.sendBusRemoved.connect(markDirty),
      session.markerAdded.connect(markDirty),
      session.markerRemoved.connect(markDirty),
      session.markerChanged.connect(markDirty),
      session.loopRangeChanged.connect(markDirty),
      session.loopEnabledChanged.connect(markDirty),
      session.punchRangeChanged.connect(markDirty),
      session.punchEnabledChanged.connect(markDirty),
      session.rippleEditChanged.connect(markDirty),
      session.regionGroupAdded.connect(markDirty),
      session.regionGroupRemoved.connect(markDirty),
    );
  }
}
