import { UndoableCommand } from "../Command";
import { Session } from "../../domain/Session";
import { TrackId, RegionId } from "../../domain/types";
import { AudioEngine } from "../../audio/AudioEngine";
import { Source } from "../../domain/Source";
import { Region } from "../../domain/Region";
import { AudioBufferToWav } from "../../utils/AudioBufferToWav";
import { AudioProvider } from "../../audio/AudioProvider";

export class MergeRegionsCommand implements UndoableCommand {
  public readonly id: string;
  private session: Session;
  private audioEngine: AudioEngine;
  private trackId: TrackId;
  private regionIds: RegionId[];

  private newRegion: Region | null = null;
  private oldRegions: Region[] = [];
  private newSource: Source | null = null;

  constructor(
    session: Session,
    audioEngine: AudioEngine,
    trackId: TrackId,
    regionIds: RegionId[],
  ) {
    this.id = crypto.randomUUID();
    this.session = session;
    this.audioEngine = audioEngine;
    this.trackId = trackId;
    this.regionIds = regionIds;
  }

  public async execute(): Promise<void> {
    const track = this.session.getTrack(this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }

    if (this.regionIds.length < 2) {
      throw new Error(`Merge requires at least 2 regions`);
    }

    // Save original regions
    this.oldRegions = this.regionIds
      .map((id) => track.playlist.getRegion(id))
      .filter((r) => r !== undefined) as Region[];

    if (this.oldRegions.length !== this.regionIds.length) {
      throw new Error(`Some regions to merge were not found`);
    }

    // Offline Render
    const audioBuffer = await this.audioEngine.renderRegionsToBuffer(
      this.trackId,
      this.regionIds,
    );

    // Convert to WAV Blob URL
    const blob = AudioBufferToWav.encode(audioBuffer, "float32");
    const url = URL.createObjectURL(blob);

    // Calculate bounds
    let minStart = Infinity;
    for (const r of this.oldRegions) {
      if (r.start < minStart) minStart = r.start;
    }

    const durationFrames = audioBuffer.length;

    // Create new Source
    this.newSource = new Source(
      crypto.randomUUID() as string,
      `Merged Source ${this.id.slice(0, 4)}`,
      url,
      durationFrames,
      audioBuffer.sampleRate,
      audioBuffer.numberOfChannels,
    );

    // This is async in real app, but we need it synchronous for Command?
    // Actually, AudioEngine.backend handles adding source asynchronously,
    // we can cast or wait. AddSourceCommand expects await.
    await this.session.addSource(this.newSource);

    // Remove old regions
    for (const id of this.regionIds) {
      track.playlist.removeRegion(id);
    }

    const topRegion = this.oldRegions.reduce((top, region) => {
      return region.layer > top.layer ? region : top;
    });

    // Create & Add new Region
    this.newRegion = new Region(
      crypto.randomUUID() as RegionId,
      this.newSource.id,
      minStart,
      durationFrames,
      0,
      "Merged Region",
      topRegion.layer,
    );
    this.newRegion.opaque = topRegion.opaque;

    track.playlist.addRegion(this.newRegion);

    // Ensure new buffer is cached in backend to avoid loading missing buffer issue
    // The URL is definitely our BlobURL
    const backend = (this.audioEngine as unknown as { backend: AudioProvider })
      .backend;
    if (backend && backend.cacheBlob) {
      await backend.cacheBlob(url, blob);
      // also trigger update immediately so backend knows the region right now
      backend.scheduleRegion(this.trackId, {
        ...this.newRegion,
        end: this.newRegion.start + this.newRegion.length,
        timeDomain: this.newRegion.timeDomain,
      });
    }
  }

  public async undo(): Promise<void> {
    const track = this.session.getTrack(this.trackId);
    if (!track || !this.newRegion) return;

    // Remove merged region
    track.playlist.removeRegion(this.newRegion.id);

    // Restore old regions
    for (const old of this.oldRegions) {
      track.playlist.addRegion(old);
    }
  }

  public async redo(): Promise<void> {
    const track = this.session.getTrack(this.trackId);
    if (!track || !this.newRegion) return;

    // Remove old regions
    for (const id of this.regionIds) {
      track.playlist.removeRegion(id);
    }

    // Add merged region back
    track.playlist.addRegion(this.newRegion);
  }
}
