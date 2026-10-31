import { describe, expect, it } from "vitest";
import { Session } from "./Session";

describe("Session marker lifecycle", () => {
  it("forwards changes from restored markers", () => {
    const sourceSession = new Session("Source session");
    sourceSession.addMarker("Verse", 12_000, "#ffcc00", "marker-1");
    const restoredSession = Session.fromJSON(sourceSession.toJSON());
    const changedMarkerIds: string[] = [];

    restoredSession.markerChanged.connect((marker) => {
      changedMarkerIds.push(marker.id);
    });
    const restoredMarker = restoredSession.getMarker("marker-1");

    expect(restoredMarker).toBeDefined();
    restoredMarker!.name = "Intro";
    expect(changedMarkerIds).toEqual(["marker-1"]);
  });

  it("stops forwarding changes after a marker is removed", () => {
    const session = new Session("Marker cleanup");
    const marker = session.addMarker(
      "Temporary marker",
      24_000,
      "#ffcc00",
      "marker-1",
    );
    const changedMarkerIds: string[] = [];

    session.markerChanged.connect((changedMarker) => {
      changedMarkerIds.push(changedMarker.id);
    });
    session.removeMarker(marker.id);
    marker.name = "Detached marker";

    expect(changedMarkerIds).toEqual([]);
  });

  it("clamps an initial negative marker position to zero", () => {
    const session = new Session("Marker position");

    const marker = session.addMarker("Intro", -1);

    expect(marker.position).toBe(0);
  });
});
