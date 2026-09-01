import { RouteId, ProcessorId, TrackId } from "./types";
import { Processor } from "../processing/Processor";
import { GainProcessor } from "../processing/GainProcessor";
import { PanProcessor } from "../processing/PanProcessor";
import { Panner, PannerType, PanLaw } from "../processing/Panner";
import { PolarityProcessor } from "../processing/PolarityProcessor";
import { SendProcessor } from "../processing/SendProcessor";
import { InternalReturn, InternalSend } from "../processing/InternalSend";
import { MeterProcessor } from "../processing/MeterProcessor";
import { PluginInsert } from "../processing/PluginInsert";
import { SpeakerLayout, SurroundPanner } from "../processing/SurroundPanner";
import { IO, IOSnapshot } from "../processing/IO";
import { Signal } from "../lib/Signal";
import { LatencyCompensator } from "../audio/engine/LatencyCompensator";
import { AutomationMode } from "../automation/AutomationMode";
import { AutomationPoint } from "../automation/types";
import { PluginManager } from "../plugins/PluginManager";
import { PluginParameter, PluginType } from "../plugins/Plugin";
import { GenericPlugin } from "../plugins/impl/GenericPlugin";
import { MeterPoint } from "./MeterType";

export interface ProcessorMetadataSnapshot {
  id: string;
  name: string;
  active: boolean;
  latency: number;
  tailLength: number;
  automations: Array<{
    parameter: string;
    mode: AutomationMode;
    points: AutomationPoint[];
  }>;
}

export interface ProcessorSnapshot extends ProcessorMetadataSnapshot {
  type:
    | "plugin"
    | "gain"
    | "pan"
    | "panner"
    | "polarity"
    | "send"
    | "meter"
    | "internal-send"
    | "internal-return"
    | "surround-panner";
  state: Record<string, unknown>;
  plugin?: {
    id: string;
    descriptorId: string;
    name: string;
    type: PluginType;
    parameters: PluginParameter[];
  };
}

export interface RouteSnapshot {
  id: RouteId;
  name: string;
  active: boolean;
  compensationDelay: number;
  input: IOSnapshot;
  output: IOSnapshot;
  trim: ProcessorMetadataSnapshot & { gain: number };
  fader: ProcessorMetadataSnapshot & { gain: number };
  polarity: ProcessorMetadataSnapshot & { inverted: boolean };
  panner: ProcessorMetadataSnapshot & {
    azimuth: number;
    width: number;
    elevation: number;
    type: PannerType;
    panLaw: PanLaw;
    active: boolean;
  };
  preFaderProcessors: ProcessorSnapshot[];
  postFaderProcessors: ProcessorSnapshot[];
}

export interface CoreProcessorsRestoredEvent {
  previousProcessors: ReadonlyArray<Processor>;
  currentProcessors: ReadonlyArray<Processor>;
}

export class Route {
  public id: RouteId;
  public name: string;

  // IO Ports
  public readonly input: IO;
  public readonly output: IO;

  private _preFaderProcessors: Processor[] = [];
  private _postFaderProcessors: Processor[] = [];

  public readonly processorAdded = new Signal<Processor>();
  public readonly processorRemoved = new Signal<ProcessorId>();
  public readonly coreProcessorsRestored =
    new Signal<CoreProcessorsRestoredEvent>();
  public readonly ioChanged = new Signal<{
    inputId: string;
    outputId: string;
  }>();

  // ── Core strip processors ────────────────────────────────────────────────
  // Signal chain order:
  //   Input -> Trim -> [Pre-fader plugins] -> Fader -> Polarity
  //         -> [Post-fader plugins] -> Panner -> Output

  /** Input gain correction (pre-fader). */
  private _trim: GainProcessor;
  /** Main channel fader. */
  private _fader: GainProcessor;
  /** Phase inversion processor (post-fader, before post-fader plugins). */
  private _polarity: PolarityProcessor;
  /** Channel panner. */
  private _panner: Panner;

  private _active: boolean = true;

  // ── Latency Compensation (D-5) ──────────────────────────────────────────
  /**
   * Auto-computed compensation delay (in samples) applied to this route
   * so that all routes in the session are time-aligned.
   */
  private _compensationDelay: number = 0;

