import { Signal } from "../lib/Signal";

export type IOId = string;

export type IODataType = "audio" | "midi";

export interface IOSnapshot {
  id: IOId;
  name: string;
  dataType: IODataType;
  connections: IOId[];
  latency: number;
  bundleName?: string;
}

export class IO {
  public id: IOId;
  public name: string;
  public dataType: IODataType;

  // Connected IOs (Output -> Input)
  // If this is an Output, `connections` lists the Inputs it feeds.
  // If this is an Input, `connections` implies source Outputs (though usually tracked by Output).
  // For simplicity, we model: Output knows its destinations.
  private _connections: IOId[] = [];

  private _latency: number = 0;
  private _bundleName?: string;

  public readonly connected = new Signal<IOId>();
  public readonly disconnected = new Signal<IOId>();
  public readonly latencyChanged = new Signal<number>();

  constructor(id: IOId, name: string, dataType: IODataType = "audio") {
    this.id = id;
    this.name = name;
    this.dataType = dataType;
  }

  public get latency(): number {
    return this._latency;
  }

  public set latency(value: number) {
    if (this._latency !== value) {
      this._latency = value;
      this.latencyChanged.emit(value);
    }
  }

  public get bundleName(): string | undefined {
    return this._bundleName;
  }

  public set bundleName(value: string | undefined) {
    this._bundleName = value;
  }

  /**
   * Returns the maximum latency across all connected IOs.
   * Accepts a resolver function that maps an IOId to its latency value.
   */
  public getConnectedLatency(resolveLatency: (id: IOId) => number): number {
    if (this._connections.length === 0) {
      return 0;
    }
    return Math.max(...this._connections.map(resolveLatency));
  }

  public connect(targetId: IOId) {
    if (!this._connections.includes(targetId)) {
      this._connections.push(targetId);
      this.connected.emit(targetId);
    }
  }

  public disconnect(targetId: IOId) {
    const index = this._connections.indexOf(targetId);
    if (index !== -1) {
      this._connections.splice(index, 1);
      this.disconnected.emit(targetId);
    }
  }

  public get connections(): ReadonlyArray<IOId> {
    return this._connections;
  }

  public isConnectedTo(targetId: IOId): boolean {
    return this._connections.includes(targetId);
  }

  public toJSON(): IOSnapshot {
    return {
      id: this.id,
      name: this.name,
      dataType: this.dataType,
      connections: [...this._connections],
      latency: this._latency,
      bundleName: this._bundleName,
    };
  }

  public restoreFromJSON(snapshot: IOSnapshot): void {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.dataType = snapshot.dataType;
    this._connections = [...(snapshot.connections ?? [])];
    this._latency = snapshot.latency ?? 0;
    this._bundleName = snapshot.bundleName;
  }
}
