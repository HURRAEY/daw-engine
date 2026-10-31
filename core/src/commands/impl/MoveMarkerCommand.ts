import { UndoableCommand } from "../Command";
import { AudioEngine } from "../../audio/AudioEngine";
import { MarkerId } from "../../domain/Marker";
import { FrameCount } from "../../domain/types";

import { logger } from "../../utils/Logger";
export class MoveMarkerCommand implements UndoableCommand {
  private oldPosition?: FrameCount;

  constructor(
    private markerId: MarkerId,
    private newPosition: FrameCount,
  ) {}

  async execute(): Promise<void> {
    const session = AudioEngine.getInstance().session;
    const marker = session.getMarker(this.markerId);
    if (!marker) throw new Error(`Marker not found: ${this.markerId}`);
    if (marker.locked) throw new Error(`Marker is locked: ${this.markerId}`);

    this.oldPosition = marker.position;
    marker.position = this.newPosition;
    logger.debug(
      "MoveMarkerCommand",
      `Moved marker "${marker.name}" from ${this.oldPosition} to ${this.newPosition}`,
    );
  }

  async undo(): Promise<void> {
    if (this.oldPosition !== undefined) {
      const session = AudioEngine.getInstance().session;
      const marker = session.getMarker(this.markerId);
      if (marker) {
        marker.position = this.oldPosition;
      }
    }
  }

  async redo(): Promise<void> {
    await this.execute();
  }
}