  /**
   * Delay buffer that applies `_compensationDelay` samples of latency to
   * this route's audio so all routes stay time-aligned at the summing bus.
   */
  public readonly latencyCompensator: LatencyCompensator =
    new LatencyCompensator();

  /**
   * Emitted whenever the total processor latency of this route changes,
   * carrying the new total latency in samples.  The session listens to
   * this signal to know when to recompute global compensation.
   */
  public readonly latencyChanged = new Signal<number>();

  /** Disposers for processor latency-change subscriptions. */
  private _latencySubscriptions: Map<ProcessorId, { dispose: () => void }> =
    new Map();

  constructor(id: RouteId, name: string) {
    this.id = id;
    this.name = name;

    // Initialize IO
    this.input = new IO(crypto.randomUUID(), `${name} Input`);
    this.output = new IO(crypto.randomUUID(), `${name} Output`);

    // Initialize default processors
    this._trim = new GainProcessor(crypto.randomUUID() as ProcessorId, "Trim");
    this._fader = new GainProcessor(crypto.randomUUID() as ProcessorId);
    this._polarity = new PolarityProcessor(crypto.randomUUID() as ProcessorId);
    this._panner = new Panner(crypto.randomUUID() as ProcessorId);

    // Core strip processors are implicit "bridge" processors -- they are
    // not stored in the pre/post lists but appear in the `processors` getter.
  }

  /**
   * Adds a processor to the chain.
   * @param processor The processor to add
   * @param position 'pre' (before fader) or 'post' (after fader)
   * @param index Index within the specific chain (not global index)
   */
  public addProcessor(
    processor: Processor,
    position: "pre" | "post" = "pre",
    index?: number,
  ) {
    const targetList =
      position === "pre" ? this._preFaderProcessors : this._postFaderProcessors;

    if (index !== undefined && index >= 0 && index <= targetList.length) {
      targetList.splice(index, 0, processor);
    } else {
      targetList.push(processor);
    }

    // Subscribe to the processor's latency changes so we can propagate
    // total-latency updates to the session.
    this._subscribeToProcessorLatency(processor);

    // We emit the processor. Listeners (AudioEngine) will query `processors` getter
    // to find its global index, or we might need to update listeners if they need precise info.
    this.processorAdded.emit(processor);

    // Recompute route-level totals now that the chain has changed.
    this.updateLatencyCompensation();
  }

  public removeProcessor(id: ProcessorId) {
    // Check pre
    let index = this._preFaderProcessors.findIndex((p) => p.id === id);
    if (index !== -1) {
      this._preFaderProcessors.splice(index, 1);
      this._unsubscribeFromProcessorLatency(id);
      this.processorRemoved.emit(id);
      this.updateLatencyCompensation();
      return;
    }

    // Check post
    index = this._postFaderProcessors.findIndex((p) => p.id === id);
    if (index !== -1) {
      this._postFaderProcessors.splice(index, 1);
      this._unsubscribeFromProcessorLatency(id);
      this.processorRemoved.emit(id);
      this.updateLatencyCompensation();
      return;
    }
  }

  /**
   * Reorder a processor within the same chain (pre or post fader).
   */
  public reorderProcessor(id: ProcessorId, newIndex: number) {
    // Try pre-fader first
    let idx = this._preFaderProcessors.findIndex((p) => p.id === id);
    if (idx !== -1) {
      const [proc] = this._preFaderProcessors.splice(idx, 1);
      const clampedIdx = Math.max(
        0,
        Math.min(newIndex, this._preFaderProcessors.length),
      );
      this._preFaderProcessors.splice(clampedIdx, 0, proc);
      return;
    }
    // Try post-fader
    idx = this._postFaderProcessors.findIndex((p) => p.id === id);
    if (idx !== -1) {
      const [proc] = this._postFaderProcessors.splice(idx, 1);
      const clampedIdx = Math.max(
        0,
        Math.min(newIndex, this._postFaderProcessors.length),
      );
      this._postFaderProcessors.splice(clampedIdx, 0, proc);
      return;
    }
  }

  /**
   * Full ordered processor chain.
   *
   * Order: Trim -> [Pre-fader] -> Fader -> Polarity -> [Post-fader] -> Panner
   */
  public get processors(): ReadonlyArray<Processor> {
    return [
      this._trim,
      ...this._preFaderProcessors,
      this._fader,
      this._polarity,
      ...this._postFaderProcessors,
      this._panner,
    ];
  }

