import type { UndoableCommand } from "../Command";
import type { Marker, MarkerId } from "../../domain/Marker";
import type { Session } from "../../domain/Session";

export class RenameMarkerCommand implements UndoableCommand {
  private previousName: string | null = null;

  public constructor(
    private readonly session: Session,
    private readonly markerId: MarkerId,
    private readonly name: string,
  ) {}

  public async execute(): Promise<void> {
    const marker = this.requireMarker();
    this.previousName ??= marker.name;
    marker.name = this.name;
  }

  public async undo(): Promise<void> {
    if (this.previousName === null) {
      return;
    }
    this.requireMarker().name = this.previousName;
  }

  public async redo(): Promise<void> {
    this.requireMarker().name = this.name;
  }

  private requireMarker(): Marker {
    const marker = this.session.getMarker(this.markerId);
    if (!marker) {
      throw new Error(`Marker not found: ${this.markerId}`);
    }
    return marker;
  }
}
