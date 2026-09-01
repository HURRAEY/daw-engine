import { describe, expect, it, vi } from "vitest";

import { MidiNote } from "./MidiNote";
import { MidiRegion } from "./MidiRegion";
import { Playlist } from "./Playlist";

function createRegion(): MidiRegion {
  return new MidiRegion("region", "Region", 0, 960);
}

describe("Playlist MIDI region signals", () => {
  it("forwards note additions as MIDI region changes", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const region = createRegion();
    const midiRegionChanged = vi.fn();
    playlist.midiRegionChanged.connect(midiRegionChanged);
    playlist.addMidiRegion(region);

    region.addNote(new MidiNote("note", 60, 100, 0, 480));

    expect(midiRegionChanged).toHaveBeenCalledOnce();
    expect(midiRegionChanged).toHaveBeenCalledWith(region);
  });

  it("forwards note removals as MIDI region changes", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const region = createRegion();
    const note = new MidiNote("note", 60, 100, 0, 480);
    region.addNote(note);
    playlist.addMidiRegion(region);
    const midiRegionChanged = vi.fn();
    playlist.midiRegionChanged.connect(midiRegionChanged);

    region.removeNote(note.id);

    expect(midiRegionChanged).toHaveBeenCalledOnce();
    expect(midiRegionChanged).toHaveBeenCalledWith(region);
  });

  it("forwards note mutations as MIDI region changes", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const region = createRegion();
    const note = new MidiNote("note", 60, 100, 0, 480);
    region.addNote(note);
    playlist.addMidiRegion(region);
    const midiRegionChanged = vi.fn();
    playlist.midiRegionChanged.connect(midiRegionChanged);

    note.setPitch(61);

    expect(midiRegionChanged).toHaveBeenCalledOnce();
    expect(midiRegionChanged).toHaveBeenCalledWith(region);
  });

  it("forwards lock changes as MIDI region changes", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const region = createRegion();
    const midiRegionChanged = vi.fn();
    playlist.midiRegionChanged.connect(midiRegionChanged);
    playlist.addMidiRegion(region);

    region.setLocked(true);

    expect(midiRegionChanged).toHaveBeenCalledOnce();
    expect(midiRegionChanged).toHaveBeenCalledWith(region);
  });

  it("stops forwarding mutations after removing a MIDI region", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const region = createRegion();
    const note = new MidiNote("note", 60, 100, 0, 480);
    region.addNote(note);
    playlist.addMidiRegion(region);
    playlist.removeMidiRegion(region.id);
    const midiRegionChanged = vi.fn();
    playlist.midiRegionChanged.connect(midiRegionChanged);

    note.setPitch(61);
    region.setLocked(true);
    region.addNote(new MidiNote("other-note", 64, 100, 480, 480));

    expect(midiRegionChanged).not.toHaveBeenCalled();
  });
});