  public get preFaderProcessors(): ReadonlyArray<Processor> {
    return this._preFaderProcessors;
  }

  public get postFaderProcessors(): ReadonlyArray<Processor> {
    return this._postFaderProcessors;
  }

  // ── Legacy / Convenience Accessors ───────────────────────────────────────

  public get volume(): number {
    return this._fader.gain;
  }

  public set volume(db: number) {
    this._fader.gain = db;
  }

  public get pan(): number {
    return this._panner.azimuth;
  }

  public set pan(val: number) {
    this._panner.setAzimuth(val);
  }

  /**
   * Input trim gain in dB.
   * Used for pre-fader level correction (e.g. mic preamp adjustment).
   */
  public get trim(): number {
    return this._trim.gain;
  }

  public set trim(db: number) {
    this._trim.gain = db;
  }

  public get active(): boolean {
    return this._active;
  }

  public set active(value: boolean) {
    this._active = value;
  }

  // ── Direct access to core processors ─────────────────────────────────────

  /** Input trim gain processor. */
  public get trimProcessor(): GainProcessor {
    return this._trim;
  }
  /** Main channel fader. */
  public get fader(): GainProcessor {
    return this._fader;
  }
  /** Polarity (phase inversion) processor. */
  public get polarity(): PolarityProcessor {
    return this._polarity;
  }
  /** Channel panner. */
  public get panner(): Panner {
    return this._panner;
  }

  public toJSON(): RouteSnapshot {
    return {
      id: this.id,
      name: this.name,
      active: this.active,
      compensationDelay: this.compensationDelay,
      input: this.input.toJSON(),
      output: this.output.toJSON(),
      trim: {
        ...this.serializeProcessorMetadata(this._trim),
        gain: this._trim.gain,
      },
      fader: {
        ...this.serializeProcessorMetadata(this._fader),
        gain: this._fader.gain,
      },
      polarity: {
        ...this.serializeProcessorMetadata(this._polarity),
        inverted: this._polarity.inverted,
      },
      panner: {
        ...this.serializeProcessorMetadata(this._panner),
        azimuth: this._panner.azimuth,
        width: this._panner.width,
        elevation: this._panner.elevation,
        type: this._panner.type,
        panLaw: this._panner.panLaw,
      },
      preFaderProcessors: this._preFaderProcessors.map((processor) =>
        this.serializeProcessor(processor),
      ),
      postFaderProcessors: this._postFaderProcessors.map((processor) =>
        this.serializeProcessor(processor),
      ),
    };
  }

  public restoreFromJSON(
    snapshot: RouteSnapshot,
    sampleRate: number = 44_100,
  ): void {
    const previousCoreProcessors = [
      this._trim,
      this._fader,
      this._polarity,
      this._panner,
    ];
    this.id = snapshot.id;
    this.name = snapshot.name;
    this._active = snapshot.active ?? true;
    this.input.restoreFromJSON(snapshot.input);
    this.output.restoreFromJSON(snapshot.output);
    this.ioChanged.emit({ inputId: this.input.id, outputId: this.output.id });

    this._trim = new GainProcessor(
      snapshot.trim?.id ?? this._trim.id,
      snapshot.trim?.name ?? "Trim",
    );
    this._trim.gain = snapshot.trim?.gain ?? 0;
    this.restoreProcessorMetadata(this._trim, snapshot.trim);
    this._fader = new GainProcessor(
      snapshot.fader?.id ?? this._fader.id,
      snapshot.fader?.name ?? "Fader",
    );
    this._fader.gain = snapshot.fader?.gain ?? 0;
    this.restoreProcessorMetadata(this._fader, snapshot.fader);
    this._polarity = new PolarityProcessor(
      snapshot.polarity?.id ?? this._polarity.id,
      snapshot.polarity?.name ?? "Polarity",
    );
    this._polarity.setInverted(snapshot.polarity?.inverted ?? false);
    this.restoreProcessorMetadata(this._polarity, snapshot.polarity);
    this._panner = new Panner(
      snapshot.panner?.id ?? this._panner.id,
      snapshot.panner?.name ?? "Panner",
      snapshot.panner?.type ?? PannerType.EQUAL_POWER,
      snapshot.panner?.panLaw ?? PanLaw.MINUS_3DB,
    );
    this._panner.setAzimuth(snapshot.panner?.azimuth ?? 0);
    this._panner.setWidth(snapshot.panner?.width ?? 1);
    this._panner.setElevation(snapshot.panner?.elevation ?? 0);
    this.restoreProcessorMetadata(this._panner, snapshot.panner);

    [...this._preFaderProcessors, ...this._postFaderProcessors].forEach(
      (processor) => this.removeProcessor(processor.id),
    );
    (snapshot.preFaderProcessors ?? []).forEach((processor) =>
      this.addProcessor(this.restoreProcessor(processor, sampleRate), "pre"),
    );
    (snapshot.postFaderProcessors ?? []).forEach((processor) =>
      this.addProcessor(this.restoreProcessor(processor, sampleRate), "post"),
    );
    this.setCompensationDelay(snapshot.compensationDelay ?? 0);
    this.coreProcessorsRestored.emit({
      previousProcessors: previousCoreProcessors,
      currentProcessors: [
        this._trim,
        this._fader,
        this._polarity,
        this._panner,
      ],
    });
  }

