import { describe, expect, it } from "vitest";
import { Session } from "../../domain/Session";
import { TrackType } from "../../domain/Track";
import { createRoutingSnapshot } from "./RoutingSnapshot";

describe("createRoutingSnapshot", () => {
  it("creates an immutable processing graph from the current session", () => {
    const session = new Session("routing-session");
    const sourceTrack = session.addTrack(
      "source-track",
      TrackType.AUDIO,
      "source-track",
    );
    const busTrack = session.addTrack("bus-track", TrackType.BUS, "bus-track");
    session.addSendBus(
      sourceTrack.id,
      busTrack.route.input.id,
      -6,
      false,
      "send-1",
    );

    const snapshot = createRoutingSnapshot(session);
    const sourceNode = snapshot.nodes.find(
      (node) => node.id === sourceTrack.id,
    );

    expect(snapshot.schemaVersion).toBe(1);
    expect(sourceNode?.processors.map((processor) => processor.id)).toEqual(
      sourceTrack.route.processors.map((processor) => processor.id),
    );
    expect(snapshot.edges).toContainEqual(
      expect.objectContaining({
        sourceId: sourceTrack.id,
        targetId: busTrack.id,
        type: "send",
        sendBusId: "send-1",
      }),
    );
    expect(snapshot.processingOrder.indexOf(sourceTrack.id)).toBeLessThan(
      snapshot.processingOrder.indexOf(busTrack.id),
    );
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.nodes)).toBe(true);
    expect(Object.isFrozen(sourceNode)).toBe(true);
    expect(Object.isFrozen(sourceNode?.processors)).toBe(true);
  });

  it("reports a routing feedback cycle without hiding it", () => {
    const session = new Session("feedback-session");
    const firstBus = session.addTrack("first-bus", TrackType.BUS, "first-bus");
    const secondBus = session.addTrack(
      "second-bus",
      TrackType.BUS,
      "second-bus",
    );
    session.addSendBus(firstBus.id, secondBus.route.input.id);
    session.addSendBus(secondBus.id, firstBus.route.input.id);

    const snapshot = createRoutingSnapshot(session);

    expect(snapshot.feedbackPaths).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([firstBus.id, secondBus.id, firstBus.id]),
      ]),
    );
  });
});
