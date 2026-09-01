import { SessionStorage } from "./SessionStorage";
import { Session, SessionSnapshot } from "../domain/Session";
import { Signal } from "../lib/Signal";
import { Track } from "../domain/Track";
import { Source } from "../domain/Source";
import { Processor } from "../processing/Processor";
import { PluginInsert } from "../processing/PluginInsert";
import { Route } from "../domain/Route";
import { Range } from "../domain/Range";
import { SendBus } from "../domain/SendBus";
import { RegionGroup } from "../domain/RegionGroup";
import { TrackGroup } from "../domain/TrackGroup";
import { CDMarker } from "../domain/CDMarker";
import { VCATrack } from "../domain/VCATrack";
import { Take, TakeLane } from "../domain/Take";

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
  private _trackSubscriptions = new Map<
    string,
    {
      route: Route;
      subscriptions: Array<{ dispose: () => void }>;
    }
  >();
  private _sourceSubscriptions = new Map<
    string,
    Array<{ dispose: () => void }>
  >();
  private _processorSubscriptions = new Map<
    Route,
    Map<string, Array<{ dispose: () => void }>>
  >();
  private _nestedSubscriptions = new Map<
    string,
    Array<{ dispose: () => void }>
  >();
  private _takeSubscriptions = new Map<
    TakeLane,
    Map<Take, { dispose: () => void }>
  >();
  private _changeVersion = 0;
  private _lifecycleVersion = 0;
  private _sessionSaveQueues = new WeakMap<Session, Promise<void>>();
  private _sessionIdSaveQueues = new Map<string, Promise<void>>();

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
    let requestedSnapshot: SessionSnapshot;
    try {
      requestedSnapshot = requestedSession.toJSON();
    } catch (error) {
      logger.error("AutoSave", "Failed to serialize session:", error);
      return Promise.resolve();
    }
    const requestedVersion = this._changeVersion;
    const requestedLifecycleVersion = this._lifecycleVersion;
    const requestedSessionId = requestedSnapshot.id;
    const previousSessionSave =
      this._sessionSaveQueues.get(requestedSession) ?? Promise.resolve();
    const previousSessionIdSave =
      this._sessionIdSaveQueues.get(requestedSessionId) ?? Promise.resolve();

    const queuedSave = Promise.all([
      previousSessionSave,
      previousSessionIdSave,
    ]).then(() =>
      this.saveSession(
        requestedSession,
        requestedSnapshot,
        requestedVersion,
        requestedLifecycleVersion,
      ),
    );
    const retainedQueue = queuedSave.catch(() => undefined);
    this._sessionSaveQueues.set(requestedSession, retainedQueue);
    this._sessionIdSaveQueues.set(requestedSessionId, retainedQueue);
    void retainedQueue.finally(() => {
      if (this._sessionIdSaveQueues.get(requestedSessionId) === retainedQueue) {
        this._sessionIdSaveQueues.delete(requestedSessionId);
      }
    });
    return queuedSave;
  }

  private async saveSession(
    session: Session,
    snapshot: SessionSnapshot,
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
      await storage.saveSession({
        id: snapshot.id,
        name: snapshot.name,
        toJSON: () => snapshot,
      });
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
    for (const entry of this._trackSubscriptions.values()) {
      entry.subscriptions.forEach((subscription) => subscription.dispose());
    }
    this._trackSubscriptions.clear();
    for (const subscriptions of this._sourceSubscriptions.values()) {
      subscriptions.forEach((subscription) => subscription.dispose());
    }
    this._sourceSubscriptions.clear();
    for (const routeSubscriptions of this._processorSubscriptions.values()) {
      routeSubscriptions.forEach((subscriptions) =>
        subscriptions.forEach((subscription) => subscription.dispose()),
      );
    }
    this._processorSubscriptions.clear();
    this._nestedSubscriptions.forEach((subscriptions) =>
      subscriptions.forEach((subscription) => subscription.dispose()),
    );
    this._nestedSubscriptions.clear();
    this._takeSubscriptions.forEach((subscriptions) =>
      subscriptions.forEach((subscription) => subscription.dispose()),
    );
    this._takeSubscriptions.clear();
  }

  /**
   * Subscribe to relevant session signals so that any structural or
   * transport change automatically marks the session as dirty.
   */
  private subscribeToSessionSignals(session: Session): void {
    const markDirty = () => this.markDirty();

    this._subscriptions.push(
      session.trackAdded.connect((track) => {
        this.subscribeToTrack(track);
        this.markDirty();
      }),
      session.trackRemoved.connect((trackId) => {
        this.disposeTrackSubscriptions(trackId);
        this.markDirty();
      }),
      session.sourceAdded.connect((source) => {
        this.subscribeToSource(source);
        this.markDirty();
      }),
      session.sourceRemoved.connect((sourceId) => {
        this.disposeSourceSubscriptions(sourceId);
        this.markDirty();
      }),
      session.rangeAdded.connect((range) => {
        this.subscribeToRange(range);
        this.markDirty();
      }),
      session.rangeRemoved.connect((rangeId) => {
        this.disposeNestedSubscriptions(`range:${rangeId}`);
        this.markDirty();
      }),
      session.tempoChanged.connect(markDirty),
      session.timeSignatureChanged.connect(markDirty),
      session.sendBusAdded.connect((sendBus) => {
        this.subscribeToSendBus(sendBus);
        this.markDirty();
      }),
      session.sendBusRemoved.connect((sendBusId) => {
        this.disposeNestedSubscriptions(`send:${sendBusId}`);
        this.markDirty();
      }),
      session.markerAdded.connect(markDirty),
      session.markerRemoved.connect(markDirty),
      session.markerChanged.connect(markDirty),
      session.loopRangeChanged.connect(markDirty),
      session.loopEnabledChanged.connect(markDirty),
      session.punchRangeChanged.connect(markDirty),
      session.punchEnabledChanged.connect(markDirty),
      session.rippleEditChanged.connect(markDirty),
      session.regionGroupAdded.connect((group) => {
        this.subscribeToRegionGroup(group);
        this.markDirty();
      }),
      session.regionGroupRemoved.connect((groupId) => {
        this.disposeNestedSubscriptions(`region-group:${groupId}`);
        this.markDirty();
      }),
      session.trackGroupAdded.connect((group) => {
        this.subscribeToTrackGroup(group);
        this.markDirty();
      }),
      session.trackGroupRemoved.connect((groupId) => {
        this.disposeNestedSubscriptions(`track-group:${groupId}`);
        this.markDirty();
      }),
      session.cdMarkerAdded.connect((marker) => {
        this.subscribeToCDMarker(marker);
        this.markDirty();
      }),
      session.cdMarkerRemoved.connect((markerId) => {
        this.disposeNestedSubscriptions(`cd-marker:${markerId}`);
        this.markDirty();
      }),
      session.vcaTrackAdded.connect((vca) => {
        this.subscribeToVCA(vca);
        this.markDirty();
      }),
      session.vcaTrackRemoved.connect((vcaId) => {
        this.disposeNestedSubscriptions(`vca:${vcaId}`);
        this.markDirty();
      }),
      session.takeLaneAdded.connect((lane) => {
        this.subscribeToTakeLane(lane);
        this.markDirty();
      }),
      session.takeLaneRemoved.connect((laneId) => {
        this.disposeNestedSubscriptions(`take-lane:${laneId}`);
        this.disposeTakeLaneSubscriptionsById(laneId);
        this.markDirty();
      }),
      session.trackReordered.connect(markDirty),
      session.loopRecordingChanged.connect(markDirty),
      session.preRollChanged.connect(markDirty),
      session.metronomeChanged.connect(markDirty),
      session.metronomeVolumeChanged.connect(markDirty),
      session.sidechainConfigChanged.connect(markDirty),
      session.gridSettings.changed.connect(markDirty),
      session.tempoMap.changed.connect(markDirty),
      session.mixerSceneManager.sceneAdded.connect(markDirty),
      session.mixerSceneManager.sceneRemoved.connect(markDirty),
      session.mixerSceneManager.sceneRenamed.connect(markDirty),
      session.restored.connect(markDirty),
    );

    this.subscribeToRoute(session.masterBus, this._subscriptions);
    session.tracks.forEach((track) => this.subscribeToTrack(track));
    session.sources.forEach((source) => this.subscribeToSource(source));
    session.ranges.forEach((range) => this.subscribeToRange(range));
    session.sendBuses.forEach((sendBus) => this.subscribeToSendBus(sendBus));
    session.regionGroups.forEach((group) => this.subscribeToRegionGroup(group));
    session.trackGroups.forEach((group) => this.subscribeToTrackGroup(group));
    session.cdMarkers.forEach((marker) => this.subscribeToCDMarker(marker));
    session.vcaTracks.forEach((vca) => this.subscribeToVCA(vca));
    session.takeLanes.forEach((lane) => this.subscribeToTakeLane(lane));
  }

  private subscribeToTrack(track: Track): void {
    this.disposeTrackSubscriptions(track.id);
    const markDirty = () => this.markDirty();
    const subscriptions: Array<{ dispose: () => void }> = [
      track.armChanged.connect(markDirty),
      track.monitorChanged.connect(markDirty),
      track.muteChanged.connect(markDirty),
      track.soloChanged.connect(markDirty),
      track.soloIsolateChanged.connect(markDirty),
      track.soloSafeChanged.connect(markDirty),
      track.monitorModeChanged.connect(markDirty),
      track.trimGainChanged.connect(markDirty),
      track.colorChanged.connect(markDirty),
      track.frozenChanged.connect(markDirty),
      track.alignStyleChanged.connect(markDirty),
      track.trackModeChanged.connect(markDirty),
      track.recordModeChanged.connect(markDirty),
      track.bounceProgressChanged.connect(markDirty),
      track.nameChanged.connect(markDirty),
      track.commentChanged.connect(markDirty),
      track.parentTrackChanged.connect(markDirty),
      track.playlist.regionAdded.connect(markDirty),
      track.playlist.regionRemoved.connect(markDirty),
      track.playlist.regionChanged.connect(markDirty),
      track.playlist.midiRegionAdded.connect(markDirty),
      track.playlist.midiRegionRemoved.connect(markDirty),
      track.playlist.midiRegionChanged.connect(markDirty),
      track.playlist.crossfadeAdded.connect(markDirty),
      track.playlist.crossfadeRemoved.connect(markDirty),
      track.playlist.crossfadeChanged.connect(markDirty),
    ];
    this.subscribeToRoute(track.route, subscriptions);
    this._trackSubscriptions.set(track.id, {
      route: track.route,
      subscriptions,
    });
  }

  private subscribeToRoute(
    route: Route,
    subscriptions: Array<{ dispose: () => void }>,
  ): void {
    const markDirty = () => this.markDirty();
    subscriptions.push(
      route.input.connected.connect(markDirty),
      route.input.disconnected.connect(markDirty),
      route.input.latencyChanged.connect(markDirty),
      route.output.connected.connect(markDirty),
      route.output.disconnected.connect(markDirty),
      route.output.latencyChanged.connect(markDirty),
      route.processorAdded.connect((processor) => {
        this.subscribeToProcessor(route, processor);
        this.markDirty();
      }),
      route.processorRemoved.connect((processorId) => {
        this.disposeProcessorSubscriptions(route, processorId);
        this.markDirty();
      }),
      route.processorReordered.connect(markDirty),
      route.coreProcessorsRestored.connect(
        ({ previousProcessors, currentProcessors }) => {
          previousProcessors.forEach((processor) =>
            this.disposeProcessorSubscriptions(route, processor.id),
          );
          currentProcessors.forEach((processor) =>
            this.subscribeToProcessor(route, processor),
          );
          this.markDirty();
        },
      ),
    );
    route.processors.forEach((processor) =>
      this.subscribeToProcessor(route, processor),
    );
  }

  private subscribeToProcessor(route: Route, processor: Processor): void {
    this.disposeProcessorSubscriptions(route, processor.id);
    const markDirty = () => this.markDirty();
    const subscriptions: Array<{ dispose: () => void }> = [];
    subscriptions.push(
      processor.activeChanged.connect(markDirty),
      processor.stateChanged.connect(markDirty),
      processor.latencyChanged.connect(markDirty),
      processor.tailLengthChanged.connect(markDirty),
      processor.automationAdded.connect(({ list }) => {
        subscriptions.push(
          list.changed.connect(markDirty),
          list.modeChanged.connect(markDirty),
        );
        this.markDirty();
      }),
    );
    processor.automations.forEach((list) => {
      subscriptions.push(
        list.changed.connect(markDirty),
        list.modeChanged.connect(markDirty),
      );
    });
    if (processor instanceof PluginInsert) {
      subscriptions.push(processor.plugin.parameterChanged.connect(markDirty));
    }
    const routeSubscriptions =
      this._processorSubscriptions.get(route) ?? new Map();
    routeSubscriptions.set(processor.id, subscriptions);
    this._processorSubscriptions.set(route, routeSubscriptions);
  }

  private subscribeToSource(source: Source): void {
    this.disposeSourceSubscriptions(source.id);
    this._sourceSubscriptions.set(source.id, [
      source.analysisCompleted.connect(() => this.markDirty()),
    ]);
  }

  private subscribeToRange(range: Range): void {
    this.setNestedSubscriptions(`range:${range.id}`, [
      range.changed.connect(() => this.markDirty()),
    ]);
  }

  private subscribeToSendBus(sendBus: SendBus): void {
    const markDirty = () => this.markDirty();
    this.setNestedSubscriptions(`send:${sendBus.id}`, [
      sendBus.levelChanged.connect(markDirty),
      sendBus.preFaderChanged.connect(markDirty),
      sendBus.activeChanged.connect(markDirty),
    ]);
  }

  private subscribeToRegionGroup(group: RegionGroup): void {
    this.setNestedSubscriptions(`region-group:${group.id}`, [
      group.changed.connect(() => this.markDirty()),
    ]);
  }

  private subscribeToTrackGroup(group: TrackGroup): void {
    this.setNestedSubscriptions(`track-group:${group.id}`, [
      group.changed.connect(() => this.markDirty()),
    ]);
  }

  private subscribeToCDMarker(marker: CDMarker): void {
    this.setNestedSubscriptions(`cd-marker:${marker.id}`, [
      marker.changed.connect(() => this.markDirty()),
    ]);
  }

  private subscribeToVCA(vca: VCATrack): void {
    const markDirty = () => this.markDirty();
    this.setNestedSubscriptions(`vca:${vca.id}`, [
      vca.gainChanged.connect(markDirty),
      vca.slaveAdded.connect(markDirty),
      vca.slaveRemoved.connect(markDirty),
      vca.muteChanged.connect(markDirty),
      vca.soloChanged.connect(markDirty),
      vca.automationEnabledChanged.connect(markDirty),
    ]);
  }

  private subscribeToTakeLane(lane: TakeLane): void {
    const markDirty = () => this.markDirty();
    this.disposeTakeLaneSubscriptionsById(lane.id);
    this.setNestedSubscriptions(`take-lane:${lane.id}`, [
      lane.takeAdded.connect((take) => {
        this.subscribeToTake(lane, take);
        this.markDirty();
      }),
      lane.takeRemoved.connect((takeId) => {
        this.disposeTakeSubscriptionsById(lane, takeId);
        this.markDirty();
      }),
      lane.activeChanged.connect(markDirty),
    ]);
    this._takeSubscriptions.set(lane, new Map());
    lane.takes.forEach((take) => this.subscribeToTake(lane, take));
  }

  private subscribeToTake(lane: TakeLane, take: Take): void {
    const subscriptions = this._takeSubscriptions.get(lane) ?? new Map();
    subscriptions.get(take)?.dispose();
    subscriptions.set(
      take,
      take.selectionChanged.connect(() => this.markDirty()),
    );
    this._takeSubscriptions.set(lane, subscriptions);
  }

  private disposeTakeSubscriptionsById(lane: TakeLane, takeId: string): void {
    const subscriptions = this._takeSubscriptions.get(lane);
    if (!subscriptions) return;
    for (const [take, subscription] of subscriptions) {
      if (take.id !== takeId) continue;
      subscription.dispose();
      subscriptions.delete(take);
    }
  }

  private disposeTakeLaneSubscriptionsById(laneId: string): void {
    for (const [lane, subscriptions] of this._takeSubscriptions) {
      if (lane.id !== laneId) continue;
      subscriptions.forEach((subscription) => subscription.dispose());
      this._takeSubscriptions.delete(lane);
    }
  }

  private setNestedSubscriptions(
    key: string,
    subscriptions: Array<{ dispose: () => void }>,
  ): void {
    this.disposeNestedSubscriptions(key);
    this._nestedSubscriptions.set(key, subscriptions);
  }

  private disposeNestedSubscriptions(key: string): void {
    this._nestedSubscriptions
      .get(key)
      ?.forEach((subscription) => subscription.dispose());
    this._nestedSubscriptions.delete(key);
  }

  private disposeTrackSubscriptions(trackId: string): void {
    const entry = this._trackSubscriptions.get(trackId);
    entry?.subscriptions.forEach((subscription) => subscription.dispose());
    if (entry) {
      this.disposeRouteProcessorSubscriptions(entry.route);
    }
    this._trackSubscriptions.delete(trackId);
  }

  private disposeRouteProcessorSubscriptions(route: Route): void {
    const routeSubscriptions = this._processorSubscriptions.get(route);
    routeSubscriptions?.forEach((subscriptions) =>
      subscriptions.forEach((subscription) => subscription.dispose()),
    );
    this._processorSubscriptions.delete(route);
  }

  private disposeProcessorSubscriptions(
    route: Route,
    processorId: string,
  ): void {
    const routeSubscriptions = this._processorSubscriptions.get(route);
    routeSubscriptions
      ?.get(processorId)
      ?.forEach((subscription) => subscription.dispose());
    routeSubscriptions?.delete(processorId);
  }

  private disposeSourceSubscriptions(sourceId: string): void {
    this._sourceSubscriptions
      .get(sourceId)
      ?.forEach((subscription) => subscription.dispose());
    this._sourceSubscriptions.delete(sourceId);
  }
}