  private serializeProcessor(processor: Processor): ProcessorSnapshot {
    let type: ProcessorSnapshot["type"];
    let state: ProcessorSnapshot["state"] = {};
    let plugin: ProcessorSnapshot["plugin"];

    if (processor instanceof PluginInsert) {
      type = "plugin";
      const descriptorId = (
        processor.plugin as typeof processor.plugin & { descriptorId?: string }
      ).descriptorId;
      plugin = {
        id: processor.plugin.id,
        descriptorId: descriptorId ?? processor.plugin.name,
        name: processor.plugin.name,
        type: processor.plugin.type,
        parameters: processor.plugin.getParameters().map((parameter) => ({
          ...parameter,
        })),
      };
    } else if (processor instanceof GainProcessor) {
      type = "gain";
      state = { gain: processor.gain };
    } else if (processor instanceof PanProcessor) {
      type = "pan";
      state = { pan: processor.pan, width: processor.width };
    } else if (processor instanceof Panner) {
      type = "panner";
      state = {
        azimuth: processor.azimuth,
        width: processor.width,
        elevation: processor.elevation,
        pannerType: processor.type,
        panLaw: processor.panLaw,
      };
    } else if (processor instanceof PolarityProcessor) {
      type = "polarity";
      state = { inverted: processor.inverted };
    } else if (processor instanceof SendProcessor) {
      type = "send";
      state = {
        targetId: processor.targetId,
        level: processor.level,
        preFader: processor.preFader,
        pannable: processor.pannable,
        muted: processor.muted,
      };
    } else if (processor instanceof MeterProcessor) {
      type = "meter";
      state = {
        meterPoint: processor.getMeterPoint(),
        channelCount: processor.getChannelMeterData().length,
      };
    } else if (processor instanceof InternalSend) {
      type = "internal-send";
      state = {
        targetTrackId: processor.targetTrackId,
        sendLevel: processor.sendLevel,
        preFader: processor.preFader,
        muted: processor.muted,
      };
    } else if (processor instanceof InternalReturn) {
      type = "internal-return";
      state = { sourceTrackIds: [...processor.sourceTrackIds] };
    } else if (processor instanceof SurroundPanner) {
      type = "surround-panner";
      state = {
        azimuth: processor.azimuth,
        elevation: processor.elevation,
        spread: processor.spread,
        lfeLevel: processor.lfeLevel,
        layout: processor.layout,
      };
    } else {
      throw new Error(
        `Unsupported processor type: ${processor.constructor.name}`,
      );
    }

    return {
      ...this.serializeProcessorMetadata(processor),
      type,
      state,
      plugin,
    };
  }

  private serializeProcessorMetadata(
    processor: Processor,
  ): ProcessorMetadataSnapshot {
    return {
      id: processor.id,
      name: processor.name,
      active: processor.active,
      latency: processor.getLatency(),
      tailLength: processor.getTailLength(),
      automations: Array.from(processor.automations.entries()).map(
        ([parameter, list]) => ({
          parameter,
          mode: list.mode,
          points: list.getPoints().map((point) => ({ ...point })),
        }),
      ),
    };
  }

