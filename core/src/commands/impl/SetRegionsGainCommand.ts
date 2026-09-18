import { Region } from "../../domain/Region";
import { Session } from "../../domain/Session";
import { Track } from "../../domain/Track";
import { RegionId, TrackId } from "../../domain/types";
import { UndoableCommand } from "../Command";

export interface RegionGainChange {
  trackId: TrackId;
  regionId: RegionId;
  linearGain: number;
}

interface ResolvedRegionGainChange extends RegionGainChange {
  track: Track;
  region: Region;
}

export class SetRegionsGainCommand implements UndoableCommand {
  public readonly id: string;
  private readonly session: Session;
  private readonly changes: RegionGainChange[];
  private previousGains?: number[];

  constructor(session: Session, changes: ReadonlyArray<RegionGainChange>) {
    this.id = crypto.randomUUID();
    this.session = session;
    this.changes = changes.map(change => ({ ...change }));
  }

  public async execute(): Promise<void> {
    this.validateChanges();
    const resolvedChanges = this.resolveTargets();

    if (!this.previousGains) {
      this.previousGains = resolvedChanges.map(({ region }) => region.gain);
    }

    this.applyGains(
      resolvedChanges,
      resolvedChanges.map(({ linearGain }) => linearGain),
    );
  }

  public async undo(): Promise<void> {
    if (!this.previousGains) {
      return;
    }

    const resolvedChanges = this.resolveTargets();
    this.applyGains(resolvedChanges, this.previousGains);
  }

  public async redo(): Promise<void> {
    this.validateChanges();
    const resolvedChanges = this.resolveTargets();
    this.applyGains(
      resolvedChanges,
      resolvedChanges.map(({ linearGain }) => linearGain),
    );
  }

  private validateChanges(): void {
    if (this.changes.length === 0) {
      throw new Error("At least one region gain change is required");
    }

    const targetKeys = new Set<string>();
    this.changes.forEach(({ trackId, regionId, linearGain }) => {
      if (!Number.isFinite(linearGain) || linearGain < 0) {
        throw new Error(
          `linearGain must be a finite number greater than or equal to 0: ${linearGain}`,
        );
      }

      const targetKey = `${trackId}\u0000${regionId}`;
      if (targetKeys.has(targetKey)) {
        throw new Error(`Duplicate region gain target: ${regionId}`);
      }
      targetKeys.add(targetKey);
    });
  }

  private resolveTargets(): ResolvedRegionGainChange[] {
    return this.changes.map(change => {
      const track = this.session.getTrack(change.trackId);
      if (!track) {
        throw new Error(`Track ${change.trackId} not found`);
      }

      const region = track.playlist.getRegion(change.regionId);
      if (!region) {
        throw new Error(`Region ${change.regionId} not found`);
      }

      return { ...change, track, region };
    });
  }

  private applyGains(
    resolvedChanges: ResolvedRegionGainChange[],
    linearGains: number[],
  ): void {
    resolvedChanges.forEach(({ region }, index) => {
      region.gain = linearGains[index];
    });

    const changedRegionByTrack = new Map<TrackId, ResolvedRegionGainChange>();
    resolvedChanges.forEach(change => {
      if (!changedRegionByTrack.has(change.trackId)) {
        changedRegionByTrack.set(change.trackId, change);
      }
    });
    changedRegionByTrack.forEach(({ track, region }) => {
      track.playlist.regionChanged.emit(region);
    });
  }
}
