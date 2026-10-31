import { Region } from "./Region";
import { MidiRegion } from "./MidiRegion";
import { Crossfade, CrossfadeId, CrossfadeType, FadeCurve } from "./Crossfade";
import { RegionId, FrameCount } from "./types";
import { Signal } from "../lib/Signal";
import { ThawList } from "./ThawList";
import { RecordMode } from "./RecordMode";

export class Playlist {
  public readonly id: string;
  public name: string;
  private regions: Region[] = [];
  private regionSubscriptions = new Map<
    Region,
    Array<{ dispose: () => void }>
  >();
  private midiRegions: MidiRegion[] = [];
  private midiRegionSubscriptions = new Map<
    MidiRegion,
    Array<{ dispose: () => void }>
  >();
  private _crossfades: Map<CrossfadeId, Crossfade> = new Map();
  private _thawList: ThawList = new ThawList();

  // Signals (Audio Regions)
  public readonly regionAdded = new Signal<Region>();
  public readonly regionRemoved = new Signal<RegionId>();
  public readonly regionChanged = new Signal<Region>();

  // Signals (MIDI Regions)
  public readonly midiRegionAdded = new Signal<MidiRegion>();
  public readonly midiRegionRemoved = new Signal<RegionId>();
  public readonly midiRegionChanged = new Signal<MidiRegion>();

  // Signals (Crossfades)
  public readonly crossfadeAdded = new Signal<Crossfade>();
  public readonly crossfadeRemoved = new Signal<CrossfadeId>();
  public readonly crossfadeChanged = new Signal<Crossfade>();

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  public addRegion(region: Region) {
    this.regions.push(region);
    this.bindRegion(region);
    this.sortRegions();
    this._thawList.queueEmission(this.regionAdded, region);

    // Auto-create crossfades for overlapping regions on the same layer
    const overlapping = this.getOverlappingRegions(region);
    for (const other of overlapping) {
      if (other.layer === region.layer) {
        this.autoCreateCrossfade(region, other);
      }
    }
  }

  public removeRegion(regionId: RegionId) {
    // Remove any crossfades associated with this region
    const relatedCrossfades = this.getCrossfadesForRegion(regionId);
    for (const xfade of relatedCrossfades) {
      this.removeCrossfade(xfade.id);
    }

    const removedRegions = this.regions.filter(
      (region) => region.id === regionId,
    );
    this.regions = this.regions.filter((region) => region.id !== regionId);
    for (const removedRegion of removedRegions) {
      this.disposeRegionSubscriptions(removedRegion);
    }
    this._thawList.queueEmission(this.regionRemoved, regionId);
  }

  public getRegions(): ReadonlyArray<Region> {
    return this.regions;
  }

  public getRegion(regionId: RegionId): Region | undefined {
    return this.regions.find((r) => r.id === regionId);
  }

  public getTopLayer(): number {
    if (this.regions.length === 0) {
      return -1;
    }
    return Math.max(...this.regions.map((region) => region.layer));
  }

  public setRegionLayer(regionId: RegionId, layer: number): void {
    const region = this.getRegion(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }
    region.layer = Math.max(0, Math.trunc(layer));
    this.notifyRegionChanged(region);
  }

  public setRegionOpaque(regionId: RegionId, opaque: boolean): void {
    const region = this.getRegion(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }
    region.opaque = opaque;
    this.notifyRegionChanged(region);
  }

  public insertRecordedRegion(region: Region, mode: RecordMode): void {
    region.layer = this.getTopLayer() + 1;
    region.opaque = mode !== RecordMode.SOUND_ON_SOUND;

    if (mode === RecordMode.NON_LAYERED) {
      this.replaceOverlappingRegions(region);
    }

    this.addRegion(region);
  }

  public getRegionsInRange(start: FrameCount, end: FrameCount): Region[] {
    return this.regions.filter((r) => r.end > start && r.start < end);
  }

  /**
   * Shift all regions whose start >= afterFrame by deltaFrames.
   * Used for ripple editing.
   */
  public rippleShift(afterFrame: FrameCount, deltaFrames: number): void {
    for (const region of this.regions) {
      if (region.start >= afterFrame) {
        const newStart = Math.max(0, region.start + deltaFrames);
        region.move(newStart);
        this._thawList.queueEmission(this.regionChanged, region);
      }
    }
    this.sortRegions();
  }

  public notifyRegionChanged(region: Region): void {
    this.sortRegions();
    this.updateCrossfadesForRegion(region.id);
    this._thawList.queueEmission(this.regionChanged, region);
  }

