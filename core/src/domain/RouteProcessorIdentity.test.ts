import { describe, expect, it, vi } from "vitest";

import { DuplicateProcessorIdError } from "../errors/DAWErrors";
import { GainProcessor } from "../processing/GainProcessor";
import { Route, RouteSnapshot } from "./Route";

interface RouteFixture {
  route: Route;
  originalProcessor: GainProcessor;
}

function createRouteFixture(): RouteFixture {
  const route = new Route("route-original", "Original Route");
  const originalProcessor = new GainProcessor(
    "original-processor",
    "Original Processor",
  );
  route.addProcessor(originalProcessor, "pre");
  route.output.connect("destination-input");
  return { route, originalProcessor };
}

function expectAtomicRestoreRejection(
  fixture: RouteFixture,
  snapshot: RouteSnapshot,
  duplicateProcessorId: string,
): void {
  const { route, originalProcessor } = fixture;
  const originalSnapshot = route.toJSON();
  const originalChain = [...route.processors];
  const processorAdded = vi.fn();
  const processorRemoved = vi.fn();
  const coreProcessorsRestored = vi.fn();
  const ioChanged = vi.fn();
  const latencyChanged = vi.fn();
  route.processorAdded.connect(processorAdded);
  route.processorRemoved.connect(processorRemoved);
  route.coreProcessorsRestored.connect(coreProcessorsRestored);
  route.ioChanged.connect(ioChanged);
  route.latencyChanged.connect(latencyChanged);

  let duplicateError: unknown;
  try {
    route.restoreFromJSON(snapshot);
  } catch (error) {
    duplicateError = error;
  }

  expect(duplicateError).toBeInstanceOf(DuplicateProcessorIdError);
  expect(duplicateError).toMatchObject({
    routeId: snapshot.id,
    processorId: duplicateProcessorId,
  });
  expect(route.toJSON()).toEqual(originalSnapshot);
  expect(route.processors).toEqual(originalChain);
  expect(processorAdded).not.toHaveBeenCalled();
  expect(processorRemoved).not.toHaveBeenCalled();
  expect(coreProcessorsRestored).not.toHaveBeenCalled();
  expect(ioChanged).not.toHaveBeenCalled();
  expect(latencyChanged).not.toHaveBeenCalled();

  originalProcessor.setLatency(32);
  expect(latencyChanged).toHaveBeenCalledOnce();
}

describe("Route processor identity", () => {
  it("rejects a duplicate custom processor id across pre and post chains", () => {
    const route = new Route("route-1", "Route");
    const originalProcessor = new GainProcessor("shared-id", "Original");
    const rejectedProcessor = new GainProcessor("shared-id", "Rejected");
    route.addProcessor(originalProcessor, "pre");
    const originalChain = [...route.processors];
    const processorAdded = vi.fn();
    const latencyChanged = vi.fn();
    route.processorAdded.connect(processorAdded);
    route.latencyChanged.connect(latencyChanged);

    let duplicateError: unknown;
    try {
      route.addProcessor(rejectedProcessor, "post");
    } catch (error) {
      duplicateError = error;
    }

    expect(duplicateError).toBeInstanceOf(DuplicateProcessorIdError);
    expect(duplicateError).toMatchObject({
      routeId: route.id,
      processorId: rejectedProcessor.id,
    });
    expect(route.processors).toEqual(originalChain);
    expect(route.postFaderProcessors).toEqual([]);
    expect(processorAdded).not.toHaveBeenCalled();

    rejectedProcessor.setLatency(16);
    expect(latencyChanged).not.toHaveBeenCalled();

    originalProcessor.setLatency(32);
    expect(latencyChanged).toHaveBeenCalledOnce();

    route.removeProcessor(originalProcessor.id);
    latencyChanged.mockClear();
    originalProcessor.setLatency(64);
    expect(latencyChanged).not.toHaveBeenCalled();
  });

  it("rejects ids owned by every core strip processor before mutation", () => {
    const route = new Route("route-1", "Route");
    const originalChain = [...route.processors];
    const processorAdded = vi.fn();
    const latencyChanged = vi.fn();
    route.processorAdded.connect(processorAdded);
    route.latencyChanged.connect(latencyChanged);

    for (const coreProcessor of [
      route.trimProcessor,
      route.fader,
      route.polarity,
      route.panner,
    ]) {
      const rejectedProcessor = new GainProcessor(coreProcessor.id, "Rejected");

      expect(() => route.addProcessor(rejectedProcessor, "pre")).toThrowError(
        new DuplicateProcessorIdError(route.id, rejectedProcessor.id),
      );
      rejectedProcessor.setLatency(16);
    }

    expect(route.processors).toEqual(originalChain);
    expect(route.preFaderProcessors).toEqual([]);
    expect(route.postFaderProcessors).toEqual([]);
    expect(processorAdded).not.toHaveBeenCalled();
    expect(latencyChanged).not.toHaveBeenCalled();
  });

  it("rejects duplicate core ids atomically during restore", () => {
    const fixture = createRouteFixture();
    const snapshot = fixture.route.toJSON();
    snapshot.id = "route-incoming";
    snapshot.name = "Incoming Route";
    snapshot.input.id = "incoming-input";
    snapshot.output.id = "incoming-output";
    snapshot.fader.id = snapshot.trim.id;

    expectAtomicRestoreRejection(fixture, snapshot, snapshot.trim.id);
  });

  it("rejects a custom id that collides with a core id atomically", () => {
    const fixture = createRouteFixture();
    const snapshot = fixture.route.toJSON();
    snapshot.id = "route-incoming";
    snapshot.name = "Incoming Route";
    snapshot.input.id = "incoming-input";
    snapshot.output.id = "incoming-output";
    snapshot.preFaderProcessors[0].id = snapshot.panner.id;

    expectAtomicRestoreRejection(fixture, snapshot, snapshot.panner.id);
  });

  it("rejects duplicate custom ids across restored chains atomically", () => {
    const fixture = createRouteFixture();
    const snapshot = fixture.route.toJSON();
    const duplicateProcessorId = snapshot.preFaderProcessors[0].id;
    snapshot.id = "route-incoming";
    snapshot.name = "Incoming Route";
    snapshot.input.id = "incoming-input";
    snapshot.output.id = "incoming-output";
    snapshot.postFaderProcessors = [
      {
        ...snapshot.preFaderProcessors[0],
        state: { ...snapshot.preFaderProcessors[0].state },
      },
    ];

    expectAtomicRestoreRejection(fixture, snapshot, duplicateProcessorId);
  });
});
