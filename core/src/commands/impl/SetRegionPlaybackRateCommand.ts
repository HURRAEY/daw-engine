import { UndoableCommand } from "../Command";
import { Session } from "../../domain/Session";
import { AudioEngine } from "../../audio/AudioEngine";
import { TrackId, RegionId } from "../../domain/types";

/**
 * SetRegionPlaybackRateCommand
 *
 * Sets the playback rate of a region (basic time stretch / pitch shift).
 */
export class SetRegionPlaybackRateCommand implements UndoableCommand {
  public readonly id: string;
  private session: Session;
  private audioEngine: AudioEngine;
  private trackId: TrackId;
  private regionId: RegionId;
  private playbackRate: number;

  private previousPlaybackRate: number | null = null;

  constructor(
    session: Session,
    audioEngine: AudioEngine,
    trackId: TrackId,
    regionId: RegionId,
    playbackRate: number,
  ) {
    if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
      throw new RangeError("Playback rate must be a finite positive number");
    }
    this.id = crypto.randomUUID();
    this.session = session;
    this.audioEngine = audioEngine;
    this.trackId = trackId;
    this.regionId = regionId;
    this.playbackRate = playbackRate;
  }

  public async execute(): Promise<void> {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }

    const region = track.playlist.getRegion(this.regionId);
    if (!region) {
      throw new Error(`Region ${this.regionId} not found`);
    }

    this.previousPlaybackRate = region.playbackRate;
    region.playbackRate = this.playbackRate;

    // Notify backend via updateRegion
    this.audioEngine.updateRegion(this.trackId, region);
  }

  public async undo(): Promise<void> {
    if (this.previousPlaybackRate === null) return;

    const track = this.session.getTrack(this.trackId);
    if (!track) return;

    const region = track.playlist.getRegion(this.regionId);
    if (!region) return;

    region.playbackRate = this.previousPlaybackRate;
    this.audioEngine.updateRegion(this.trackId, region);
  }

  public async redo(): Promise<void> {
    await this.execute();
  }
}
