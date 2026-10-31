import { describe, expect, it, vi } from "vitest";

import { MidiNote } from "./MidiNote";
import { MidiRegion } from "./MidiRegion";

function createRegion(): MidiRegion {
  return new MidiRegion("region", "Region", 0, 960);
}

function createNote(id: string, pitch: number = 60): MidiNote {
  return new MidiNote(id, pitch, 100, 0, 480);
}

describe("MidiRegion note subscriptions", () => {
  it("forwards changes from an attached note", () => {
    const region = createRegion();
    const note = createNote("note");
    const noteChanged = vi.fn();
    region.noteChanged.connect(noteChanged);
    region.addNote(note);

    note.setPitch(61);

    expect(noteChanged).toHaveBeenCalledOnce();
    expect(noteChanged).toHaveBeenCalledWith(note);
  });

  it("stops forwarding changes after removing a note", () => {
    const region = createRegion();
    const note = createNote("note");
    const noteChanged = vi.fn();
    region.noteChanged.connect(noteChanged);
    region.addNote(note);
    region.removeNote(note.id);

    note.setPitch(61);

    expect(noteChanged).not.toHaveBeenCalled();
  });

  it("replaces a duplicate note ID without retaining the old listener", () => {
    const region = createRegion();
    const originalNote = createNote("note", 60);
    const replacementNote = createNote("note", 62);
    const noteChanged = vi.fn();
    region.noteChanged.connect(noteChanged);
    region.addNote(originalNote);
    region.addNote(replacementNote);

    originalNote.setPitch(61);
    replacementNote.setPitch(63);

    expect(region.notes).toEqual([replacementNote]);
    expect(noteChanged).toHaveBeenCalledOnce();
    expect(noteChanged).toHaveBeenCalledWith(replacementNote);
  });
});
