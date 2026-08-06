import { UndoableCommand } from "../Command";
import { Session } from "../../domain/Session";
import { TrackId, RegionId, FrameCount } from "../../domain/types";
import { UndoTransaction } from "../UndoTransaction";
import { moveRegionAndCreateTransaction } from "../history/moveRegionAndCreateTransaction";

export interface BatchMoveEntry {
  trackId: TrackId;
  regionId: RegionId;
  newStart: FrameCount;
  targetTrackId?: TrackId;
}

/**
 * Moves multiple regions atomically.
 * Typically used when the selection contains grouped regions:
 * the UI computes a delta from the primary (clicked) region and
 * applies the same delta to every selected region.
 */
export class BatchMoveRegionsCommand implements UndoableCommand {
  private transactions: UndoTransaction[] = [];

  constructor(
    private session: Session,
    private entries: BatchMoveEntry[],
  ) {}

  public async execute(): Promise<void> {
    this.transactions = this.entries.map((entry) =>
      moveRegionAndCreateTransaction({
        session: this.session,
        trackId: entry.trackId,
        regionId: entry.regionId,
        newStart: entry.newStart,
        targetTrackId: entry.targetTrackId,
      }),
    );
  }

  public async undo(): Promise<void> {
    for (let i = this.transactions.length - 1; i >= 0; i--) {
      await this.transactions[i].undo();
    }
  }

  public async redo(): Promise<void> {
    for (const transaction of this.transactions) {
      await transaction.redo();
    }
  }
}
