import { Signal } from "../../lib/Signal";

/**
 * RoutingGraph represents the DAW's signal flow as a directed graph.
 *
 * Each node is a track/bus/aux route. Edges represent audio connections:
 *  - Direct outputs (track -> master bus)
 *  - Send connections (track -> aux bus)
 *  - Sidechain connections (track -> processor on another track)
 *
 * The graph is used to:
 *  1. Compute topological processing order
 *  2. Detect feedback loops
 *  3. Determine which routes "feed" other routes
 *  4. Optimize parallel processing opportunities
 */

export interface GraphNode {
  id: string; // TrackId or 'master'
  name: string;
  type: "audio" | "midi" | "aux" | "bus" | "master" | "folder" | "vca";
  inputs: Set<string>; // IDs of nodes that feed into this
  outputs: Set<string>; // IDs of nodes this feeds into
  processed: boolean; // For topological sort
  depth: number; // Distance from leaf nodes
}

export interface FeedbackLoop {
  path: string[]; // Ordered node IDs forming the cycle
  description: string;
}

export class RoutingGraph {
  private _nodes: Map<string, GraphNode> = new Map();

  public readonly graphChanged = new Signal<void>();
  public readonly feedbackDetected = new Signal<FeedbackLoop>();

  // ─── Node management ────────────────────────────────────────────────────

  /**
   * Add a node to the graph.
   * If a node with the same ID already exists, it is updated in place.
   */
  addNode(id: string, name: string, type: GraphNode["type"]): void {
    const existing = this._nodes.get(id);
    if (existing) {
      existing.name = name;
      existing.type = type;
    } else {
      this._nodes.set(id, {
        id,
        name,
        type,
        inputs: new Set(),
        outputs: new Set(),
        processed: false,
        depth: 0,
      });
    }
    this.graphChanged.emit();
  }

  /**
   * Remove a node and all edges that reference it.
   */
  removeNode(id: string): void {
    const node = this._nodes.get(id);
    if (!node) return;

    // Remove this node from the inputs/outputs of all connected nodes
    for (const outputId of node.outputs) {
      const target = this._nodes.get(outputId);
      if (target) target.inputs.delete(id);
    }
    for (const inputId of node.inputs) {
      const source = this._nodes.get(inputId);
      if (source) source.outputs.delete(id);
    }

    this._nodes.delete(id);
    this.graphChanged.emit();
  }

  // ─── Edge management ────────────────────────────────────────────────────

  /**
   * Add a directed edge from one node to another.
   * Both nodes must already exist in the graph.
   */
  addEdge(fromId: string, toId: string): void {
    const from = this._nodes.get(fromId);
    const to = this._nodes.get(toId);
    if (!from || !to) return;

    from.outputs.add(toId);
    to.inputs.add(fromId);
    this.graphChanged.emit();
  }

  /**
   * Remove a directed edge between two nodes.
   */
  removeEdge(fromId: string, toId: string): void {
    const from = this._nodes.get(fromId);
    const to = this._nodes.get(toId);
    if (!from || !to) return;

    from.outputs.delete(toId);
    to.inputs.delete(fromId);
    this.graphChanged.emit();
  }

  // ─── Bulk rebuild ───────────────────────────────────────────────────────

  /**
   * Rebuild the entire graph from session state.
   * Clears all existing nodes/edges and reconstructs from the provided
   * track descriptors. Typically called after bulk routing changes.
   */
  rebuild(
    tracks: Array<{
      id: string;
      name: string;
      type: string;
      sendTargets: string[];
      outputTarget: string;
    }>,
  ): void {
    this._nodes.clear();

    // First pass: create all nodes
    for (const track of tracks) {
      this._nodes.set(track.id, {
        id: track.id,
        name: track.name,
        type: track.type as GraphNode["type"],
        inputs: new Set(),
        outputs: new Set(),
        processed: false,
        depth: 0,
      });
    }

    // Second pass: wire up edges
    for (const track of tracks) {
      const from = this._nodes.get(track.id);
      if (!from) continue;

      // Direct output (e.g. track -> master bus)
      if (track.outputTarget && this._nodes.has(track.outputTarget)) {
        from.outputs.add(track.outputTarget);
        this._nodes.get(track.outputTarget)!.inputs.add(track.id);
      }

      // Send connections (e.g. track -> aux bus)
      for (const sendTarget of track.sendTargets) {
        if (this._nodes.has(sendTarget)) {
          from.outputs.add(sendTarget);
          this._nodes.get(sendTarget)!.inputs.add(track.id);
        }
      }
    }

    // Compute node depths
    this._computeDepths();

    // Detect feedback loops and emit signals for any found
    const loops = this.detectFeedback();
    for (const loop of loops) {
      this.feedbackDetected.emit(loop);
    }

    this.graphChanged.emit();
  }

