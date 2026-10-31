import type { UndoableCommand } from "../Command";
import type { Marker, MarkerId } from "../../domain/Marker";
import type { Session } from "../../domain/Session";

export class SetMarkerLockedCommand implements UndoableCommand {
  private previousLocked: boolean | null = null;

  public constructor(
    private readonly session: Session,
    private readonly markerId: MarkerId,
    private readonly locked: boolean,
  ) {}

  public async execute(): Promise<void> {
    const marker = this.requireMarker();
    this.previousLocked ??= marker.locked;
    marker.locked = this.locked;
  }

  public async undo(): Promise<void> {
    if (this.previousLocked === null) {
      return;
    }
    this.requireMarker().locked = this.previousLocked;
  }

  public async redo(): Promise<void> {
    this.requireMarker().locked = this.locked;
  }

  private requireMarker(): Marker {
    const marker = this.session.getMarker(this.markerId);
    if (!marker) {
      throw new Error(`Marker not found: ${this.markerId}`);
    }
    return marker;
  }
}