  private replaceOverlappingRegions(recordedRegion: Region): void {
    const overlappingRegions = [...this.getOverlappingRegions(recordedRegion)];
    for (const existingRegion of overlappingRegions) {
      this.replaceOverlap(existingRegion, recordedRegion);
    }
  }

  private replaceOverlap(existingRegion: Region, recordedRegion: Region): void {
    const existingEnd = existingRegion.end;
    const coversExisting =
      recordedRegion.start <= existingRegion.start &&
      recordedRegion.end >= existingEnd;
    if (coversExisting) {
      this.removeRegion(existingRegion.id);
      return;
    }

    const splitsExisting =
      existingRegion.start < recordedRegion.start &&
      existingEnd > recordedRegion.end;
    if (splitsExisting) {
      this.splitAroundRecordedRegion(existingRegion, recordedRegion);
      return;
    }

    if (existingRegion.start < recordedRegion.start) {
      this.trimExistingRegionEnd(existingRegion, recordedRegion.start);
      return;
    }

    this.trimExistingRegionStart(existingRegion, recordedRegion.end);
  }

  private trimExistingRegionEnd(region: Region, end: FrameCount): void {
    region.length = end - region.start;
    region.fadeOut = 0;
    region.transients = region.transients.filter((position) => {
      return position < region.length;
    });
    this.notifyRegionChanged(region);
  }

  private trimExistingRegionStart(region: Region, start: FrameCount): void {
    const trimLength = start - region.start;
    const oldEnd = region.end;
    region.start = start;
    region.sourceStart += trimLength;
    region.length = oldEnd - start;
    region.fadeIn = 0;
    region.transients = region.transients
      .map((position) => position - trimLength)
      .filter((position) => position >= 0 && position < region.length);
    this.notifyRegionChanged(region);
  }

  private splitAroundRecordedRegion(
    region: Region,
    recordedRegion: Region,
  ): void {
    const rightRegion = this.createRightSegment(region, recordedRegion.end);
    this.trimExistingRegionEnd(region, recordedRegion.start);
    this.addRegion(rightRegion);
  }

  private createRightSegment(region: Region, start: FrameCount): Region {
    const timelineOffset = start - region.start;
    const rightRegion = new Region(
      crypto.randomUUID() as RegionId,
      region.sourceId,
      start,
      region.end - start,
      region.sourceStart + timelineOffset,
      `${region.name}-R`,
      region.layer,
    );
    rightRegion.gain = region.gain;
    rightRegion.muted = region.muted;
    rightRegion.opaque = region.opaque;
    rightRegion.fadeIn = 0;
    rightRegion.fadeOut = region.fadeOut;
    rightRegion.fadeInShape = region.fadeInShape;
    rightRegion.fadeOutShape = region.fadeOutShape;
    rightRegion.playbackRate = region.playbackRate;
    rightRegion.stretch = region.stretch;
    rightRegion.pitchSemitones = region.pitchSemitones;
    rightRegion.syncPosition = region.syncPosition;
    rightRegion.transients = region.transients
      .filter((position) => position >= timelineOffset)
      .map((position) => position - timelineOffset);
    rightRegion.locked = region.locked;
    rightRegion.timeDomain = region.timeDomain;
    return rightRegion;
  }

  private sortRegions() {
    this.regions.sort((a, b) => a.start - b.start);
  }

  private bindRegion(region: Region): void {
    this.disposeRegionSubscriptions(region);
    this.regionSubscriptions.set(region, [
      region.lockedChanged.connect(() => {
        this._thawList.queueEmission(this.regionChanged, region);
      }),
    ]);
  }

  private disposeRegionSubscriptions(region: Region): void {
    const subscriptions = this.regionSubscriptions.get(region) ?? [];
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
    this.regionSubscriptions.delete(region);
  }

  // ─── MIDI Region Management ──────────────────────────────────────────────

  public addMidiRegion(region: MidiRegion): void {
    this.midiRegions.push(region);
    this.bindMidiRegion(region);
    this.sortMidiRegions();
    this._thawList.queueEmission(this.midiRegionAdded, region);
  }

  public removeMidiRegion(regionId: RegionId): void {
    const removedRegions = this.midiRegions.filter(
      (region) => region.id === regionId,
    );
    this.midiRegions = this.midiRegions.filter(
      (region) => region.id !== regionId,
    );
    for (const removedRegion of removedRegions) {
      this.disposeMidiRegionSubscriptions(removedRegion);
    }
    this._thawList.queueEmission(this.midiRegionRemoved, regionId);
  }

  public getMidiRegions(): ReadonlyArray<MidiRegion> {
    return this.midiRegions;
  }

  public getMidiRegion(regionId: RegionId): MidiRegion | undefined {
    return this.midiRegions.find((r) => r.id === regionId);
  }