  // ─── Topological sort (Kahn's algorithm) ────────────────────────────────

  /**
   * Compute a valid processing order using Kahn's algorithm for
   * topological sorting. Leaf nodes (no inputs) are processed first,
   * working upward to the master bus.
   *
   * If cycles exist, the returned order will be incomplete (nodes
   * involved in cycles are omitted). Use detectFeedback() to identify
   * those cycles.
   *
   * @returns An array of node IDs in processing order.
   */
  getProcessingOrder(): string[] {
    // Build a working copy of in-degree counts
    const inDegree = new Map<string, number>();
    for (const [id, node] of this._nodes) {
      inDegree.set(id, node.inputs.size);
    }

    // Seed the queue with all nodes that have zero in-degree (leaf nodes)
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const order: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      const node = this._nodes.get(current);
      if (!node) continue;

      // For each outgoing edge, reduce the in-degree of the target
      for (const outputId of node.outputs) {
        const deg = inDegree.get(outputId);
        if (deg === undefined) continue;

        const newDeg = deg - 1;
        inDegree.set(outputId, newDeg);
        if (newDeg === 0) {
          queue.push(outputId);
        }
      }
    }

    return order;
  }

  // ─── Feedback detection (DFS cycle detection) ───────────────────────────

  /**
   * Detect all feedback loops (cycles) in the graph using DFS.
   * Returns an array of FeedbackLoop descriptors, each containing the
   * ordered path of node IDs that form the cycle.
   */
  detectFeedback(): FeedbackLoop[] {
    const loops: FeedbackLoop[] = [];

    // Track visited state: 'unvisited', 'visiting' (on current DFS stack), 'visited'
    const state = new Map<string, "unvisited" | "visiting" | "visited">();
    for (const id of this._nodes.keys()) {
      state.set(id, "unvisited");
    }

    // DFS path stack for reconstructing cycle paths
    const pathStack: string[] = [];
    const pathSet = new Set<string>(); // fast lookup for cycle extraction

    const dfs = (nodeId: string): void => {
      state.set(nodeId, "visiting");
      pathStack.push(nodeId);
      pathSet.add(nodeId);

      const node = this._nodes.get(nodeId);
      if (node) {
        for (const neighborId of node.outputs) {
          const neighborState = state.get(neighborId);

          if (neighborState === "visiting" && pathSet.has(neighborId)) {
            // Found a cycle - extract the cycle path from the stack
            const cycleStartIdx = pathStack.indexOf(neighborId);
            const cyclePath = pathStack.slice(cycleStartIdx);
            // Close the cycle by appending the start node
            cyclePath.push(neighborId);

            const nodeNames = cyclePath.map((id) => {
              const n = this._nodes.get(id);
              return n ? n.name : id;
            });

            loops.push({
              path: cyclePath,
              description: `Feedback loop: ${nodeNames.join(" -> ")}`,
            });
          } else if (neighborState === "unvisited") {
            dfs(neighborId);
          }
        }
      }

      pathStack.pop();
      pathSet.delete(nodeId);
      state.set(nodeId, "visited");
    };

    for (const id of this._nodes.keys()) {
      if (state.get(id) === "unvisited") {
        dfs(id);
      }
    }

    return loops;
  }

  // ─── Reachability queries ───────────────────────────────────────────────

  /**
   * Check whether route A feeds (directly or indirectly) into route B.
   * Uses BFS from A, following output edges, to determine reachability.
   */
  feeds(fromId: string, toId: string): boolean {
    if (fromId === toId) return false;
    if (!this._nodes.has(fromId) || !this._nodes.has(toId)) return false;

    const visited = new Set<string>();
    const queue: string[] = [fromId];
    visited.add(fromId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = this._nodes.get(current);
      if (!node) continue;

      for (const outputId of node.outputs) {
        if (outputId === toId) return true;
        if (!visited.has(outputId)) {
          visited.add(outputId);
          queue.push(outputId);
        }
      }
    }

    return false;
  }

  /**
   * Check whether route A directly feeds into route B (single hop).
   */
  directFeeds(fromId: string, toId: string): boolean {
    const from = this._nodes.get(fromId);
    if (!from) return false;
    return from.outputs.has(toId);
  }

  /**
   * Get all routes that feed (directly or indirectly) into the given route.
   * Traverses backward from the target, following input edges via BFS.
   */
  getUpstream(nodeId: string): string[] {
    if (!this._nodes.has(nodeId)) return [];

    const visited = new Set<string>();
    const queue: string[] = [nodeId];
    visited.add(nodeId);
    const upstream: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = this._nodes.get(current);
      if (!node) continue;

      for (const inputId of node.inputs) {
        if (!visited.has(inputId)) {
          visited.add(inputId);
          upstream.push(inputId);
          queue.push(inputId);
        }
      }
    }

    return upstream;
  }

  /**
   * Get all routes that the given route feeds (directly or indirectly) into.
   * Traverses forward from the source, following output edges via BFS.
   */
  getDownstream(nodeId: string): string[] {
    if (!this._nodes.has(nodeId)) return [];

    const visited = new Set<string>();
    const queue: string[] = [nodeId];
    visited.add(nodeId);
    const downstream: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = this._nodes.get(current);
      if (!node) continue;

      for (const outputId of node.outputs) {
        if (!visited.has(outputId)) {
          visited.add(outputId);
          downstream.push(outputId);
          queue.push(outputId);
        }
      }
    }

    return downstream;
  }

  // ─── Parallel processing groups ─────────────────────────────────────────

  /**
   * Find groups of nodes that can be processed in parallel.
   * Nodes at the same depth in the topological ordering have no
   * dependencies on each other and can safely run concurrently.
   *
   * Uses a BFS-based level assignment: leaf nodes (in-degree 0) are
   * at level 0, their consumers at level 1, and so on. Nodes at the
   * same level form a parallel group.
   *
   * @returns An array of groups, where each group is an array of node IDs
   *          that can be processed simultaneously. Groups are returned in
   *          processing order (group 0 first, then group 1, etc.).
   */
  getParallelGroups(): string[][] {
    // Compute levels using a variant of Kahn's algorithm that tracks depth
    const inDegree = new Map<string, number>();
    const level = new Map<string, number>();

    for (const [id, node] of this._nodes) {
      inDegree.set(id, node.inputs.size);
      level.set(id, 0);
    }

    // Seed with zero in-degree nodes at level 0
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
        level.set(id, 0);
      }
    }

    const visited = new Set<string>();
    let maxLevel = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      visited.add(current);
      const currentLevel = level.get(current)!;

      const node = this._nodes.get(current);
      if (!node) continue;

      for (const outputId of node.outputs) {
        // The consumer's level is at least one more than this node's level
        const newLevel = currentLevel + 1;
        if (newLevel > (level.get(outputId) ?? 0)) {
          level.set(outputId, newLevel);
        }
        if (newLevel > maxLevel) {
          maxLevel = newLevel;
        }

        const deg = inDegree.get(outputId);
        if (deg === undefined) continue;
        const newDeg = deg - 1;
        inDegree.set(outputId, newDeg);
        if (newDeg === 0) {
          queue.push(outputId);
        }
      }
    }

    // Collect nodes into groups by level
    const groups: string[][] = [];
    for (let i = 0; i <= maxLevel; i++) {
      groups.push([]);
    }

    for (const [id, lvl] of level) {
      // Only include nodes that were reachable (part of the DAG portion)
      if (visited.has(id)) {
        groups[lvl].push(id);
      }
    }

    // Filter out any empty groups (shouldn't happen, but be safe)
    return groups.filter((g) => g.length > 0);
  }

  // ─── Accessors ──────────────────────────────────────────────────────────

  /**
   * Get a single node by ID.
   */
  getNode(id: string): GraphNode | undefined {
    return this._nodes.get(id);
  }

  /**
   * Get all nodes as a read-only array.
   */
  get nodes(): ReadonlyArray<GraphNode> {
    return Array.from(this._nodes.values());
  }

  /**
   * Clear all nodes and edges, resetting the graph to an empty state.
   */
  clear(): void {
    this._nodes.clear();
    this.graphChanged.emit();
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  /**
   * Compute the depth of each node (longest path from any leaf to this node).
   * Leaf nodes (no inputs) have depth 0. Used for parallel group assignment
   * and rendering the graph visualization.
   */
  private _computeDepths(): void {
    // Reset depths
    for (const node of this._nodes.values()) {
      node.depth = 0;
    }

    // Use topological order to compute longest-path depths
    const order = this.getProcessingOrder();
    for (const id of order) {
      const node = this._nodes.get(id);
      if (!node) continue;

      for (const outputId of node.outputs) {
        const target = this._nodes.get(outputId);
        if (target) {
          target.depth = Math.max(target.depth, node.depth + 1);
        }
      }
    }
  }
}
