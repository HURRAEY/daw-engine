import { UndoableCommand } from "../Command";
import { AudioEngine } from "../../audio/AudioEngine";
import { Session, SessionSnapshot } from "../../domain/Session";
import { createFromTemplate } from "../../storage/SessionTemplate";

import { logger } from "../../utils/Logger";
/**
 * NewSessionCommand -- creates a new session, optionally from a template.
 *
 * Undo restores the previous session state.
 */
export class NewSessionCommand implements UndoableCommand {
  private _snapshotBeforeNew?: SessionSnapshot;
  private _snapshotAfterNew?: SessionSnapshot;
  private readonly name?: string;
  private readonly templateId?: string;

  constructor(name?: string, templateId?: string) {
    this.name = name;
    this.templateId = templateId;
  }

  public async execute(): Promise<void> {
    const engine = AudioEngine.getInstance();
    this._snapshotBeforeNew = engine.session.toJSON();

    // Build the new session
    let newSession: Session;
    if (this.templateId) {
      newSession = createFromTemplate(this.templateId);
      if (this.name) {
        newSession.name = this.name;
      }
    } else {
      newSession = new Session(this.name ?? "Untitled Session");
    }

    // Apply the new session's snapshot onto the current engine session
    this._snapshotAfterNew = newSession.toJSON();
    await this.applySnapshot(this._snapshotAfterNew, engine);
    logger.debug(
      "NewSessionCommand",
      `New session created: ${engine.session.name}`,
    );
  }

  public async undo(): Promise<void> {
    if (!this._snapshotBeforeNew) return;
    const engine = AudioEngine.getInstance();
    await this.applySnapshot(this._snapshotBeforeNew, engine);
    logger.debug("NewSessionCommand", `Undo: restored previous session`);
  }

  public async redo(): Promise<void> {
    if (!this._snapshotAfterNew) return;
    const engine = AudioEngine.getInstance();
    await this.applySnapshot(this._snapshotAfterNew, engine);
  }

  private async applySnapshot(
    snapshot: SessionSnapshot,
    engine: AudioEngine,
  ): Promise<void> {
    await engine.restoreSessionFromSnapshot(snapshot);
  }
}
