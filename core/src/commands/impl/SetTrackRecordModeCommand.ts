import type { UndoableCommand } from "../Command";
import { RecordMode } from "../../domain/RecordMode";
import type { Session } from "../../domain/Session";
import type { Track } from "../../domain/Track";
import type { TrackId } from "../../domain/types";

export class SetTrackRecordModeCommand implements UndoableCommand {
  private previousMode: RecordMode | null = null;

  public constructor(
    private readonly session: Session,
    private readonly trackId: TrackId,
    private readonly mode: RecordMode,
  ) {}

  public async execute(): Promise<void> {
    const track = this.requireTrack();
    this.previousMode ??= track.recordMode;
    track.setRecordMode(this.mode);
  }

  public async undo(): Promise<void> {
    if (this.previousMode === null) {
      return;
    }
    this.requireTrack().setRecordMode(this.previousMode);
  }

  public async redo(): Promise<void> {
    this.requireTrack().setRecordMode(this.mode);
  }

  private requireTrack(): Track {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    return track;
  }
}
