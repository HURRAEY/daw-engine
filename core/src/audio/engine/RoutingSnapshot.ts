import { Session } from "../../domain/Session";
import { Track, TrackType } from "../../domain/Track";
import { GainProcessor } from "../../processing/GainProcessor";
import { MeterProcessor } from "../../processing/MeterProcessor";
import { PanProcessor } from "../../processing/PanProcessor";
import { Panner } from "../../processing/Panner";
import { PluginInsert } from "../../processing/PluginInsert";
import { PolarityProcessor } from "../../processing/PolarityProcessor";
import { Processor } from "../../processing/Processor";
import { SendProcessor } from "../../processing/SendProcessor";
import { RoutingGraph } from "./RoutingGraph";

export const ROUTING_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type RoutingNodeType =
  "audio" | "midi" | "aux" | "bus" | "master" | "folder" | "vca";

export interface ProcessorRoutingSnapshot {
  readonly id: string;
  readonly type: string;
  readonly index: number;
  readonly active: boolean;
  readonly latencySamples: number;
  readonly tailFrames: number;
}

export interface RoutingNodeSnapshot {
  readonly id: string;
  readonly name: string;
  readonly type: RoutingNodeType;
  readonly inputId: string;
  readonly outputId: string;
  readonly compensationDelaySamples: number;
  readonly processors: ReadonlyArray<ProcessorRoutingSnapshot>;
}

export interface RoutingEdgeSnapshot {
  readonly sourceId: string;
  readonly targetId: string;
  readonly sourcePortId: string;
  readonly targetPortId: string;
  readonly type: "direct" | "send" | "sidechain";
  readonly dataType: "audio" | "midi";
  readonly sendBusId?: string;
  readonly targetProcessorId?: string;
}

export interface RoutingSnapshot {
  readonly schemaVersion: typeof ROUTING_SNAPSHOT_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly nodes: ReadonlyArray<RoutingNodeSnapshot>;
  readonly edges: ReadonlyArray<RoutingEdgeSnapshot>;
  readonly processingOrder: ReadonlyArray<string>;
  readonly feedbackPaths: ReadonlyArray<ReadonlyArray<string>>;
}

interface RouteNodeSource {
  readonly id: string;
  readonly name: string;
  readonly type: RoutingNodeType;
  readonly inputId: string;
  readonly outputId: string;
  readonly compensationDelaySamples: number;
  readonly processors: ReadonlyArray<Processor>;
}

export function getProcessorRuntimeType(processor: Processor): string {
  if (processor instanceof GainProcessor) {
    return processor.name === "Trim" ? "Trim" : "Fader";
  }
  if (processor instanceof Panner || processor instanceof PanProcessor) {
    return "Panner";
  }
  if (processor instanceof PolarityProcessor) {
    return "Polarity";
  }
  if (processor instanceof SendProcessor) {
    return "Send";
  }
  if (processor instanceof MeterProcessor) {
    return "Meter";
  }
  if (processor instanceof PluginInsert) {
    return `Insert: ${processor.plugin.name}`;
  }
  return "Unknown";
}

export function createRoutingSnapshot(session: Session): RoutingSnapshot {
  const graph = new RoutingGraph();
  const nodes = createNodes(session);
  nodes.forEach((node) => graph.addNode(node.id, node.name, node.type));
  const edges = createEdges(session);
  edges.forEach((edge) => graph.addEdge(edge.sourceId, edge.targetId));

  const feedbackLoops = graph.detectFeedback();

  // backend 경계를 넘은 뒤 Session의 가변 객체를 참조하지 않도록 모든 계층을 동결한다.
  const frozenNodes = Object.freeze(
    nodes.map((node) =>
      Object.freeze({
        ...node,
        processors: Object.freeze(
          node.processors.map((processor) => Object.freeze(processor)),
        ),
      }),
    ),
  );
  const frozenEdges = Object.freeze(edges.map((edge) => Object.freeze(edge)));
  return Object.freeze({
    schemaVersion: ROUTING_SNAPSHOT_SCHEMA_VERSION,
    sessionId: session.id,
    nodes: frozenNodes,
    edges: frozenEdges,
    processingOrder: Object.freeze(graph.getProcessingOrder()),
    feedbackPaths: Object.freeze(
      feedbackLoops.map((loop) => Object.freeze([...loop.path])),
    ),
  });
}

