import { Signal } from "../lib/Signal";
import type { Session } from "./Session";
import { TrackId } from "./types";
import { PluginInsert } from "../processing/PluginInsert";

// ─── MixerScene Snapshot Types ────────────────────────────────────────────────

export interface MixerSceneTrackState {
  trackId: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  /** Map of processorId -> { paramId -> value } */
  pluginParameters: Record<string, Record<string, number>>;
}

export interface MixerSceneSnapshot {
  id: string;
  name: string;
  createdAt: number;
  tracks: MixerSceneTrackState[];
}

// ─── MixerScene ───────────────────────────────────────────────────────────────

/**
 * Captures all track volumes, pans, mutes, solos, and plugin parameters
 * at a point in time so they can be recalled later.
 */
export class MixerScene {
  public readonly id: string;
  public name: string;
  public readonly createdAt: number;
  public readonly tracks: MixerSceneTrackState[];

  constructor(
    id: string,
    name: string,
    tracks: MixerSceneTrackState[],
    createdAt?: number,
  ) {
    this.id = id;
    this.name = name;
    this.tracks = tracks;
    this.createdAt = createdAt ?? Date.now();
  }

  public toJSON(): MixerSceneSnapshot {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt,
      tracks: this.tracks,
    };
  }

  public static fromJSON(data: MixerSceneSnapshot): MixerScene {
    return new MixerScene(data.id, data.name, data.tracks, data.createdAt);
  }
}

// ─── MixerSceneManager ───────────────────────────────────────────────────────

/**
 * Manages saving, recalling, and deleting mixer scenes for a Session.
 */
export class MixerSceneManager {
  private _scenes: Map<string, MixerScene> = new Map();

  public readonly sceneAdded = new Signal<MixerScene>();
  public readonly sceneRemoved = new Signal<string>();
  public readonly sceneRecalled = new Signal<string>();
  public readonly sceneRenamed = new Signal<string>();

  /**
   * Capture the current mixer state from the session and save as a scene.
   */
  public saveScene(name: string, session: Session): string {
    const id = crypto.randomUUID();
    const trackStates: MixerSceneTrackState[] = [];

    for (const track of session.tracks) {
      const pluginParams: Record<string, Record<string, number>> = {};

      for (const proc of track.route.processors) {
        if (proc instanceof PluginInsert) {
          const paramMap: Record<string, number> = {};
          for (const param of proc.plugin.getParameters()) {
            paramMap[param.id] = param.value;
          }
          pluginParams[proc.id] = paramMap;
        }
      }

      trackStates.push({
        trackId: track.id,
        volume: track.route.volume,
        pan: track.route.pan,
        mute: track.mute,
        solo: track.solo,
        pluginParameters: pluginParams,
      });
    }

    const scene = new MixerScene(id, name, trackStates);
    this._scenes.set(id, scene);
    this.sceneAdded.emit(scene);
    return id;
  }

  /**
   * Recall (restore) a saved mixer scene, applying volumes/pans/mutes/solos/plugin params.
   */
  public recallScene(sceneId: string, session: Session): boolean {
    const scene = this._scenes.get(sceneId);
    if (!scene) return false;

    for (const trackState of scene.tracks) {
      const track = session.getTrack(trackState.trackId as TrackId);
      if (!track) continue;

      track.route.volume = trackState.volume;
      track.route.pan = trackState.pan;
      track.setMute(trackState.mute);
      track.setSolo(trackState.solo);

      // Restore plugin parameters
      for (const [procId, paramMap] of Object.entries(
        trackState.pluginParameters,
      )) {
        const proc = track.route.processors.find((p) => p.id === procId);
        if (proc instanceof PluginInsert) {
          for (const [paramId, value] of Object.entries(paramMap)) {
            proc.plugin.setParameter(paramId, value);
          }
        }
      }
    }

    this.sceneRecalled.emit(sceneId);
    return true;
  }

  /**
   * Delete a scene by ID.
   */
  public deleteScene(sceneId: string): boolean {
    if (!this._scenes.has(sceneId)) return false;
    this._scenes.delete(sceneId);
    this.sceneRemoved.emit(sceneId);
    return true;
  }

  /**
   * Rename a scene by ID.
   */
  public renameScene(sceneId: string, name: string): boolean {
    const scene = this._scenes.get(sceneId);
    if (!scene) return false;
    if (scene.name === name) return true;

    scene.name = name;
    this.sceneRenamed.emit(sceneId);
    return true;
  }

  /**
   * Get all saved scenes.
   */
  public get scenes(): ReadonlyArray<MixerScene> {
    return Array.from(this._scenes.values());
  }

  /**
   * Get a specific scene.
   */
  public getScene(sceneId: string): MixerScene | undefined {
    return this._scenes.get(sceneId);
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  public toJSON(): MixerSceneSnapshot[] {
    return Array.from(this._scenes.values()).map((s) => s.toJSON());
  }

  public loadFromJSON(snapshots: MixerSceneSnapshot[]): void {
    this._scenes.clear();
    for (const snap of snapshots) {
      const scene = MixerScene.fromJSON(snap);
      this._scenes.set(scene.id, scene);
    }
  }
}