  private restoreProcessor(
    snapshot: ProcessorSnapshot,
    sampleRate: number,
  ): Processor {
    const state = snapshot.state ?? {};
    let processor: Processor;
    switch (snapshot.type) {
      case "plugin": {
        if (!snapshot.plugin) {
          throw new Error(`Plugin state missing for processor: ${snapshot.id}`);
        }
        const plugin = PluginManager.getInstance().createPluginFromSnapshot({
          descriptorId: snapshot.plugin.descriptorId,
          instanceId: snapshot.plugin.id,
          name: snapshot.plugin.name,
          type: snapshot.plugin.type,
        });
        plugin.name = snapshot.plugin.name;
        if (plugin instanceof GenericPlugin) {
          snapshot.plugin.parameters.forEach((parameter) => {
            if (!plugin.getParameter(parameter.id)) {
              plugin.addParameter({ ...parameter });
            }
          });
        }
        plugin.setState(
          Object.fromEntries(
            snapshot.plugin.parameters.map((parameter) => [
              parameter.id,
              parameter.value,
            ]),
          ),
        );
        processor = new PluginInsert(snapshot.id, plugin, sampleRate);
        break;
      }
      case "gain": {
        const gain = new GainProcessor(snapshot.id, snapshot.name);
        gain.gain = Number(state.gain ?? 0);
        processor = gain;
        break;
      }
      case "pan": {
        const pan = new PanProcessor(snapshot.id);
        pan.pan = Number(state.pan ?? 0);
        pan.width = Number(state.width ?? 1);
        processor = pan;
        break;
      }
      case "panner": {
        const panner = new Panner(snapshot.id, snapshot.name);
        panner.setAzimuth(Number(state.azimuth ?? 0));
        panner.setWidth(Number(state.width ?? 1));
        panner.setElevation(Number(state.elevation ?? 0));
        panner.setType(
          (state.pannerType as PannerType) ?? PannerType.EQUAL_POWER,
        );
        panner.setPanLaw((state.panLaw as PanLaw) ?? PanLaw.MINUS_3DB);
        processor = panner;
        break;
      }
      case "polarity": {
        const polarity = new PolarityProcessor(snapshot.id, snapshot.name);
        polarity.setInverted(Boolean(state.inverted));
        processor = polarity;
        break;
      }
      case "send": {
        const send = new SendProcessor(
          snapshot.id,
          String(state.targetId ?? ""),
          Number(state.level ?? 0),
          Boolean(state.preFader),
          Boolean(state.pannable),
        );
        send.muted = Boolean(state.muted);
        processor = send;
        break;
      }
      case "meter": {
        processor = new MeterProcessor(
          snapshot.id,
          (state.meterPoint as MeterPoint) ?? MeterPoint.POST_FADER,
          Number(state.channelCount ?? 2),
        );
        break;
      }
      case "internal-send": {
        const send = new InternalSend(
          snapshot.id,
          snapshot.name,
          String(state.targetTrackId ?? "") as TrackId,
        );
        send.setSendLevel(Number(state.sendLevel ?? 0));
        send.setPreFader(Boolean(state.preFader));
        send.setMuted(Boolean(state.muted));
        processor = send;
        break;
      }
      case "internal-return": {
        const internalReturn = new InternalReturn(snapshot.id, snapshot.name);
        const sourceTrackIds = Array.isArray(state.sourceTrackIds)
          ? state.sourceTrackIds
          : [];
        sourceTrackIds.forEach((sourceTrackId) =>
          internalReturn.addSource(String(sourceTrackId) as TrackId),
        );
        processor = internalReturn;
        break;
      }
      case "surround-panner": {
        const surroundPanner = new SurroundPanner(
          snapshot.id,
          (state.layout as SpeakerLayout) ?? SpeakerLayout.STEREO,
        );
        surroundPanner.setPosition(
          Number(state.azimuth ?? 0),
          Number(state.elevation ?? 0),
        );
        surroundPanner.setSpread(Number(state.spread ?? 0));
        surroundPanner.setLFELevel(Number(state.lfeLevel ?? 0));
        processor = surroundPanner;
        break;
      }
    }

    this.restoreProcessorMetadata(processor, snapshot);
    return processor;
  }