function createNodes(session: Session): RoutingNodeSnapshot[] {
  return [
    createRouteNode({
      id: session.masterBus.id,
      name: session.masterBus.name,
      type: "master",
      inputId: session.masterBus.input.id,
      outputId: session.masterBus.output.id,
      compensationDelaySamples: session.masterBus.compensationDelay,
      processors: session.masterBus.processors,
    }),
    ...session.tracks.map((track) => createTrackNode(track)),
  ];
}

function createTrackNode(track: Track): RoutingNodeSnapshot {
  return createRouteNode({
    id: track.id,
    name: track.name,
    type: getRoutingNodeType(track.type),
    inputId: track.route.input.id,
    outputId: track.route.output.id,
    compensationDelaySamples: track.route.compensationDelay,
    processors: track.route.processors,
  });
}

function createRouteNode(source: RouteNodeSource): RoutingNodeSnapshot {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    inputId: source.inputId,
    outputId: source.outputId,
    compensationDelaySamples: source.compensationDelaySamples,
    processors: source.processors.map((processor, index) => ({
      id: processor.id,
      type: getProcessorRuntimeType(processor),
      index,
      active: processor.active,
      latencySamples: processor.getLatency(),
      tailFrames: processor.getEffectiveTailLength(),
    })),
  };
}

function createEdges(session: Session): RoutingEdgeSnapshot[] {
  const routeByInputId = new Map(
    [session.masterBus, ...session.tracks.map((track) => track.route)].map(
      (route) => [route.input.id, route] as const,
    ),
  );
  const nodeIdByRouteId = new Map([
    [session.masterBus.id, session.masterBus.id],
    ...session.tracks.map(
      (track) => [track.route.id, track.id] as readonly [string, string],
    ),
  ]);
  const edges: RoutingEdgeSnapshot[] = [];

  session.tracks.forEach((track) => {
    const explicitTargets = track.route.output.connections
      .map((inputId) => routeByInputId.get(inputId))
      .filter((route) => route !== undefined);
    if (explicitTargets.length === 0) {
      edges.push({
        sourceId: track.id,
        targetId: session.masterBus.id,
        sourcePortId: track.route.output.id,
        targetPortId: session.masterBus.input.id,
        type: "direct",
        dataType: track.type === TrackType.MIDI ? "midi" : "audio",
      });
      return;
    }
    explicitTargets.forEach((targetRoute) => {
      const targetId = nodeIdByRouteId.get(targetRoute.id);
      if (!targetId) {
        return;
      }
      edges.push({
        sourceId: track.id,
        targetId,
        sourcePortId: track.route.output.id,
        targetPortId: targetRoute.input.id,
        type: "direct",
        dataType: track.type === TrackType.MIDI ? "midi" : "audio",
      });
    });
  });

  session.sendBuses.forEach((sendBus) => {
    const targetRoute = routeByInputId.get(sendBus.destId);
    const targetId = targetRoute
      ? nodeIdByRouteId.get(targetRoute.id)
      : undefined;
    if (!targetId || !sendBus.active) {
      return;
    }
    const sourceTrack = session.getTrack(sendBus.sourceTrackId);
    if (!sourceTrack) {
      return;
    }
    edges.push({
      sourceId: sourceTrack.id,
      targetId,
      sourcePortId: sourceTrack.route.output.id,
      targetPortId: sendBus.destId,
      type: "send",
      dataType: "audio",
      sendBusId: sendBus.id,
    });
  });

  session.sidechainConfigs.forEach((sidechain) => {
    if (!sidechain.enabled || !sidechain.sourceTrackId) {
      return;
    }
    const sourceTrack = session.getTrack(sidechain.sourceTrackId);
    const targetTrack = session.getTrack(sidechain.targetTrackId);
    if (!sourceTrack || !targetTrack) {
      return;
    }
    edges.push({
      sourceId: sourceTrack.id,
      targetId: targetTrack.id,
      sourcePortId: sourceTrack.route.output.id,
      targetPortId: targetTrack.route.input.id,
      type: "sidechain",
      dataType: "audio",
      targetProcessorId: sidechain.targetProcessorId,
    });
  });
  return edges;
}

function getRoutingNodeType(trackType: TrackType): RoutingNodeType {
  switch (trackType) {
    case TrackType.MIDI:
      return "midi";
    case TrackType.AUX:
      return "aux";
    case TrackType.BUS:
      return "bus";
    case TrackType.FOLDER:
      return "folder";
    case TrackType.VCA:
      return "vca";
    case TrackType.AUDIO:
      return "audio";
  }
}
