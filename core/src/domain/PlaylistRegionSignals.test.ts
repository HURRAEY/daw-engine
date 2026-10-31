import { describe, expect, it, vi } from "vitest";

import { Playlist } from "./Playlist";
import { Region } from "./Region";

function createRegion(id: string = "region"): Region {
  return new Region(id, "source", 0, 960, 0, "Region");
}

describe("Playlist audio region signals", () => {
  it("forwards lock changes as region changes", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const region = createRegion();
    const regionChanged = vi.fn();
    playlist.regionChanged.connect(regionChanged);
    playlist.addRegion(region);

    region.setLocked(true);

    expect(regionChanged).toHaveBeenCalledOnce();
    expect(regionChanged).toHaveBeenCalledWith(region);
  });

  it("does not duplicate bindings when the same object is added twice", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const region = createRegion();
    const regionChanged = vi.fn();
    playlist.regionChanged.connect(regionChanged);
    playlist.addRegion(region);
    playlist.addRegion(region);

    region.setLocked(true);

    expect(regionChanged).toHaveBeenCalledOnce();
  });

  it("disposes every binding when duplicate region IDs are removed", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const firstRegion = createRegion("shared");
    const secondRegion = createRegion("shared");
    playlist.addRegion(firstRegion);
    playlist.addRegion(secondRegion);
    playlist.removeRegion("shared");
    const regionChanged = vi.fn();
    playlist.regionChanged.connect(regionChanged);

    firstRegion.setLocked(true);
    secondRegion.setLocked(true);

    expect(playlist.getRegions()).toEqual([]);
    expect(regionChanged).not.toHaveBeenCalled();
  });

  it("stops forwarding mutations after removing a region", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const region = createRegion();
    playlist.addRegion(region);
    playlist.removeRegion(region.id);
    const regionChanged = vi.fn();
    playlist.regionChanged.connect(regionChanged);

    region.setLocked(true);

    expect(regionChanged).not.toHaveBeenCalled();
  });
});
