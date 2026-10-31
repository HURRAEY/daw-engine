import type { UndoableCommand } from "../Command";
import type { Playlist } from "../../domain/Playlist";
import type { Session } from "../../domain/Session";
import type { RegionId, TrackId } from "../../domain/types";

export class SetRegionOpaqueCommand implements UndoableCommand {
  private previousOpaque: boolean | null = null;

  public constructor(
    private readonly session: Session,
    private readonly trackId: TrackId,
    private readonly regionId: RegionId,
    private readonly opaque: boolean,
  ) {}

  public async execute(): Promise<void> {
    const playlist = this.requirePlaylist();
    this.previousOpaque ??= playlist.getRegion(this.regionId)?.opaque ?? null;
    playlist.setRegionOpaque(this.regionId, this.opaque);
  }

  public async undo(): Promise<void> {
    if (this.previousOpaque === null) {
      return;
    }
    this.requirePlaylist().setRegionOpaque(this.regionId, this.previousOpaque);
  }

  public async redo(): Promise<void> {
    this.requirePlaylist().setRegionOpaque(this.regionId, this.opaque);
  }

  private requirePlaylist(): Playlist {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    return track.playlist;
  }
}
