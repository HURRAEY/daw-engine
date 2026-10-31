import { UndoableCommand } from "../Command";
import { AudioEngine } from "../../audio/AudioEngine";
import { SessionSnapshot } from "../../domain/Session";

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
    const engine = AudioEngine.getInstance();
    await this.applySnapshot(this.snapshotToLoad, engine);
  }

  /**
   * 기존 세션을 비우고 스냅샷으로부터 상태를 복원합니다.
   * UI Signal 체계를 유지하기 위해 기존 Session 인스턴스를 재사용합니다.
   */
  private async applySnapshot(
    snapshot: SessionSnapshot,
    engine: AudioEngine,
  ): Promise<void> {
    await engine.restoreSessionFromSnapshot(snapshot);
  }
}
