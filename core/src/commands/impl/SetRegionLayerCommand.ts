import type { UndoableCommand } from "../Command";
import type { Playlist } from "../../domain/Playlist";
import type { Session } from "../../domain/Session";
import type { RegionId, TrackId } from "../../domain/types";

export class SetRegionLayerCommand implements UndoableCommand {
  private previousLayer: number | null = null;

  public constructor(
    private readonly session: Session,
    private readonly trackId: TrackId,
    private readonly regionId: RegionId,
    private readonly layer: number,
  ) {}

  public async execute(): Promise<void> {
    const playlist = this.requirePlaylist();
    this.previousLayer ??= playlist.getRegion(this.regionId)?.layer ?? null;
    playlist.setRegionLayer(this.regionId, this.layer);
  }

  public async undo(): Promise<void> {
    if (this.previousLayer === null) {
      return;
    }
    this.requirePlaylist().setRegionLayer(this.regionId, this.previousLayer);
  }

  public async redo(): Promise<void> {
    this.requirePlaylist().setRegionLayer(this.regionId, this.layer);
  }

  private requirePlaylist(): Playlist {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    return track.playlist;
  }
}
