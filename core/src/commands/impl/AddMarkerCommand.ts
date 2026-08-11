import { UndoableCommand } from "../Command";
import { AudioEngine } from "../../audio/AudioEngine";
import { MarkerId } from "../../domain/Marker";
import { FrameCount } from "../../domain/types";

import { logger } from "../../utils/Logger";
export class AddMarkerCommand implements UndoableCommand {
  private readonly markerId = crypto.randomUUID() as MarkerId;

  constructor(
    private name: string,
    private position: FrameCount,
    private color?: string,
  ) {}

  public get id(): MarkerId {
    return this.markerId;
  }

  async execute(): Promise<void> {
    const session = AudioEngine.getInstance().session;
    // Reuse one ID across redo so external marker references remain valid.
    session.addMarker(this.name, this.position, this.color, this.markerId);
    logger.debug(
      "AddMarkerCommand",
      `Added marker "${this.name}" at frame ${this.position}`,
    );
  }

  async undo(): Promise<void> {
    const session = AudioEngine.getInstance().session;
    session.removeMarker(this.markerId);
    logger.debug("AddMarkerCommand", `Undo: removed marker "${this.name}"`);
  }

  async redo(): Promise<void> {
    await this.execute();
  }
}
