import { UndoableCommand } from "../Command";
import { AudioEngine } from "../../audio/AudioEngine";
import { SessionSnapshot } from "../../domain/Session";
import { TrackId, RegionId } from "../../domain/types";
import { TrackType } from "../../domain/Track";
import { SendBusId } from "../../domain/SendBus";

import { logger } from "../../utils/Logger";
/**
 * LoadSessionCommand – JSON 파일을 읽어 세션 상태를 복원합니다.
 *
 * Undo 시 이전 Session 상태로 복원합니다.
 * 주의: AudioEngine.session이 교체되므로 UI는 trackAdded signal로
 * 다시 연결됩니다. 현 구현에서는 AudioEngine.session 참조를 교체하는
 * 대신, clearAndRestore 패턴으로 기존 세션에 데이터를 주입합니다.
 */
export class LoadSessionCommand implements UndoableCommand {
  private _snapshotBeforeLoad?: SessionSnapshot;
  private readonly snapshotToLoad: SessionSnapshot;

  constructor(snapshot: SessionSnapshot) {
    this.snapshotToLoad = snapshot;
  }

  public async execute(): Promise<void> {
    const engine = AudioEngine.getInstance();
    // Save current state for undo
    this._snapshotBeforeLoad = engine.session.toJSON();

    await this.applySnapshot(this.snapshotToLoad, engine);
    logger.debug(
      "LoadSessionCommand",
      `Session loaded: ${this.snapshotToLoad.name}`,
    );
  }

  public async undo(): Promise<void> {
    if (!this._snapshotBeforeLoad) return;
    const engine = AudioEngine.getInstance();
    await this.applySnapshot(this._snapshotBeforeLoad, engine);
    logger.debug("LoadSessionCommand", `Undo: restored previous session state`);
  }

  public async redo(): Promise<void> {
    await this.execute();
  }

  /**
   * 기존 세션을 비우고 스냅샷으로부터 상태를 복원합니다.
   * UI Signal 체계를 유지하기 위해 기존 Session 인스턴스를 재사용합니다.
   */
  private async applySnapshot(
    snapshot: SessionSnapshot,
    engine: AudioEngine,
  ): Promise<void> {
    const session = engine.session;

    // 1. Remove all existing tracks (fires trackRemoved signals)
    const existingTrackIds = session.tracks.map((t) => t.id);
    for (const id of existingTrackIds) {
      session.removeTrack(id as TrackId);
    }

    // 2. Remove all existing send buses
    const existingSendBusIds = session.sendBuses.map((sb) => sb.id);
    for (const id of existingSendBusIds) {
      session.removeSendBus(id as SendBusId);
    }

    // 3. Restore transport state
    session.tempo = snapshot.tempo;
    session.timeSignature = snapshot.timeSignature;
    session.tempoChanged.emit(snapshot.tempo);

    // 4. Restore tracks and regions (fires trackAdded → AudioEngine creates backend track)
    const { Session: SessionClass } = await import("../../domain/Session");
    const _restoredSession = SessionClass.fromJSON(snapshot);

    for (const trackData of snapshot.tracks) {
      const track = session.addTrack(
        trackData.name,
        trackData.type as TrackType,
        trackData.id as TrackId,
      );
      track.armed = trackData.armed;
      track.mute = trackData.mute;
      track.solo = trackData.solo;
      if (trackData.recordMode !== undefined) {
        track.setRecordMode(trackData.recordMode);
      }

      for (const regionData of trackData.regions) {
        const { Region } = await import("../../domain/Region");
        const region = new Region(
          regionData.id as RegionId,
          regionData.sourceId,
          regionData.start,
          regionData.length,
          regionData.sourceStart,
          regionData.name,
          regionData.layer,
        );
        region.gain = regionData.gain;
        region.muted = regionData.muted;
        region.opaque = regionData.opaque ?? true;
        region.fadeIn = regionData.fadeIn;
        region.fadeOut = regionData.fadeOut;
        region.playbackRate = regionData.playbackRate;
        region.timeDomain = regionData.timeDomain;
        track.playlist.addRegion(region);
      }
    }

    // 5. Restore send buses (fires sendBusAdded → AudioEngine creates backend send bus)
    for (const sbData of snapshot.sendBuses) {
      session.addSendBus(
        sbData.sourceTrackId as TrackId,
        sbData.destId,
        sbData.level,
        sbData.preFader,
        sbData.id as SendBusId,
      );
    }
  }
}
