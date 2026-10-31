import { Signal } from "../lib/Signal";
import { FrameCount, RegionId } from "./types";
import { MidiNote, MidiNoteId } from "./MidiNote";
import { TimeDomain, TimePosition } from "./temporal/types";
import { TempoMap } from "./temporal/TempoMap";

export class MidiRegion {
  public id: RegionId;
  public name: string;

  // Timeline position
  public start: FrameCount;
  public length: FrameCount;

  // Notes
  private _notes: MidiNote[] = [];
  private _noteChangedSubscriptions = new Map<
    MidiNoteId,
    { dispose: () => void }
  >();

  // Playback properties
  public muted: boolean = false;
  public layer: number = 0;
  public locked: boolean = false;

  /** Time domain for this region */
  public timeDomain: TimeDomain = TimeDomain.BeatTime;

  // Signals
  public readonly noteAdded = new Signal<MidiNote>();
  public readonly noteRemoved = new Signal<MidiNoteId>();
  public readonly noteChanged = new Signal<MidiNote>();
  public readonly lockedChanged = new Signal<boolean>();

  constructor(
    id: RegionId,
    name: string,
    start: FrameCount,
    length: FrameCount,
    layer: number = 0,
  ) {
    this.id = id;
    this.name = name;
    this.start = start;
    this.length = length;
    this.layer = layer;
  }

  public get end(): FrameCount {
    return this.start + this.length;
  }

  public get notes(): ReadonlyArray<MidiNote> {
    return this._notes;
  }

  public addNote(note: MidiNote): void {
    const existingNoteIndex = this._notes.findIndex(
      (existingNote) => existingNote.id === note.id,
    );
    this.disposeNoteChangedSubscription(note.id);

    if (existingNoteIndex === -1) {
      this._notes.push(note);
    } else {
      this._notes[existingNoteIndex] = note;
    }
    this.sortNotes();

    const subscription = note.changed.connect((changedNote) => {
      this.noteChanged.emit(changedNote);
    });
    this._noteChangedSubscriptions.set(note.id, subscription);

    this.noteAdded.emit(note);
  }

  public removeNote(noteId: MidiNoteId): MidiNote | undefined {
    const index = this._notes.findIndex((n) => n.id === noteId);
    if (index === -1) return undefined;

    const removed = this._notes.splice(index, 1)[0];
    this.disposeNoteChangedSubscription(noteId);
    this.noteRemoved.emit(noteId);
    return removed;
  }

  public getNote(noteId: MidiNoteId): MidiNote | undefined {
    return this._notes.find((n) => n.id === noteId);
  }

  public getNotes(): ReadonlyArray<MidiNote> {
    return this._notes;
  }

  /**
   * Get notes that overlap with the given frame range (relative to region start)
   */
  public getNotesInRange(
    startFrame: FrameCount,
    endFrame: FrameCount,
  ): MidiNote[] {
    return this._notes.filter(
      (n) => n.endFrame > startFrame && n.startFrame < endFrame,
    );
  }

  public move(newStart: FrameCount): void {
    if (newStart < 0) newStart = 0;
    this.start = newStart;
  }

  public resize(newLength: FrameCount): void {
    if (newLength < 0) return;
    this.length = newLength;
  }

  public setLocked(locked: boolean): void {
    if (this.locked === locked) return;
    this.locked = locked;
    this.lockedChanged.emit(locked);
  }

  /** Get position as TimePosition */
  getPosition(): TimePosition {
    return { domain: this.timeDomain, value: this.start };
  }

  /** Get duration as TimePosition */
  getDuration(): TimePosition {
    return { domain: this.timeDomain, value: this.length };
  }

  /** Set position from TimePosition (converts if needed) */
  setPosition(pos: TimePosition, tempoMap: TempoMap, bpm: number): void {
    this.start = tempoMap.toFrames(pos, bpm);
    this.timeDomain = pos.domain;
  }

  /** Set duration from TimePosition (converts if needed) */
  setDuration(duration: TimePosition, tempoMap: TempoMap, bpm: number): void {
    this.length = tempoMap.toFrames(duration, bpm);
    this.timeDomain = duration.domain;
  }

  private sortNotes(): void {
    this._notes.sort((a, b) => a.startFrame - b.startFrame);
  }

  private disposeNoteChangedSubscription(noteId: MidiNoteId): void {
    this._noteChangedSubscriptions.get(noteId)?.dispose();
    this._noteChangedSubscriptions.delete(noteId);
  }

  public toJSON(): MidiRegionSnapshot {
    return {
      id: this.id,
      name: this.name,
      start: this.start,
      length: this.length,
      muted: this.muted,
      layer: this.layer,
      locked: this.locked,
      timeDomain: this.timeDomain,
      notes: this._notes.map((n) => n.toJSON()),
    };
  }

  public static fromJSON(data: MidiRegionSnapshot): MidiRegion {
    const region = new MidiRegion(
      data.id as RegionId,
      data.name,
      data.start,
      data.length,
      data.layer,
    );
    region.muted = data.muted;
    region.locked = data.locked ?? false;
    region.timeDomain = data.timeDomain ?? TimeDomain.BeatTime;

    for (const noteData of data.notes) {
      const note = MidiNote.fromJSON(noteData);
      region.addNote(note);
    }

    return region;
  }
}

export interface MidiRegionSnapshot {
  id: string;
  name: string;
  start: number;
  length: number;
  muted: boolean;
  layer: number;
  locked?: boolean;
  timeDomain?: number;
  notes: Array<{
    id: string;
    pitch: number;
    velocity: number;
    startFrame: number;
    durationFrames: number;
    channel: number;
  }>;
}