  public getMidiRegionsInRange(
    start: FrameCount,
    end: FrameCount,
  ): MidiRegion[] {
    return this.midiRegions.filter((r) => r.end > start && r.start < end);
  }

  private sortMidiRegions(): void {
    this.midiRegions.sort((a, b) => a.start - b.start);
  }

  private bindMidiRegion(region: MidiRegion): void {
    this.disposeMidiRegionSubscriptions(region);
    const notifyRegionChanged = (): void => {
      this._thawList.queueEmission(this.midiRegionChanged, region);
    };
    this.midiRegionSubscriptions.set(region, [
      region.noteAdded.connect(notifyRegionChanged),
      region.noteRemoved.connect(notifyRegionChanged),
      region.noteChanged.connect(notifyRegionChanged),
      region.lockedChanged.connect(notifyRegionChanged),
    ]);
  }

  private disposeMidiRegionSubscriptions(region: MidiRegion): void {
    const subscriptions = this.midiRegionSubscriptions.get(region) ?? [];
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
    this.midiRegionSubscriptions.delete(region);
  }

  // ─── C-1: Overlap & Coverage Detection ───────────────────────────────────

  /**
   * Return all audio regions that overlap with the given region's time span.
   * The query region itself is excluded from results.
   */
  public getOverlappingRegions(region: Region): Region[] {
    return this.regions.filter(
      (r) => r.id !== region.id && r.start < region.end && region.start < r.end,
    );
  }

  /**
   * Return all audio regions that are audible (not muted) at a given frame.
   * Results are sorted by layer (highest first) so the top-most region is first.
   */
  public audibleRegionsAt(frame: FrameCount): Region[] {
    return this.regions
      .filter((r) => !r.muted && r.covers(frame))
      .sort((a, b) => b.layer - a.layer);
  }

  // ─── C-5: Playlist Query Enhancement ─────────────────────────────────────

  /** All regions (muted or not) that cover the given frame. */
  public regionsAt(frame: FrameCount): Region[] {
    return this.regions.filter((r) => r.covers(frame));
  }

  /** Highest-layer region at a given frame (may be muted). */
  public topRegionAt(frame: FrameCount): Region | null {
    const matching = this.regionsAt(frame);
    if (matching.length === 0) return null;
    return matching.reduce((top, r) => (r.layer > top.layer ? r : top));
  }

  /** Highest-layer unmuted region at a given frame. */
  public topUnmutedRegionAt(frame: FrameCount): Region | null {
    const audible = this.audibleRegionsAt(frame);
    return audible.length > 0 ? audible[0] : null;
  }

  /**
   * Find the next region start or end boundary in the given direction.
   *
   * @param frame      The reference frame.
   * @param direction  1 for forward, -1 for backward.
   * @returns The nearest region whose start is strictly in the given
   *          direction, or null if none found.
   */
  public findNextRegion(frame: FrameCount, direction: 1 | -1): Region | null {
    if (direction === 1) {
      // Forward: find the first region whose start is > frame
      for (const r of this.regions) {
        if (r.start > frame) return r;
      }
      return null;
    } else {
      // Backward: find the last region whose start is < frame
      for (let i = this.regions.length - 1; i >= 0; i--) {
        if (this.regions[i].start < frame) return this.regions[i];
      }
      return null;
    }
  }