  private restoreProcessorMetadata(
    processor: Processor,
    snapshot?: Partial<ProcessorMetadataSnapshot>,
  ): void {
    processor.name = snapshot?.name ?? processor.name;
    processor.active = snapshot?.active ?? true;
    processor.setLatency(snapshot?.latency ?? 0);
    processor.setTailLength(snapshot?.tailLength ?? 0);
    (snapshot?.automations ?? []).forEach((automation) => {
      const list = processor.getAutomation(automation.parameter);
      list.mode = automation.mode;
      automation.points.forEach((point) =>
        list.addPoint(point.time, point.value, point.interpolation, point.id),
      );
    });
  }

  // ── Latency Compensation (D-5) ──────────────────────────────────────────

  /**
   * Sum of latencies (in samples) introduced by all processors in this route.
   *
   * This represents the total processing delay that audio experiences as it
   * passes through the signal chain.  Used by the session to compute
   * per-route compensation delays so that all routes stay time-aligned.
   */
  public getProcessorLatency(): number {
    let total = 0;
    for (const proc of this.processors) {
      total += proc.getLatency();
    }
    return total;
  }

  /**
   * Alias for {@link getProcessorLatency} — returns the total latency
   * (in samples) across every processor in the chain.
   */
  public getTotalLatency(): number {
    return this.getProcessorLatency();
  }

  /**
   * Returns the maximum tail length (in frames) across all processors in
   * this route.
   *
   * The tail length represents the duration of audio "tail" that persists
   * after input ceases (e.g. reverb decay, delay feedback).  The engine
   * uses this value to know how long to keep processing after playback
   * stops.
   */
  public getTotalTailLength(): number {
    let maxTail = 0;
    for (const proc of this.processors) {
      const tail = proc.getEffectiveTailLength();
      if (tail > maxTail) {
        maxTail = tail;
      }
    }
    return maxTail;
  }

  /**
   * The current compensation delay applied to this route (in samples).
   *
   * The value is set by the session / engine after evaluating all routes.
   * A route with lower inherent latency gets a larger compensation delay
   * so that every route's effective latency equals the session maximum.
   */
  public get compensationDelay(): number {
    return this._compensationDelay;
  }

  /**
   * Recalculate the route-level latency total and emit {@link latencyChanged}
   * when it differs from the previous value.  Also syncs the
   * {@link latencyCompensator} delay with {@link _compensationDelay}.
   *
   * Called automatically whenever a processor is added / removed or any
   * processor's latency changes.
   */
  public updateLatencyCompensation(): void {
    const total = this.getProcessorLatency();
    this.latencyCompensator.setDelay(this._compensationDelay);
    this.latencyChanged.emit(total);
  }

  /**
   * Directly set the compensation delay for this route.
   * @param samples Delay in samples (>= 0).
   */
  public setCompensationDelay(samples: number): void {
    this._compensationDelay = Math.max(0, samples);
    this.latencyCompensator.setDelay(this._compensationDelay);
  }

  /**
   * Compute the compensation delay needed for this route given the
   * maximum latency across the entire session.
   *
   * Call this once per route after determining `maxLatency` via
   * `Math.max(...routes.map(r => r.getProcessorLatency()))`.
   *
   * @param maxLatency The highest processor latency among all routes (in samples).
   */
  public computeLatencyCompensation(maxLatency?: number): void {
    if (maxLatency !== undefined) {
      const ownLatency = this.getTotalLatency();
      this._compensationDelay = Math.max(0, maxLatency - ownLatency);
    } else {
      // Self-contained: compensation is based solely on this route's
      // own latency (useful when a single route needs to report its
      // internal compensation requirement).
      this._compensationDelay = this.getTotalLatency();
    }
    this.latencyCompensator.setDelay(this._compensationDelay);
  }

  // ── Private: processor latency subscriptions ────────────────────────────

  private _subscribeToProcessorLatency(processor: Processor): void {
    const sub = processor.latencyChanged.connect(() => {
      this.updateLatencyCompensation();
    });
    this._latencySubscriptions.set(processor.id, sub);
  }

  private _unsubscribeFromProcessorLatency(id: ProcessorId): void {
    const sub = this._latencySubscriptions.get(id);
    if (sub) {
      sub.dispose();
      this._latencySubscriptions.delete(id);
    }
  }
}
