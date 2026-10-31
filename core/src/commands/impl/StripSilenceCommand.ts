import { UndoableCommand } from "../Command";
import { Session } from "../../domain/Session";
import { AudioEngine } from "../../audio/AudioEngine";
import { TrackId, RegionId } from "../../domain/types";
import { Region } from "../../domain/Region";

/**
 * StripSilenceCommand
 *
 * Detects silence in a region and splits it, removing silent parts.
 */
export class StripSilenceCommand implements UndoableCommand {
  public readonly id: string;
  private session: Session;
  private audioEngine: AudioEngine;
  private trackId: TrackId;
  private regionId: RegionId;
  private thresholdDb: number;
  private minLengthFrames: number;

  // Saved state for undo
  private originalRegion: Region | null = null;
  private newRegions: Region[] = [];

  constructor(
    session: Session,
    audioEngine: AudioEngine,
    trackId: TrackId,
    regionId: RegionId,
    thresholdDb: number = -60,
    minLengthFrames: number = 4410,
  ) {
    this.id = crypto.randomUUID();
    this.session = session;
    this.audioEngine = audioEngine;
    this.trackId = trackId;
    this.regionId = regionId;
    this.thresholdDb = thresholdDb;
    this.minLengthFrames = minLengthFrames;
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

    // Save original region
    this.originalRegion = region;

    // Analyze audio buffer for non-silent segments
    const segments = await this.audioEngine.stripSilence(
      this.trackId,
      this.regionId,
      this.thresholdDb,
      this.minLengthFrames,
    );

    if (segments.length === 0) {
      // Entire region is silent - remove it
      track.playlist.removeRegion(this.regionId);
      return;
    }

    // Remove original region
    track.playlist.removeRegion(this.regionId);

    // Create new regions for each non-silent segment
    this.newRegions = segments.map((seg, index) => {
      const newRegion = new Region(
        crypto.randomUUID() as RegionId,
        region.sourceId,
        region.start + seg.start, // Timeline position offset by segment start
        seg.length, // Length of the non-silent segment
        region.sourceStart + seg.start, // Source offset
        `${region.name} (${index + 1})`,
        region.layer,
      );
      newRegion.gain = region.gain;
      newRegion.muted = region.muted;
      newRegion.opaque = region.opaque;
      newRegion.playbackRate = region.playbackRate;
      newRegion.stretch = region.stretch;
      newRegion.pitchSemitones = region.pitchSemitones;
      newRegion.timeDomain = region.timeDomain;
      return newRegion;
    });

    // Add new regions
    for (const r of this.newRegions) {
      track.playlist.addRegion(r);
    }
  }

  public async undo(): Promise<void> {
    const track = this.session.getTrack(this.trackId);
    if (!track || !this.originalRegion) return;

    // Remove split regions
    for (const r of this.newRegions) {
      track.playlist.removeRegion(r.id);
    }

    // Restore original region
    track.playlist.addRegion(this.originalRegion);
  }

  public async redo(): Promise<void> {
    const track = this.session.getTrack(this.trackId);
    if (!track || !this.originalRegion) return;

    // Remove original
    track.playlist.removeRegion(this.originalRegion.id);

    // Re-add split regions
    for (const r of this.newRegions) {
      track.playlist.addRegion(r);
    }
  }
}