  /**
   * Find the next region boundary (start or end) in the given direction.
   *
   * @param frame      The reference frame.
   * @param direction  1 for forward, -1 for backward.
   * @returns The nearest boundary frame, or null if none found.
   */
  public findNextRegionBoundary(
    frame: FrameCount,
    direction: 1 | -1,
  ): FrameCount | null {
    // Collect all unique boundary positions
    const boundaries: Set<number> = new Set();
    for (const r of this.regions) {
      boundaries.add(r.start);
      boundaries.add(r.end);
    }

    const sorted = Array.from(boundaries).sort((a, b) => a - b);

    if (direction === 1) {
      for (const b of sorted) {
        if (b > frame) return b;
      }
      return null;
    } else {
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i] < frame) return sorted[i];
      }
      return null;
    }
  }

  /**
   * Is the region with the given id actually audible at the specified frame?
   *
   * A region is audible if it is not muted and is the top-layer region at
   * that frame (i.e., no higher-layer unmuted region occludes it).
   */
  public regionIsAudibleAt(regionId: RegionId, frame: FrameCount): boolean {
    const region = this.regions.find((r) => r.id === regionId);
    if (!region || region.muted || !region.covers(frame)) {
      return false;
    }

    // Check that no higher-layer unmuted region covers this frame
    for (const r of this.regions) {
      if (r.id === regionId) continue;
      if (!r.muted && r.opaque && r.covers(frame) && r.layer > region.layer) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get the bounding box (earliest start, latest end) of all audio regions.
   * Returns { start: 0, end: 0 } if there are no regions.
   */
  public getExtent(): { start: FrameCount; end: FrameCount } {
    if (this.regions.length === 0) {
      return { start: 0, end: 0 };
    }

    let earliest = Infinity;
    let latest = -Infinity;
    for (const r of this.regions) {
      if (r.start < earliest) earliest = r.start;
      if (r.end > latest) latest = r.end;
    }
    return { start: earliest, end: latest };
  }

  // ─── Crossfade Management ────────────────────────────────────────────────

  /**
   * Add a crossfade to the playlist. Subscribes to its changed signal
   * so the playlist can re-emit crossfadeChanged.
   */
  public addCrossfade(crossfade: Crossfade): void {
    this._crossfades.set(crossfade.id, crossfade);
    crossfade.changed.connect(() => {
      this._thawList.queueEmission(this.crossfadeChanged, crossfade);
    });
    this._thawList.queueEmission(this.crossfadeAdded, crossfade);
  }

  /**
   * Remove a crossfade by its ID.
   */
  public removeCrossfade(id: CrossfadeId): void {
    const crossfade = this._crossfades.get(id);
    if (!crossfade) return;
    crossfade.changed.clear();
    this._crossfades.delete(id);
    this._thawList.queueEmission(this.crossfadeRemoved, id);
  }

  /**
   * Get a crossfade by its ID.
   */
  public getCrossfade(id: CrossfadeId): Crossfade | undefined {
    return this._crossfades.get(id);
  }

  /**
   * Get all crossfades in the playlist.
   */
  public getCrossfades(): ReadonlyArray<Crossfade> {
    return Array.from(this._crossfades.values());
  }

  /**
   * Get all crossfades that involve the given region (as either the
   * fade-in or fade-out side).
   */
  public getCrossfadesForRegion(regionId: RegionId): Crossfade[] {
    const result: Crossfade[] = [];
    for (const xfade of this._crossfades.values()) {
      if (xfade.inRegionId === regionId || xfade.outRegionId === regionId) {
        result.push(xfade);
      }
    }
    return result;
  }

  /**
   * Auto-detect the overlap between two regions and create a crossfade if
   * they overlap. Returns the created crossfade, or null if there is no
   * overlap.
   *
   * @param regionA       First region.
   * @param regionB       Second region.
   * @param defaultLength Optional: override the crossfade length instead of
   *                      using the actual overlap length.
   */
  public autoCreateCrossfade(
    regionA: Region,
    regionB: Region,
    defaultLength?: FrameCount,
  ): Crossfade | null {
    const overlap = Crossfade.calculateOverlap(regionA, regionB);
    if (!overlap) return null;

    // Check if a crossfade already exists between these two regions
    for (const xfade of this._crossfades.values()) {
      const ids = [xfade.inRegionId, xfade.outRegionId];
      if (ids.includes(regionA.id) && ids.includes(regionB.id)) {
        // Update the existing crossfade instead of creating a duplicate
        xfade.setPosition(overlap.position);
        xfade.setLength(defaultLength ?? overlap.length);
        return xfade;
      }
    }

    const length = defaultLength ?? overlap.length;
    const id = crypto.randomUUID() as CrossfadeId;

    const crossfade = new Crossfade(
      id,
      overlap.inRegionId,
      overlap.outRegionId,
      overlap.position,
      length,
      CrossfadeType.FULL,
      FadeCurve.EQUAL_POWER,
      FadeCurve.EQUAL_POWER,
    );

    this.addCrossfade(crossfade);
    return crossfade;
  }

  /**
   * Recalculate all crossfades that involve a given region. Call this after
   * a region is moved, resized, or trimmed so that the crossfade positions
   * and lengths stay in sync with the actual overlap.
   *
   * Crossfades whose regions no longer overlap are automatically removed.
   */
  public updateCrossfadesForRegion(regionId: RegionId): void {
    const region = this.getRegion(regionId);
    if (!region) return;

    const relatedCrossfades = this.getCrossfadesForRegion(regionId);
    for (const xfade of relatedCrossfades) {
      const otherRegionId =
        xfade.inRegionId === regionId ? xfade.outRegionId : xfade.inRegionId;
      const otherRegion = this.getRegion(otherRegionId);

      if (!otherRegion) {
        // Other region no longer exists; remove the crossfade
        this.removeCrossfade(xfade.id);
        continue;
      }

      if (otherRegion.layer !== region.layer) {
        this.removeCrossfade(xfade.id);
        continue;
      }

      const overlap = Crossfade.calculateOverlap(region, otherRegion);
      if (!overlap) {
        // No longer overlapping; remove the crossfade
        this.removeCrossfade(xfade.id);
      } else {
        // Update position and length to match the new overlap
        xfade.setPosition(overlap.position);
        xfade.setLength(overlap.length);
      }
    }

    for (const otherRegion of this.getOverlappingRegions(region)) {
      if (otherRegion.layer === region.layer) {
        this.autoCreateCrossfade(region, otherRegion);
      }
    }
  }

  // ─── Batch Editing (ThawList Integration) ───────────────────────────────

  /** Freeze signal emissions; all signals are queued until thaw(). */
  public freeze(): void {
    this._thawList.freeze();
  }

  /** Thaw and emit all queued signals. */
  public thaw(): void {
    this._thawList.thaw();
  }

  // ─── Partition ──────────────────────────────────────────────────────────

  /**
   * Split all regions at a given frame position.
   * Regions that span the frame are split into two: one ending at the frame
   * and one starting at the frame. Regions that don't cover the frame are
   * left untouched.
   */
  public partition(frame: number): void {
    const toSplit = this.regions.filter(
      (r) => r.covers(frame) && r.start !== frame,
    );
    for (const region of toSplit) {
      const originalEnd = region.end;
      const originalSourceStart = region.sourceStart;
      const offsetIntoRegion = frame - region.start;

      // Shrink the original region to end at the split point
      region.resize(offsetIntoRegion);
      this._thawList.queueEmission(this.regionChanged, region);

      // Create the right-side region
      const rightId = crypto.randomUUID() as RegionId;
      const rightLength = originalEnd - frame;
      const rightSourceStart = originalSourceStart + offsetIntoRegion;
      const rightRegion = new Region(
        rightId,
        region.sourceId,
        frame,
        rightLength,
        rightSourceStart,
        region.name + "-R",
        region.layer,
      );
      rightRegion.gain = region.gain;
      rightRegion.muted = region.muted;
      rightRegion.opaque = region.opaque;
      rightRegion.fadeOut = region.fadeOut;
      rightRegion.fadeOutShape = region.fadeOutShape;

      // Clear the original's fade-out (it's now at the split boundary)
      region.fadeOut = 0;

      this.addRegion(rightRegion);
    }
  }

  // ─── Duplicate ──────────────────────────────────────────────────────────

  /**
   * Duplicate a single region with a time offset.
   * Returns the new region, or null if the source region was not found.
   */
  public duplicateRegion(regionId: string, offset: number): Region | null {
    const source = this.getRegion(regionId);
    if (!source) return null;

    const newId = crypto.randomUUID() as RegionId;
    const newRegion = new Region(
      newId,
      source.sourceId,
      source.start + offset,
      source.length,
      source.sourceStart,
      source.name + " (copy)",
      source.layer,
    );
    newRegion.gain = source.gain;
    newRegion.muted = source.muted;
    newRegion.opaque = source.opaque;
    newRegion.fadeIn = source.fadeIn;
    newRegion.fadeOut = source.fadeOut;
    newRegion.fadeInShape = source.fadeInShape;
    newRegion.fadeOutShape = source.fadeOutShape;
    newRegion.playbackRate = source.playbackRate;
    newRegion.stretch = source.stretch;
    newRegion.pitchSemitones = source.pitchSemitones;

    this.addRegion(newRegion);
    return newRegion;
  }

  /**
   * Duplicate multiple regions with a time offset.
   * Returns an array of the newly created regions.
   */
  public duplicateRegions(regionIds: string[], offset: number): Region[] {
    const results: Region[] = [];
    for (const id of regionIds) {
      const dup = this.duplicateRegion(id, offset);
      if (dup) results.push(dup);
    }
    return results;
  }

  // ─── Nudge ──────────────────────────────────────────────────────────────

  /** Nudge all regions by the given number of frames (positive or negative). */
  public nudge(frames: number): void {
    for (const region of this.regions) {
      const newStart = Math.max(0, region.start + frames);
      region.move(newStart);
      this._thawList.queueEmission(this.regionChanged, region);
    }
    this.sortRegions();
  }

  /** Nudge a single region by the given number of frames. */
  public nudgeRegion(regionId: string, frames: number): void {
    const region = this.getRegion(regionId);
    if (!region) return;
    const newStart = Math.max(0, region.start + frames);
    region.move(newStart);
    this._thawList.queueEmission(this.regionChanged, region);
    this.sortRegions();
  }
}
