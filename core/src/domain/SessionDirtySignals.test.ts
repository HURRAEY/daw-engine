import { describe, expect, it, vi } from "vitest";

import { Session } from "./Session";

describe("Session persisted-state signals", () => {
  it("emits track metadata changes only when values change", () => {
    const session = new Session("session");
    const track = session.addTrack("Original", undefined, "track");
    const nameChanged = vi.fn();
    const commentChanged = vi.fn();
    const parentTrackChanged = vi.fn();
    track.nameChanged.connect(nameChanged);
    track.commentChanged.connect(commentChanged);
    track.parentTrackChanged.connect(parentTrackChanged);

    track.rename("Renamed");
    track.rename("Renamed");
    track.setComment("Comment");
    track.setComment("Comment");
    session.setTrackParent(track.id, "folder");
    session.setTrackParent(track.id, "folder");

    expect(nameChanged).toHaveBeenCalledOnce();
    expect(nameChanged).toHaveBeenCalledWith("Renamed");
    expect(commentChanged).toHaveBeenCalledOnce();
    expect(commentChanged).toHaveBeenCalledWith("Comment");
    expect(parentTrackChanged).toHaveBeenCalledOnce();
    expect(parentTrackChanged).toHaveBeenCalledWith("folder");
  });

  it("emits take-lane lifecycle signals and exposes current lanes", () => {
    const session = new Session("session");
    const track = session.addTrack("Track", undefined, "track");
    const added = vi.fn();
    const removed = vi.fn();
    session.takeLaneAdded.connect(added);
    session.takeLaneRemoved.connect(removed);

    const lane = session.addTakeLane(track.id, "lane");

    expect(added).toHaveBeenCalledWith(lane);
    expect(session.takeLanes).toEqual([lane]);

    session.removeTakeLane(lane.id);
    session.removeTakeLane(lane.id);

    expect(removed).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledWith(lane.id);
    expect(session.takeLanes).toEqual([]);
  });

  it("emits added lanes during in-place restore", () => {
    const source = new Session("source");
    const track = source.addTrack("Track", undefined, "track");
    source.addTakeLane(track.id, "lane");
    const target = new Session("target");
    const added = vi.fn();
    target.takeLaneAdded.connect(added);

    target.restoreFromJSON(source.toJSON());

    expect(added).toHaveBeenCalledOnce();
    expect(added.mock.calls[0][0].id).toBe("lane");
    expect(target.takeLanes).toHaveLength(1);
  });

  it("forwards sidechain filter changes and detaches removed configs", () => {
    const session = new Session("session");
    const track = session.addTrack("Track", undefined, "track");
    const config = session.addSidechainConfig(
      track.id,
      "processor",
      "sidechain",
    );
    const changed = vi.fn();
    session.sidechainConfigChanged.connect(changed);

    config.setSidechainFilter(true, 120);

    expect(changed).toHaveBeenCalledOnce();

    session.removeSidechainConfig(config.id);
    changed.mockClear();
    config.setSidechainFilter(false, 80);

    expect(changed).not.toHaveBeenCalled();
  });
});
