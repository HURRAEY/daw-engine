import { z } from 'zod';

export type FrameCount = number;
export type SampleRate = number;
export type ProcessorId = string;
export type RouteId = string;
export type TrackId = string;
export type RegionId = string;
export type SourceId = string;
export type RangeId = string;
/**
 * A lightweight implementation of the Signal/Slot pattern.
 * Allows objects to expose strongly-typed events that others can subscribe to.
 */
export type Slot<T> = (data: T) => void;
export declare class Signal<T = void> {
	private slots;
	/**
	 * Connect a listener (slot) to this signal.
	 * @returns A subscription object with a dispose method to unsubscribe.
	 */
	connect(slot: Slot<T>): {
		dispose: () => void;
	};
	/**
	 * Disconnect a listener from this signal.
	 */
	disconnect(slot: Slot<T>): void;
	/**
	 * Emit the signal, notifying all connected listeners.
	 */
	emit(data: T): void;
	/**
	 * Clear all listeners.
	 */
	clear(): void;
}
declare enum InterpolationType {
	Linear = "Linear",
	Exponential = "Exponential",
	Logarithmic = "Logarithmic",
	Hold = "Hold",// Step function
	Curved = "Curved"
}
export interface AutomationPoint {
	id: string;
	time: number;
	value: number;
	interpolation: InterpolationType;
}
/**
 * Automation Mode
 */
export declare enum AutomationMode {
	/** 오토메이션 무시, 수동 조작만 */
	OFF = "off",
	/** 기록된 커브 따라 재생 */
	READ = "read",
	/** 재생 중 파라미터 조작을 기록 (기존 데이터 덮어씀) */
	WRITE = "write",
	/** 터치(조작) 시에만 기록, 놓으면 기존 데이터 유지 */
	TOUCH = "touch",
	/** Touch와 유사하지만 놓은 후에도 마지막 값 유지 */
	LATCH = "latch"
}
/**
 * An ordered list of automation points with interpolation, touch/write
 * state tracking, write pass management, lookup caching, and range
 * operations.
 *
 */
export declare class AutomationList {
	private points;
	private _mode;
	/** Signals */
	readonly changed: Signal<void>;
	readonly modeChanged: Signal<AutomationMode>;
	private _curve;
	private _touching;
	private _writePass;
	private _lookupCache;
	constructor();
	get mode(): AutomationMode;
	set mode(m: AutomationMode);
	/**
	 * Adds a new automation point at the given time/value.
	 * Points are kept sorted by time.
	 * @param time The point time in seconds
	 * @param value The point value
	 * @param interpolation The interpolation type for the segment starting at this point
	 * @param id Optional explicit ID
	 * @returns The created AutomationPoint
	 */
	addPoint(time: number, value: number, interpolation?: InterpolationType, id?: string): AutomationPoint;
	/**
	 * Updates an existing point's time and value.
	 * Re-sorts the list if the time changes.
	 * @param id The point ID
	 * @param time New time
	 * @param value New value
	 * @returns true if the point was found and updated
	 */
	updatePoint(id: string, time: number, value: number): boolean;
	/**
	 * Removes a point by ID.
	 * @param id The point ID
	 * @returns true if the point was found and removed
	 */
	removePoint(id: string): boolean;
	/**
	 * Returns the sorted array of automation points (read-only view).
	 */
	getPoints(): ReadonlyArray<AutomationPoint>;
	/**
	 * Returns whether a user is currently touching (interacting with) this
	 * automation parameter.
	 */
	isTouching(): boolean;
	/**
	 * Begin a touch interaction at the given transport time.
	 * In Touch/Latch modes this starts overwriting the existing curve.
	 * @param when The transport time when the touch begins
	 */
	startTouch(when: number): void;
	/**
	 * End a touch interaction at the given transport time.
	 * In Touch mode the parameter returns to following the existing curve.
	 * In Latch mode the last written value is held until playback stops.
	 * @param when The transport time when the touch ends
	 */
	stopTouch(when: number): void;
	/**
	 * Returns true if automation playback should be active — i.e. the
	 * parameter value should be read from the automation curve.
	 *
	 * - READ mode: always true
	 * - WRITE mode: always false (manual control)
	 * - TOUCH mode: true when NOT touching (follow curve), false when touching
	 * - LATCH mode: true when NOT touching (follow curve), false when touching
	 * - OFF mode: always false
	 */
	automationPlayback(): boolean;
	/**
	 * Returns true if automation writing should be active — i.e. parameter
	 * changes should be recorded into the automation curve.
	 *
	 * - READ mode: always false
	 * - WRITE mode: always true
	 * - TOUCH mode: true when touching
	 * - LATCH mode: true when touching
	 * - OFF mode: always false
	 */
	automationWrite(): boolean;
	/**
	 * Begins a write pass at the given time. Points written during the pass
	 * will be tracked for later thinning.
	 * @param when The transport time at the start of the write pass
	 */
	startWritePass(when: number): void;
	/**
	 * Finishes the current write pass and optionally applies point thinning
	 * to the points recorded during the pass.
	 *
	 * @param when The transport time at the end of the write pass
	 * @param thinningFactor Optional area threshold for the triangle-area
	 *   thinning algorithm. If provided and > 0, points in the write pass
	 *   range with triangle area below this value are removed.
	 */
	writePassFinished(when: number, thinningFactor?: number): void;
	/**
	 * Adds a guard point that preserves the current curve value just before
	 * or after a write pass boundary. This prevents the write pass from
	 * unintentionally altering automation outside its range.
	 *
	 * @param when The boundary time
	 * @param offset A small time offset. Negative places the guard point
	 *   before `when`, positive places it after.
	 * @returns The created guard point, or null if no value could be determined
	 */
	addGuardPoint(when: number, offset: number): AutomationPoint | null;
	/**
	 * Calculates the value at a given time based on points and interpolation.
	 * Uses the lookup cache (B-4) to accelerate sequential lookups and the
	 * spline engine (B-1) for Curved interpolation.
	 *
	 * @param time The time in seconds
	 * @returns The interpolated value, or null if no points exist
	 */
	getValueAt(time: number): number | null;
	/**
	 * Cuts (removes) all points in the time range [start, end] and returns
	 * them as a new AutomationList. The original list is modified in place.
	 *
	 * @param start Start of the range (inclusive)
	 * @param end End of the range (inclusive)
	 * @returns A new AutomationList containing the cut points (times
	 *   are preserved as-is)
	 */
	cut(start: number, end: number): AutomationList;
	/**
	 * Copies all points in the time range [start, end] into a new
	 * AutomationList without modifying the original.
	 *
	 * @param start Start of the range (inclusive)
	 * @param end End of the range (inclusive)
	 * @returns A new AutomationList containing copies of the points
	 */
	copy(start: number, end: number): AutomationList;
	/**
	 * Pastes the points from a source AutomationList into this list,
	 * offsetting their times so that the earliest source point lands
	 * at the given position.
	 *
	 * @param source The AutomationList to paste from
	 * @param position The target time for the earliest point
	 */
	paste(source: AutomationList, position: number): void;
	/**
	 * Removes all points in the time range [start, end].
	 *
	 * @param start Start of the range (inclusive)
	 * @param end End of the range (inclusive)
	 */
	eraseRange(start: number, end: number): void;
	/**
	 * Scales the time axis of all points by the given ratio.
	 * A ratio of 2.0 stretches time to double, 0.5 compresses to half.
	 *
	 * @param ratio The time scaling ratio (must be > 0)
	 */
	xScale(ratio: number): void;
	/**
	 * Transforms all point values through the given callback function.
	 * Useful for operations like normalizing, inverting, or applying gain.
	 *
	 * @param fn A function that receives the current value and returns the
	 *   transformed value
	 */
	yTransform(fn: (value: number) => number): void;
	/**
	 * Invalidates the lookup cache and spline coefficients.
	 * Must be called whenever points are added, removed, or moved.
	 */
	private _invalidateCache;
}
type ProcessorId$1 = string;
export declare abstract class Processor {
	readonly id: ProcessorId$1;
	name: string;
	automations: Map<string, AutomationList>;
	protected _active: boolean;
	readonly activeChanged: Signal<boolean>;
	readonly stateChanged: Signal<void>;
	readonly automationAdded: Signal<{
		paramName: string;
		list: AutomationList;
	}>;
	/**
	 * The number of frames of audio "tail" this processor produces after
	 * input ceases (e.g. reverb decay, delay feedback).  Used by the engine
	 * to know how long to keep processing after playback stops.
	 */
	private _tailLength;
	readonly tailLengthChanged: Signal<number>;
	/**
	 * Processing latency in samples.  Subclasses that introduce latency
	 * (e.g. look-ahead limiters, linear-phase EQs) should call
	 * {@link setLatency} rather than overriding {@link getLatency}.
	 */
	private _latency;
	readonly latencyChanged: Signal<number>;
	constructor(id: ProcessorId$1, name: string);
	getAutomation(paramName: string): AutomationList;
	get active(): boolean;
	set active(value: boolean);
	/**
	 * Returns the tail length in frames.
	 */
	getTailLength(): number;
	/**
	 * Set the tail length in frames.
	 * @param frames Number of frames (>= 0).
	 */
	setTailLength(frames: number): void;
	/**
	 * Returns the processing latency introduced by this processor, in samples.
	 *
	 * Subclasses that introduce latency (e.g. look-ahead limiters, linear-phase
	 * EQs) should override this method.  The route uses the aggregate latency
	 * of all its processors to compute automatic delay compensation
	 * (see {@link Route.getProcessorLatency}).
	 *
	 * @returns Latency in samples (default 0).
	 */
	getLatency(): number;
	/**
	 * Set the processing latency in samples.
	 * @param samples Latency in samples (>= 0).
	 */
	setLatency(samples: number): void;
	/**
	 * Returns the effective tail length, which is the maximum of this
	 * processor's own tail length and any child processor tail lengths.
	 *
	 * Subclasses that contain child processors (e.g. processor chains,
	 * plugin wrappers) should override this to include their children.
	 *
	 * @returns Effective tail length in frames.
	 */
	getEffectiveTailLength(): number;
}
export declare class GainProcessor extends Processor {
	private _gain;
	readonly gainChanged: Signal<number>;
	constructor(id: ProcessorId$1, name?: string);
	get gain(): number;
	set gain(db: number);
}
/**
 * Panning algorithm type.
 */
export declare enum PannerType {
	/** Simple left/right balance control. */
	STEREO_BALANCE = "stereo_balance",
	/** Stereo width (MS mid-side encoding). */
	STEREO_WIDTH = "stereo_width",
	/** Equal-power panning law (cosine/sine). */
	EQUAL_POWER = "equal_power",
	/** Linear panning law. */
	LINEAR = "linear"
}
/**
 * Pan law compensation applied at center position.
 *
 * When a mono signal is panned to center, both speakers reproduce the full
 * signal, causing an apparent loudness increase.  Pan laws attenuate the
 * center position to compensate.
 */
export declare enum PanLaw {
	/** -3 dB center attenuation (equal power, default). */
	MINUS_3DB = "-3dB",
	/** -4.5 dB center attenuation (compromise). */
	MINUS_4_5DB = "-4.5dB",
	/** -6 dB center attenuation (linear). */
	MINUS_6DB = "-6dB",
	/** 0 dB center — no compensation. */
	ZERO_DB = "0dB"
}
/**
 * Full-featured stereo panner.
 *
 * Supports multiple panning algorithms ({@link PannerType}), configurable
 * pan laws ({@link PanLaw}), stereo width control, and a future-proof
 * elevation parameter for 3-D panning.
 *
 * Signal chain position (inside {@link Route}):
 *   … -> [Post-fader plugins] -> **Panner** -> Output
 */
export declare class Panner extends Processor {
	private _type;
	private _panLaw;
	/** Azimuth position: -1.0 (hard left) to 1.0 (hard right). */
	private _azimuth;
	/** Stereo width: 0.0 (mono) to 1.0 (normal) to 2.0 (extra wide). */
	private _width;
	/** Elevation: -1.0 to 1.0 (reserved for future 3-D / Atmos support). */
	private _elevation;
	readonly azimuthChanged: Signal<number>;
	readonly widthChanged: Signal<number>;
	readonly typeChanged: Signal<PannerType>;
	constructor(id: ProcessorId$1, name?: string, type?: PannerType, panLaw?: PanLaw);
	get type(): PannerType;
	get panLaw(): PanLaw;
	get azimuth(): number;
	get width(): number;
	get elevation(): number;
	/**
	 * Set the pan position (azimuth).
	 * @param value -1.0 (hard left) to 1.0 (hard right).
	 */
	setAzimuth(value: number): void;
	/**
	 * Set the stereo width.
	 * @param value 0.0 (mono) through 1.0 (normal) to 2.0 (extra wide).
	 */
	setWidth(value: number): void;
	/**
	 * Set the elevation (reserved for 3-D panning).
	 * @param value -1.0 to 1.0.
	 */
	setElevation(value: number): void;
	/**
	 * Set the pan law.
	 */
	setPanLaw(law: PanLaw): void;
	/**
	 * Set the panner type (algorithm).
	 */
	setType(type: PannerType): void;
	/**
	 * Compute the left and right gain coefficients for the current pan
	 * position, width, type and pan law.
	 *
	 * @returns `[leftGain, rightGain]` — linear gain values.
	 */
	computeGains(): [
		number,
		number
	];
	/**
	 * Equal-power panning: left = cos(theta), right = sin(theta)
	 * where theta = normalizedPan * PI/2.
	 */
	private _computeEqualPower;
	/**
	 * Linear panning: left = 1 - pan, right = pan (pan 0..1).
	 */
	private _computeLinear;
	/**
	 * Stereo balance: attenuates the opposite channel rather than boosting.
	 * At center both channels pass at unity; panning left attenuates right.
	 */
	private _computeStereoBalance;
	/**
	 * Stereo width via mid/side (MS) encoding.
	 *
	 * Mid  = (L + R) / 2
	 * Side = (L - R) / 2
	 *
	 * Recombine with width factor w:
	 *   L' = Mid + w * Side
	 *   R' = Mid - w * Side
	 *
	 * width = 0 -> mono, 1 -> normal stereo, 2 -> extra wide.
	 *
	 * Azimuth is applied on top as equal-power balance of the result.
	 */
	private _computeStereoWidth;
	/**
	 * Compute the gain multiplier that compensates between the raw algorithm's
	 * inherent center level and the user-selected pan law.
	 *
	 * @param rawLaw The pan law inherent to the raw algorithm.
	 * @returns A linear gain multiplier (>= 1 if boosting center, <= 1 if cutting).
	 */
	private _centerCompensation;
	/**
	 * Get the azimuth as a normalized 0..1 value (for automation lanes).
	 * 0 = hard left, 0.5 = center, 1 = hard right.
	 */
	getNormalizedAzimuth(): number;
	/**
	 * Set azimuth from a normalized 0..1 value.
	 */
	setNormalizedAzimuth(normalized: number): void;
	/**
	 * Human-readable string for the current pan position.
	 *
	 * Examples: `"L 30"`, `"C"`, `"R 45"`, `"L 100"`.
	 */
	valueAsString(): string;
}
declare class PolarityProcessor extends Processor {
	private _inverted;
	/** Emitted whenever the polarity state changes. */
	readonly polarityChanged: Signal<boolean>;
	constructor(id: ProcessorId$1, name?: string);
	/** Whether the signal is phase-inverted. */
	get inverted(): boolean;
	/**
	 * Set the polarity inversion state.
	 * @param inverted `true` to invert (multiply samples by -1), `false` for normal.
	 */
	setInverted(inverted: boolean): void;
}
export type IOId = string;
export type IODataType = "audio" | "midi";
export declare class IO {
	readonly id: IOId;
	name: string;
	dataType: IODataType;
	private _connections;
	private _latency;
	private _bundleName?;
	readonly connected: Signal<string>;
	readonly disconnected: Signal<string>;
	readonly latencyChanged: Signal<number>;
	constructor(id: IOId, name: string, dataType?: IODataType);
	get latency(): number;
	set latency(value: number);
	get bundleName(): string | undefined;
	set bundleName(value: string | undefined);
	/**
	 * Returns the maximum latency across all connected IOs.
	 * Accepts a resolver function that maps an IOId to its latency value.
	 */
	getConnectedLatency(resolveLatency: (id: IOId) => number): number;
	connect(targetId: IOId): void;
	disconnect(targetId: IOId): void;
	get connections(): ReadonlyArray<IOId>;
	isConnectedTo(targetId: IOId): boolean;
}
/**
 * LatencyCompensator
 *
 * A per-channel ring-buffer delay line used to time-align audio routes.
 * When one route has higher processing latency than another, the lower-
 * latency route gets a LatencyCompensator inserted with the appropriate
 * delay so that both routes arrive at the summing point in phase.
 */
export declare class LatencyCompensator {
	private _delaySamples;
	private _buffer;
	private _writePos;
	private _channels;
	private _maxDelay;
	constructor(channels?: number, maxDelay?: number);
	/** Current delay in samples. */
	get delaySamples(): number;
	/**
	 * Set the compensation delay.
	 * @param samples Delay in samples (clamped to 0 .. maxDelay - 1).
	 */
	setDelay(samples: number): void;
	/**
	 * Process a block of audio through the delay buffer.
	 *
	 * For each sample in the block the method writes the input into the ring
	 * buffer at `_writePos` and reads the output from `_writePos - delay`
	 * (wrapped).  This introduces an exact `_delaySamples` latency.
	 *
	 * If `_delaySamples` is 0 the input is copied directly to the output
	 * with no ring-buffer overhead.
	 *
	 * @param input  Per-channel input arrays (length >= blockSize each).
	 * @param output Per-channel output arrays (length >= blockSize each).
	 *               May alias the same arrays as `input`.
	 * @param blockSize Number of samples to process.
	 */
	process(input: Float32Array[], output: Float32Array[], blockSize: number): void;
	/**
	 * Reset all ring buffers to silence and rewind the write pointer.
	 * Call after a transport locate or when the delay amount changes to
	 * avoid stale audio leaking through.
	 */
	reset(): void;
}
export declare class Route {
	readonly id: RouteId;
	name: string;
	readonly input: IO;
	readonly output: IO;
	private _preFaderProcessors;
	private _postFaderProcessors;
	readonly processorAdded: Signal<Processor>;
	readonly processorRemoved: Signal<string>;
	/** Input gain correction (pre-fader). */
	private _trim;
	/** Main channel fader. */
	private _fader;
	/** Phase inversion processor (post-fader, before post-fader plugins). */
	private _polarity;
	/** Channel panner. */
	private _panner;
	private _active;
	/**
	 * Auto-computed compensation delay (in samples) applied to this route
	 * so that all routes in the session are time-aligned.
	 */
	private _compensationDelay;
	/**
	 * Delay buffer that applies `_compensationDelay` samples of latency to
	 * this route's audio so all routes stay time-aligned at the summing bus.
	 */
	readonly latencyCompensator: LatencyCompensator;
	/**
	 * Emitted whenever the total processor latency of this route changes,
	 * carrying the new total latency in samples.  The session listens to
	 * this signal to know when to recompute global compensation.
	 */
	readonly latencyChanged: Signal<number>;
	/** Disposers for processor latency-change subscriptions. */
	private _latencySubscriptions;
	constructor(id: RouteId, name: string);
	/**
	 * Adds a processor to the chain.
	 * @param processor The processor to add
	 * @param position 'pre' (before fader) or 'post' (after fader)
	 * @param index Index within the specific chain (not global index)
	 */
	addProcessor(processor: Processor, position?: "pre" | "post", index?: number): void;
	removeProcessor(id: ProcessorId): void;
	/**
	 * Reorder a processor within the same chain (pre or post fader).
	 */
	reorderProcessor(id: ProcessorId, newIndex: number): void;
	/**
	 * Full ordered processor chain.
	 *
	 * Order: Trim -> [Pre-fader] -> Fader -> Polarity -> [Post-fader] -> Panner
	 */
	get processors(): ReadonlyArray<Processor>;
	get preFaderProcessors(): ReadonlyArray<Processor>;
	get postFaderProcessors(): ReadonlyArray<Processor>;
	get volume(): number;
	set volume(db: number);
	get pan(): number;
	set pan(val: number);
	/**
	 * Input trim gain in dB.
	 * Used for pre-fader level correction (e.g. mic preamp adjustment).
	 */
	get trim(): number;
	set trim(db: number);
	get active(): boolean;
	set active(value: boolean);
	/** Input trim gain processor. */
	get trimProcessor(): GainProcessor;
	/** Main channel fader. */
	get fader(): GainProcessor;
	/** Polarity (phase inversion) processor. */
	get polarity(): PolarityProcessor;
	/** Channel panner. */
	get panner(): Panner;
	/**
	 * Sum of latencies (in samples) introduced by all processors in this route.
	 *
	 * This represents the total processing delay that audio experiences as it
	 * passes through the signal chain.  Used by the session to compute
	 * per-route compensation delays so that all routes stay time-aligned.
	 */
	getProcessorLatency(): number;
	/**
	 * Alias for {@link getProcessorLatency} — returns the total latency
	 * (in samples) across every processor in the chain.
	 */
	getTotalLatency(): number;
	/**
	 * Returns the maximum tail length (in frames) across all processors in
	 * this route.
	 *
	 * The tail length represents the duration of audio "tail" that persists
	 * after input ceases (e.g. reverb decay, delay feedback).  The engine
	 * uses this value to know how long to keep processing after playback
	 * stops.
	 */
	getTotalTailLength(): number;
	/**
	 * The current compensation delay applied to this route (in samples).
	 *
	 * The value is set by the session / engine after evaluating all routes.
	 * A route with lower inherent latency gets a larger compensation delay
	 * so that every route's effective latency equals the session maximum.
	 */
	get compensationDelay(): number;
	/**
	 * Recalculate the route-level latency total and emit {@link latencyChanged}
	 * when it differs from the previous value.  Also syncs the
	 * {@link latencyCompensator} delay with {@link _compensationDelay}.
	 *
	 * Called automatically whenever a processor is added / removed or any
	 * processor's latency changes.
	 */
	updateLatencyCompensation(): void;
	/**
	 * Directly set the compensation delay for this route.
	 * @param samples Delay in samples (>= 0).
	 */
	setCompensationDelay(samples: number): void;
	/**
	 * Compute the compensation delay needed for this route given the
	 * maximum latency across the entire session.
	 *
	 * Call this once per route after determining `maxLatency` via
	 * `Math.max(...routes.map(r => r.getProcessorLatency()))`.
	 *
	 * @param maxLatency The highest processor latency among all routes (in samples).
	 */
	computeLatencyCompensation(maxLatency?: number): void;
	private _subscribeToProcessorLatency;
	private _unsubscribeFromProcessorLatency;
}
/** Time domain for position/duration */
export declare enum TimeDomain {
	/** Absolute time (samples/seconds), BPM-independent */
	AudioTime = 0,
	/** Musical time (beats/bars), BPM-dependent */
	BeatTime = 1
}
/** Ticks per beat (subdivision for precise fractional beats) */
export declare const TICKS_PER_BEAT = 1920;
/** Beats as fractional quarters */
export declare class Beats {
	private _ticks;
	constructor(beats?: number);
	static fromTicks(ticks: number): Beats;
	toNumber(): number;
	toTicks(): number;
	add(other: Beats): Beats;
	subtract(other: Beats): Beats;
	multiply(factor: number): Beats;
	equals(other: Beats): boolean;
	lessThan(other: Beats): boolean;
	greaterThan(other: Beats): boolean;
}
/** Position with time domain */
export interface TimePosition {
	domain: TimeDomain;
	/** Value in domain-specific units (samples or ticks) */
	value: number;
}
/**
 * A single tempo/time-signature change event in the tempo map.
 */
export interface TempoEvent {
	/** Position in frames */
	frame: number;
	/** Tempo at this point (BPM) */
	bpm: number;
	/** Time signature numerator (optional, inherits previous if unset) */
	timeSigNum?: number;
	/** Time signature denominator (optional, inherits previous if unset) */
	timeSigDen?: number;
}
/**
 * A meter (time signature) change event, stored independently from tempo events.
 */
export interface MeterEvent {
	/** Position in frames */
	frame: number;
	/** Number of beats per bar (time signature numerator) */
	beatsPerBar: number;
	/** Beat value that gets one beat (time signature denominator, e.g. 4 = quarter note) */
	beatValue: number;
}
/**
 * Bar/Beat/Tick representation of a musical position.
 * Tick resolution is 1920 ticks per beat.
 */
export interface BBT {
	/** Bar number (1-based) */
	bar: number;
	/** Beat within bar (1-based) */
	beat: number;
	/** Tick within beat (0-based, 0..1919) */
	tick: number;
}
/**
 * Subdivision types for grid calculations.
 */
export type SubdivisionType = "bar" | "beat" | "half" | "quarter" | "eighth" | "sixteenth" | "triplet" | "dotted";
/**
 * Combined tempo and meter information at a point in time.
 */
export interface TempoAndMeter {
	bpm: number;
	beatsPerBar: number;
	beatValue: number;
}
/**
 * TempoMap handles conversion between AudioTime (samples/frames) and BeatTime (beats/ticks).
 * Supports multiple tempo and meter changes over the timeline.
 *
 * Features:
 * - Dual domain support (AudioTime / BeatTime)
 * - Independent tempo and meter event lists
 * - Bar/Beat/Tick (BBT) conversions with 1920 ticks-per-beat resolution
 * - Grid point generation with subdivision and swing support
 * - Region repositioning on tempo change
 * - Binary search for efficient segment lookup
 */
export declare class TempoMap {
	private sampleRate;
	private events;
	private _meterEvents;
	/** Fires after any modification to the tempo map (add/remove tempo or meter changes). */
	readonly changed: Signal<void>;
	/**
	 * Fires after a tempo value has been modified, providing the frame at which the change occurred.
	 * Useful for repositioning regions or cursors after a tempo edit.
	 */
	readonly onTempoChanged: Signal<{
		frame: number;
		oldBpm: number;
		newBpm: number;
	}>;
	constructor(sampleRate?: number);
	/**
	 * Add or update a tempo change at the given frame position.
	 * If a tempo change already exists at the exact frame, it is updated.
	 */
	addTempoChange(frame: number, bpm: number, timeSigNum?: number, timeSigDen?: number): void;
	/**
	 * Remove a tempo change at the given frame.
	 * The initial event at frame 0 cannot be removed.
	 */
	removeTempoChange(frame: number): void;
	/**
	 * Get the tempo (BPM) at a given frame position.
	 * Uses binary search for efficient lookup.
	 */
	getTempoAtFrame(frame: number): number;
	/**
	 * Get the time signature at a given frame position.
	 * Returns [numerator, denominator].
	 * Walks through tempo events that carry time signature overrides.
	 */
	getTimeSignatureAtFrame(frame: number): [
		number,
		number
	];
	/**
	 * Get all tempo events, sorted by frame.
	 */
	getAllEvents(): ReadonlyArray<TempoEvent>;
	/**
	 * Add or update a meter (time signature) change at the given frame position.
	 * If a meter change already exists at the exact frame, it is updated.
	 *
	 * @param frame - Frame position of the meter change
	 * @param beatsPerBar - Number of beats per bar (time signature numerator)
	 * @param beatValue - Note value that gets one beat (time signature denominator, e.g. 4 = quarter)
	 */
	addMeterChange(frame: number, beatsPerBar: number, beatValue: number): void;
	/**
	 * Remove a meter change at the given frame.
	 * The initial meter event at frame 0 cannot be removed.
	 *
	 * @param frame - Frame position of the meter change to remove
	 */
	removeMeterChange(frame: number): void;
	/**
	 * Get the meter (time signature) at a given frame position.
	 * Uses binary search for efficient lookup.
	 *
	 * @param frame - Frame position to query
	 * @returns The active MeterEvent at the given frame
	 */
	getMeterAt(frame: number): MeterEvent;
	/**
	 * Get all meter events, sorted by frame.
	 */
	getAllMeterEvents(): ReadonlyArray<MeterEvent>;
	/**
	 * Get combined tempo and meter information at a given frame position.
	 * Convenience method that returns both BPM and time signature data.
	 *
	 * @param frame - Frame position to query
	 * @returns Combined tempo and meter data
	 */
	getTempoAndMeterAt(frame: number): TempoAndMeter;
	/**
	 * Convert frames to seconds, accounting for tempo changes across the timeline.
	 * Integrates the duration of each tempo segment.
	 */
	framesToSeconds(frames: FrameCount, sampleRate?: number): number;
	/**
	 * Convert seconds to frames, accounting for tempo changes across the timeline.
	 */
	secondsToFrames(seconds: number, sampleRate?: number): FrameCount;
	/**
	 * Convert a frame position to an absolute beat count from the start of the timeline,
	 * accounting for ALL tempo changes along the way.
	 *
	 * For each tempo segment, the number of beats is calculated as:
	 *   beats = (segmentFrames / sampleRate) * (bpm / 60)
	 *
	 * @param frame - Frame position to convert
	 * @param sampleRate - Sample rate override (defaults to constructor value)
	 * @returns Absolute beat count from frame 0
	 */
	framesToBeatsAbsolute(frame: number, sampleRate?: number): number;
	/**
	 * Convert an absolute beat count from the start of the timeline to a frame position,
	 * accounting for ALL tempo changes along the way.
	 *
	 * Inverse of `framesToBeatsAbsolute`.
	 *
	 * @param beats - Absolute beat count from the start
	 * @param sampleRate - Sample rate override (defaults to constructor value)
	 * @returns Frame position
	 */
	beatsToFramesAbsolute(beats: number, sampleRate?: number): number;
	/**
	 * Convert a frame position to Bar/Beat/Tick notation.
	 *
	 * Walks through tempo and meter segments to calculate the cumulative
	 * bar, beat, and tick position. Uses 1920 ticks per beat.
	 *
	 * @param frame - Frame position to convert
	 * @param sampleRate - Sample rate override (defaults to constructor value)
	 * @returns BBT position (bars and beats are 1-based, ticks are 0-based)
	 */
	framesToBBT(frame: number, sampleRate?: number): BBT;
	/**
	 * Convert Bar/Beat/Tick notation to a frame position.
	 *
	 * @param bar - Bar number (1-based)
	 * @param beat - Beat within bar (1-based)
	 * @param tick - Tick within beat (0-based, 0..1919)
	 * @param sampleRate - Sample rate override (defaults to constructor value)
	 * @returns Frame position
	 */
	bbtToFrames(bar: number, beat: number, tick: number, sampleRate?: number): number;
	/**
	 * Compute the absolute beat position at which each meter event begins.
	 * This integrates tempo across the timeline to find beat offsets for each meter point.
	 */
	private _computeMeterBeatStarts;
	/**
	 * Returns the number of quarter-note beats per subdivision unit.
	 * For example, 'eighth' = 0.5 beats, 'bar' depends on current meter.
	 */
	private _subdivisionToBeats;
	/**
	 * Generate grid points between two frame positions for a given subdivision type.
	 *
	 * Walks through tempo and meter segments, generating evenly spaced grid points
	 * according to the active tempo and subdivision at each point.
	 *
	 * @param startFrame - Start of the range (inclusive)
	 * @param endFrame - End of the range (inclusive)
	 * @param subdivisionType - Grid subdivision type
	 * @param sampleRate - Sample rate override (defaults to constructor value)
	 * @returns Array of frame positions for grid points within the range
	 */
	getGridPoints(startFrame: number, endFrame: number, subdivisionType: SubdivisionType, sampleRate?: number): number[];
	/**
	 * Snap a frame position to the nearest grid point for the given subdivision type.
	 *
	 * @param frame - Frame position to snap
	 * @param subdivisionType - Grid subdivision type
	 * @param sampleRate - Sample rate override (defaults to constructor value)
	 * @returns The nearest grid-aligned frame position
	 */
	snapToGrid(frame: number, subdivisionType: SubdivisionType, sampleRate?: number): number;
	/**
	 * Generate a swing grid between two frame positions.
	 *
	 * Swing offsets every other grid point by shifting it forward in time.
	 * A `swingAmount` of 0 produces a straight grid; 1 pushes the off-beat
	 * to the maximum position (the next grid point).
	 *
	 * @param startFrame - Start of the range (inclusive)
	 * @param endFrame - End of the range (inclusive)
	 * @param subdivision - Grid subdivision type
	 * @param swingAmount - Swing amount between 0 (straight) and 1 (max swing)
	 * @param sampleRate - Sample rate override (defaults to constructor value)
	 * @returns Array of frame positions for the swing-adjusted grid
	 */
	getSwingGrid(startFrame: number, endFrame: number, subdivision: SubdivisionType, swingAmount: number, sampleRate?: number): number[];
	/**
	 * Recalculate a frame position after a tempo change, preserving its musical position.
	 *
	 * When tempo changes from `oldTempo` to `newTempo`, a region that was at a certain
	 * beat position should move to maintain the same musical position. This method
	 * calculates the new frame position.
	 *
	 * @param frame - Original frame position
	 * @param oldTempo - Previous tempo in BPM
	 * @param newTempo - New tempo in BPM
	 * @param sampleRate - Sample rate override (defaults to constructor value)
	 * @returns Recalculated frame position
	 */
	repositionFrameForTempoChange(frame: number, oldTempo: number, newTempo: number, sampleRate?: number): number;
	/** Convert beats to frames at given BPM */
	beatsToFrames(beats: Beats, bpm: number): FrameCount;
	/** Convert frames to beats at given BPM */
	framesToBeats(frames: FrameCount, bpm: number): Beats;
	/** Convert TimePosition to frames */
	toFrames(pos: TimePosition, bpm: number): FrameCount;
	/** Convert TimePosition to beats */
	toBeats(pos: TimePosition, bpm: number): Beats;
}
/**
 * OverlapType — describes how a query range relates to a region's time span.
 */
export declare enum OverlapType {
	/** No overlap at all */
	NONE = 0,
	/** Query range is fully inside the region */
	INTERNAL = 1,
	/** Query overlaps the region's start (but not its end) */
	START = 2,
	/** Query overlaps the region's end (but not its start) */
	END = 3,
	/** Region is fully inside the query range */
	EXTERNAL = 4
}
/**
 * Fade curve shapes available for region fade-in and fade-out envelopes.
 */
export declare enum FadeShape {
	LINEAR = 0,
	EQUAL_POWER = 1,
	S_CURVE = 2,
	FAST = 3,
	SLOW = 4,
	CUSTOM = 5
}
/**
 * Describes a fade envelope with a length (in frames) and a curve shape.
 */
export interface FadeEnvelope {
	length: FrameCount;
	shape: FadeShape;
}
/**
 * Compute the gain value for a given fade shape at normalised position t (0..1).
 *
 * For a fade-in the caller passes t increasing from 0 to 1.
 * For a fade-out the caller should pass (1 - t) or invert the result.
 *
 * @param t  Normalised position in the fade, clamped to [0, 1].
 * @param shape  The curve shape to apply.
 * @returns  Gain value in the range [0, 1].
 */
export declare function computeFadeGain(t: number, shape: FadeShape): number;
export type AudioSourceId = string;
export declare class Region {
	id: RegionId;
	sourceId: AudioSourceId;
	name: string;
	start: FrameCount;
	length: FrameCount;
	sourceStart: FrameCount;
	gain: number;
	muted: boolean;
	layer: number;
	opaque: boolean;
	fadeIn: FrameCount;
	fadeOut: FrameCount;
	fadeInShape: FadeShape;
	fadeOutShape: FadeShape;
	playbackRate: number;
	/** Pitch-preserving time stretch ratio (1.0 = normal, 0.5 = half speed, 2.0 = double speed) */
	stretch: number;
	/** Pitch shift in semitones (0 = no shift, positive = higher, negative = lower) */
	pitchSemitones: number;
	syncPosition: FrameCount | null;
	transients: FrameCount[];
	locked: boolean;
	/** Time domain for this region (default: AudioTime for backward compatibility) */
	timeDomain: TimeDomain;
	private _regionFx;
	private _ancestralStart?;
	private _ancestralLength?;
	private _positionLocked;
	private _videoLocked;
	readonly lockedChanged: Signal<boolean>;
	readonly regionFxAdded: Signal<Processor>;
	readonly regionFxRemoved: Signal<Processor>;
	constructor(id: RegionId, sourceId: AudioSourceId, start: FrameCount, length: FrameCount, sourceStart: FrameCount, name: string, layer?: number);
	get end(): FrameCount;
	/** Get position as TimePosition */
	getPosition(): TimePosition;
	/** Get duration as TimePosition */
	getDuration(): TimePosition;
	/** Set position from TimePosition (converts if needed) */
	setPosition(pos: TimePosition, tempoMap: TempoMap, bpm: number): void;
	/** Set duration from TimePosition (converts if needed) */
	setDuration(duration: TimePosition, tempoMap: TempoMap, bpm: number): void;
	setLocked(locked: boolean): void;
	resize(newLength: FrameCount): void;
	move(newStart: FrameCount): void;
	/** Minimum region length in frames (1 sample) */
	private static readonly MIN_LENGTH;
	/**
	 * Trim the front of the region by an amount (delta-based).
	 * Positive amount moves start forward (shortens region).
	 * Negative amount moves start backward (extends region, if source allows).
	 */
	trimFront(amount: FrameCount): void;
	/**
	 * Trim the back of the region by an amount (delta-based).
	 * Positive amount extends region, negative shortens it.
	 */
	trimBack(amount: FrameCount): void;
	/**
	 * Trim front to a new absolute timeline position.
	 * Adjusts start, sourceStart, and length so the end stays fixed.
	 * @param newPosition - The new timeline start position
	 * @param sourceDuration - Optional source duration for boundary constraint
	 */
	trimFrontTo(newPosition: FrameCount, sourceDuration?: FrameCount): void;
	/**
	 * Trim end to a new absolute timeline endpoint.
	 * Adjusts length while keeping start and sourceStart fixed.
	 * @param newEndpoint - The new timeline end position
	 * @param sourceDuration - Optional source duration for boundary constraint
	 */
	trimEndTo(newEndpoint: FrameCount, sourceDuration?: FrameCount): void;
	/**
	 * Trim both position and length atomically.
	 * @param position - New timeline position
	 * @param length - New length
	 * @param sourceDuration - Optional source duration for constraint
	 */
	trimTo(position: FrameCount, length: FrameCount, sourceDuration?: FrameCount): void;
	/**
	 * Check if this region can trim its start before the source's beginning.
	 * Audio regions cannot (they'd read silence); MIDI regions can.
	 */
	canTrimStartBeforeSourceStart(): boolean;
	/**
	 * Verify and clamp start + length to source boundaries.
	 * @returns true if the values were valid (or clamped successfully)
	 */
	verifyStartAndLength(sourceDuration?: FrameCount): boolean;
	setFadeIn(amount: FrameCount): void;
	setFadeOut(amount: FrameCount): void;
	/** Set the fade-in curve shape. */
	setFadeInShape(shape: FadeShape): void;
	/** Set the fade-out curve shape. */
	setFadeOutShape(shape: FadeShape): void;
	/**
	 * Determine how a query range [start, end) relates to this region.
	 */
	coverage(start: FrameCount, end: FrameCount): OverlapType;
	/**
	 * Does this region cover the given frame position?
	 */
	covers(frame: FrameCount): boolean;
	/** Set the sync point as an offset from the region start. */
	setSyncPosition(offset: FrameCount): void;
	/** Clear the sync point. */
	clearSyncPosition(): void;
	/**
	 * Get the sync offset. Returns 0 if no sync point is set.
	 */
	getSyncOffset(): FrameCount;
	/**
	 * Adjust a frame position by the sync offset.
	 * Useful for snap-to-grid alignment: if the region has a sync point,
	 * the snap target should account for this offset.
	 */
	adjustToSync(frame: FrameCount): FrameCount;
	/**
	 * True if both regions reference the same source, have the same position,
	 * length, and source start.
	 */
	exactEquivalent(other: Region): boolean;
	/** True if both regions reference the same source file. */
	sourceEquivalent(other: Region): boolean;
	/** True if the two regions overlap in time. */
	overlapEquivalent(other: Region): boolean;
	/** True if the two regions share the same layer and overlap in time. */
	layerAndTimeEquivalent(other: Region): boolean;
	/** Add a transient at the given frame position. Keeps the list sorted. */
	addTransient(frame: FrameCount): void;
	/** Remove the transient at the given frame position (if present). */
	removeTransient(frame: FrameCount): void;
	/** Get a readonly copy of the transient positions. */
	getTransients(): ReadonlyArray<FrameCount>;
	/** Whether this region has any detected/manual transients. */
	hasTransients(): boolean;
	/** Add a processor to the region's FX chain. */
	addRegionFx(processor: Processor): void;
	/** Remove a processor from the region's FX chain by its ID. */
	removeRegionFx(processorId: string): void;
	/** Get a readonly copy of the region's FX chain. */
	getRegionFx(): Processor[];
	/** Move a processor to a new index in the FX chain. */
	moveRegionFx(processorId: string, newIndex: number): void;
	/** Remove all processors from the region's FX chain. */
	clearRegionFx(): void;
	/** Whether this region has any FX processors. */
	hasRegionFx(): boolean;
	/** Get the ancestral start position (before any edits). */
	getAncestralStart(): number | undefined;
	/** Get the ancestral length (before any edits). */
	getAncestralLength(): number | undefined;
	/** Set the ancestral data for undo tracking. */
	setAncestralData(start: number, length: number): void;
	/** Whether the region's position is locked (cannot be moved). */
	isPositionLocked(): boolean;
	/** Set the position lock state. */
	setPositionLocked(locked: boolean): void;
	/** Whether the region is video-locked (synced to video timeline). */
	isVideoLocked(): boolean;
	/** Set the video lock state. */
	setVideoLocked(locked: boolean): void;
}
export type MidiNoteId = string;
export declare class MidiNote {
	readonly id: MidiNoteId;
	pitch: number;
	velocity: number;
	startFrame: FrameCount;
	durationFrames: FrameCount;
	channel: number;
	readonly changed: Signal<MidiNote>;
	constructor(id: MidiNoteId, pitch: number, velocity: number, startFrame: FrameCount, durationFrames: FrameCount, channel?: number);
	get endFrame(): FrameCount;
	setPitch(pitch: number): void;
	setVelocity(velocity: number): void;
	move(newStartFrame: FrameCount): void;
	resize(newDuration: FrameCount): void;
	transpose(semitones: number): void;
	/**
	 * Get MIDI note name (e.g., "C4", "A#3")
	 */
	getNoteName(): string;
	/**
	 * Convert pitch to frequency in Hz
	 */
	getFrequency(): number;
	toJSON(): MidiNoteSnapshot;
	static fromJSON(data: MidiNoteSnapshot): MidiNote;
}
export interface MidiNoteSnapshot {
	id: string;
	pitch: number;
	velocity: number;
	startFrame: number;
	durationFrames: number;
	channel: number;
}
export declare class MidiRegion {
	id: RegionId;
	name: string;
	start: FrameCount;
	length: FrameCount;
	private _notes;
	muted: boolean;
	layer: number;
	locked: boolean;
	/** Time domain for this region */
	timeDomain: TimeDomain;
	readonly noteAdded: Signal<MidiNote>;
	readonly noteRemoved: Signal<string>;
	readonly noteChanged: Signal<MidiNote>;
	readonly lockedChanged: Signal<boolean>;
	constructor(id: RegionId, name: string, start: FrameCount, length: FrameCount, layer?: number);
	get end(): FrameCount;
	get notes(): ReadonlyArray<MidiNote>;
	addNote(note: MidiNote): void;
	removeNote(noteId: MidiNoteId): MidiNote | undefined;
	getNote(noteId: MidiNoteId): MidiNote | undefined;
	getNotes(): ReadonlyArray<MidiNote>;
	/**
	 * Get notes that overlap with the given frame range (relative to region start)
	 */
	getNotesInRange(startFrame: FrameCount, endFrame: FrameCount): MidiNote[];
	move(newStart: FrameCount): void;
	resize(newLength: FrameCount): void;
	setLocked(locked: boolean): void;
	/** Get position as TimePosition */
	getPosition(): TimePosition;
	/** Get duration as TimePosition */
	getDuration(): TimePosition;
	/** Set position from TimePosition (converts if needed) */
	setPosition(pos: TimePosition, tempoMap: TempoMap, bpm: number): void;
	/** Set duration from TimePosition (converts if needed) */
	setDuration(duration: TimePosition, tempoMap: TempoMap, bpm: number): void;
	private sortNotes;
	toJSON(): MidiRegionSnapshot;
	static fromJSON(data: MidiRegionSnapshot): MidiRegion;
}
export interface MidiRegionSnapshot {
	id: string;
	name: string;
	start: number;
	length: number;
	muted: boolean;
	layer: number;
	locked?: boolean;
	timeDomain?: number;
	notes: Array<{
		id: string;
		pitch: number;
		velocity: number;
		startFrame: number;
		durationFrames: number;
		channel: number;
	}>;
}
export type CrossfadeId = string;
declare enum CrossfadeType {
	FULL = "full",// Equal-power crossfade
	SHORT = "short",// Quick transition
	CUSTOM = "custom"
}
declare enum FadeCurve {
	LINEAR = "linear",
	EQUAL_POWER = "equal_power",
	S_CURVE = "s_curve",
	EXPONENTIAL = "exponential",
	LOGARITHMIC = "logarithmic",
	CONSTANT_POWER = "constant_power"
}
declare class Crossfade {
	readonly id: CrossfadeId;
	private _inRegionId;
	private _outRegionId;
	private _length;
	private _position;
	private _fadeInCurve;
	private _fadeOutCurve;
	private _type;
	private _active;
	readonly changed: Signal<void>;
	constructor(id: CrossfadeId, inRegionId: RegionId, outRegionId: RegionId, position: FrameCount, length: FrameCount, type?: CrossfadeType, fadeInCurve?: FadeCurve, fadeOutCurve?: FadeCurve);
	get inRegionId(): RegionId;
	get outRegionId(): RegionId;
	get length(): FrameCount;
	get position(): FrameCount;
	get end(): FrameCount;
	get fadeInCurve(): FadeCurve;
	get fadeOutCurve(): FadeCurve;
	get type(): CrossfadeType;
	get active(): boolean;
	setLength(length: FrameCount): void;
	setPosition(position: FrameCount): void;
	setCurves(fadeIn: FadeCurve, fadeOut: FadeCurve): void;
	setType(type: CrossfadeType): void;
	setActive(active: boolean): void;
	/**
	 * Calculate the gain value at a given frame for either the fade-in or
	 * fade-out side of the crossfade.
	 *
	 * @param frame  The absolute timeline frame.
	 * @param isIn   True for the fade-in region, false for the fade-out region.
	 * @returns Gain value in the range [0, 1]. Returns 1 if the frame is
	 *          outside the crossfade range (no attenuation).
	 */
	getGainAt(frame: FrameCount, isIn: boolean): number;
	/**
	 * Pre-compute gain curves for efficient real-time use.
	 *
	 * @param numSamples  Number of samples to compute (typically the crossfade
	 *                    length, but can be any resolution).
	 * @returns An object containing Float32Arrays for both curves.
	 */
	computeGainCurve(numSamples: number): {
		fadeIn: Float32Array;
		fadeOut: Float32Array;
	};
	/**
	 * Calculate the overlap between two regions. Returns null if there is no
	 * overlap. The convention is that regionA is the earlier (fade-out) region
	 * and regionB is the later (fade-in) region, but the method handles
	 * either ordering.
	 */
	static calculateOverlap(regionA: Region, regionB: Region): {
		position: FrameCount;
		length: FrameCount;
		outRegionId: RegionId;
		inRegionId: RegionId;
	} | null;
}
/**
 * Record Mode
 */
export declare enum RecordMode {
	/** 기존 리전을 유지하고 새 리전을 투명 Layer로 추가합니다. */
	SOUND_ON_SOUND = "sound_on_sound",
	/** 새 리전과 겹치는 기존 리전을 자르거나 Playlist에서 제거합니다. */
	NON_LAYERED = "non_layered",
	/** 기존 리전을 유지하고 새 리전을 불투명 최상위 Layer로 추가합니다. */
	LAYERED = "layered"
}
export declare class Playlist {
	readonly id: string;
	name: string;
	private regions;
	private midiRegions;
	private _crossfades;
	private _thawList;
	readonly regionAdded: Signal<Region>;
	readonly regionRemoved: Signal<string>;
	readonly regionChanged: Signal<Region>;
	readonly midiRegionAdded: Signal<MidiRegion>;
	readonly midiRegionRemoved: Signal<string>;
	readonly midiRegionChanged: Signal<MidiRegion>;
	readonly crossfadeAdded: Signal<Crossfade>;
	readonly crossfadeRemoved: Signal<string>;
	readonly crossfadeChanged: Signal<Crossfade>;
	constructor(id: string, name: string);
	addRegion(region: Region): void;
	removeRegion(regionId: RegionId): void;
	getRegions(): ReadonlyArray<Region>;
	getRegion(regionId: RegionId): Region | undefined;
	getTopLayer(): number;
	setRegionLayer(regionId: RegionId, layer: number): void;
	setRegionOpaque(regionId: RegionId, opaque: boolean): void;
	insertRecordedRegion(region: Region, mode: RecordMode): void;
	getRegionsInRange(start: FrameCount, end: FrameCount): Region[];
	/**
	 * Shift all regions whose start >= afterFrame by deltaFrames.
	 * Used for ripple editing.
	 */
	rippleShift(afterFrame: FrameCount, deltaFrames: number): void;
	notifyRegionChanged(region: Region): void;
	private replaceOverlappingRegions;
	private replaceOverlap;
	private trimExistingRegionEnd;
	private trimExistingRegionStart;
	private splitAroundRecordedRegion;
	private createRightSegment;
	private sortRegions;
	addMidiRegion(region: MidiRegion): void;
	removeMidiRegion(regionId: RegionId): void;
	getMidiRegions(): ReadonlyArray<MidiRegion>;
	getMidiRegion(regionId: RegionId): MidiRegion | undefined;
	getMidiRegionsInRange(start: FrameCount, end: FrameCount): MidiRegion[];
	private sortMidiRegions;
	/**
	 * Return all audio regions that overlap with the given region's time span.
	 * The query region itself is excluded from results.
	 */
	getOverlappingRegions(region: Region): Region[];
	/**
	 * Return all audio regions that are audible (not muted) at a given frame.
	 * Results are sorted by layer (highest first) so the top-most region is first.
	 */
	audibleRegionsAt(frame: FrameCount): Region[];
	/** All regions (muted or not) that cover the given frame. */
	regionsAt(frame: FrameCount): Region[];
	/** Highest-layer region at a given frame (may be muted). */
	topRegionAt(frame: FrameCount): Region | null;
	/** Highest-layer unmuted region at a given frame. */
	topUnmutedRegionAt(frame: FrameCount): Region | null;
	/**
	 * Find the next region start or end boundary in the given direction.
	 *
	 * @param frame      The reference frame.
	 * @param direction  1 for forward, -1 for backward.
	 * @returns The nearest region whose start is strictly in the given
	 *          direction, or null if none found.
	 */
	findNextRegion(frame: FrameCount, direction: 1 | -1): Region | null;
	/**
	 * Find the next region boundary (start or end) in the given direction.
	 *
	 * @param frame      The reference frame.
	 * @param direction  1 for forward, -1 for backward.
	 * @returns The nearest boundary frame, or null if none found.
	 */
	findNextRegionBoundary(frame: FrameCount, direction: 1 | -1): FrameCount | null;
	/**
	 * Is the region with the given id actually audible at the specified frame?
	 *
	 * A region is audible if it is not muted and is the top-layer region at
	 * that frame (i.e., no higher-layer unmuted region occludes it).
	 */
	regionIsAudibleAt(regionId: RegionId, frame: FrameCount): boolean;
	/**
	 * Get the bounding box (earliest start, latest end) of all audio regions.
	 * Returns { start: 0, end: 0 } if there are no regions.
	 */
	getExtent(): {
		start: FrameCount;
		end: FrameCount;
	};
	/**
	 * Add a crossfade to the playlist. Subscribes to its changed signal
	 * so the playlist can re-emit crossfadeChanged.
	 */
	addCrossfade(crossfade: Crossfade): void;
	/**
	 * Remove a crossfade by its ID.
	 */
	removeCrossfade(id: CrossfadeId): void;
	/**
	 * Get a crossfade by its ID.
	 */
	getCrossfade(id: CrossfadeId): Crossfade | undefined;
	/**
	 * Get all crossfades in the playlist.
	 */
	getCrossfades(): ReadonlyArray<Crossfade>;
	/**
	 * Get all crossfades that involve the given region (as either the
	 * fade-in or fade-out side).
	 */
	getCrossfadesForRegion(regionId: RegionId): Crossfade[];
	/**
	 * Auto-detect the overlap between two regions and create a crossfade if
	 * they overlap. Returns the created crossfade, or null if there is no
	 * overlap.
	 *
	 * @param regionA       First region.
	 * @param regionB       Second region.
	 * @param defaultLength Optional: override the crossfade length instead of
	 *                      using the actual overlap length.
	 */
	autoCreateCrossfade(regionA: Region, regionB: Region, defaultLength?: FrameCount): Crossfade | null;
	/**
	 * Recalculate all crossfades that involve a given region. Call this after
	 * a region is moved, resized, or trimmed so that the crossfade positions
	 * and lengths stay in sync with the actual overlap.
	 *
	 * Crossfades whose regions no longer overlap are automatically removed.
	 */
	updateCrossfadesForRegion(regionId: RegionId): void;
	/** Freeze signal emissions; all signals are queued until thaw(). */
	freeze(): void;
	/** Thaw and emit all queued signals. */
	thaw(): void;
	/**
	 * Split all regions at a given frame position.
	 * Regions that span the frame are split into two: one ending at the frame
	 * and one starting at the frame. Regions that don't cover the frame are
	 * left untouched.
	 */
	partition(frame: number): void;
	/**
	 * Duplicate a single region with a time offset.
	 * Returns the new region, or null if the source region was not found.
	 */
	duplicateRegion(regionId: string, offset: number): Region | null;
	/**
	 * Duplicate multiple regions with a time offset.
	 * Returns an array of the newly created regions.
	 */
	duplicateRegions(regionIds: string[], offset: number): Region[];
	/** Nudge all regions by the given number of frames (positive or negative). */
	nudge(frames: number): void;
	/** Nudge a single region by the given number of frames. */
	nudgeRegion(regionId: string, frames: number): void;
}
/**
 * Monitor Mode
 */
export declare enum MonitorMode {
	/** 녹음 중 = input, 재생 중 = disk */
	AUTO = "auto",
	/** 항상 입력 모니터링 */
	INPUT = "input",
	/** 항상 디스크 모니터링 */
	DISK = "disk",
	/** 외부 모니터링 (하드웨어) */
	EXTERNAL = "external"
}
export declare enum TrackType {
	AUDIO = "AUDIO",
	MIDI = "MIDI",
	AUX = "AUX",
	BUS = "BUS",
	FOLDER = "FOLDER",
	VCA = "VCA"
}
export interface BounceConfig {
	startFrame?: number;
	endFrame?: number;
	includePlugins: boolean;
	includeAutomation: boolean;
}
/**
 * @deprecated 녹음 겹침 정책은 RecordMode를 사용합니다.
 * 이 값은 호환성을 위해 유지되며 현재 Playlist 편집과 재생에는 사용되지 않습니다.
 */
export type TrackMode = "normal" | "non_layered" | "tape";
export declare class Track {
	readonly id: TrackId;
	name: string;
	readonly type: TrackType;
	readonly route: Route;
	readonly playlist: Playlist;
	armed: boolean;
	monitor: boolean;
	mute: boolean;
	solo: boolean;
	color: string;
	soloIsolate: boolean;
	soloSafe: boolean;
	monitorMode: MonitorMode;
	trimGain: number;
	comment: string;
	frozen: boolean;
	frozenSourceId: string | null;
	parentTrackId: TrackId | null;
	groupId: string | null;
	isCollapsed: boolean;
	private _alignStyle;
	private _trackMode;
	private _recordMode;
	private _bounceProgress;
	readonly armChanged: Signal<boolean>;
	readonly monitorChanged: Signal<boolean>;
	readonly muteChanged: Signal<boolean>;
	readonly soloChanged: Signal<boolean>;
	readonly soloIsolateChanged: Signal<boolean>;
	readonly soloSafeChanged: Signal<boolean>;
	readonly monitorModeChanged: Signal<MonitorMode>;
	readonly trimGainChanged: Signal<number>;
	readonly colorChanged: Signal<string>;
	readonly frozenChanged: Signal<boolean>;
	readonly alignStyleChanged: Signal<string>;
	readonly trackModeChanged: Signal<string>;
	readonly recordModeChanged: Signal<RecordMode>;
	readonly bounceProgressChanged: Signal<number>;
	readonly bounceCompleted: Signal<{
		sourceId: string;
	}>;
	constructor(id: TrackId, name: string, type: TrackType);
	rename(newName: string): void;
	setArmed(armed: boolean): void;
	setMonitor(monitor: boolean): void;
	setMute(mute: boolean): void;
	setSolo(solo: boolean): void;
	setColor(color: string): void;
	setFrozen(frozen: boolean): void;
	setSoloIsolate(isolate: boolean): void;
	setSoloSafe(safe: boolean): void;
	setMonitorMode(mode: MonitorMode): void;
	setTrimGain(db: number): void;
	/**
	 * Whether the track can be frozen. Returns false if already frozen.
	 */
	canFreeze(): boolean;
	/**
	 * Whether the track can be bounced.
	 * Audio and MIDI tracks can be bounced; AUX, BUS, FOLDER, and VCA cannot.
	 */
	canBounce(): boolean;
	/**
	 * Get the default bounce configuration for this track.
	 */
	getBounceConfig(): BounceConfig;
	/**
	 * Get a bounce configuration for a specific frame range.
	 *
	 * @param startFrame The start frame of the bounce range.
	 * @param endFrame   The end frame of the bounce range.
	 * @returns A BounceConfig with the specified range.
	 */
	getBounceRangeConfig(startFrame: FrameCount, endFrame: FrameCount): BounceConfig;
	/**
	 * Freeze the track, storing a reference to the rendered source.
	 *
	 * Freezing renders the track's output (including all plugins and
	 * automation) to a new audio source. The original playlist is preserved
	 * so it can be restored on unfreeze. While frozen, the track plays
	 * back from the rendered source and plugins are bypassed.
	 *
	 * @param sourceId Identifier of the rendered audio source.
	 */
	freeze(sourceId: string): void;
	/**
	 * Unfreeze the track, restoring the original playlist and plugins.
	 * Discards the frozen source reference.
	 */
	unfreeze(): void;
	/**
	 * Update the bounce progress.
	 * Used by the engine to report rendering progress to the UI.
	 *
	 * @param progress A value between 0 (not started) and 1 (complete).
	 */
	setBounceProgress(progress: number): void;
	/** Current bounce progress (0 to 1). */
	get bounceProgress(): number;
	/**
	 * Signal that a bounce operation has completed.
	 * Resets bounce progress to 0 and emits the bounceCompleted signal.
	 *
	 * @param sourceId Identifier of the newly created audio source.
	 */
	completeBounce(sourceId: string): void;
	/** Get the current alignment style for recording. */
	getAlignStyle(): string;
	/** Set the alignment style for recording. */
	setAlignStyle(style: "existing_material" | "capture_time"): void;
	/** Get the current track mode. */
	getTrackMode(): string;
	/**
	 * Set the track mode.
	 * - 'normal': standard layered playback (default)
	 * - 'non_layered': only one region plays at a time (highest layer wins)
	 * - 'tape': destructive recording, new audio replaces old
	 */
	setTrackMode(mode: TrackMode): void;
	get recordMode(): RecordMode;
	setRecordMode(mode: RecordMode): void;
}
/**
 * Video metadata attached to audio sources that originated from video files.
 * This allows the DAW to track video-specific information and support video export.
 */
export interface VideoMetadata {
	/**
	 * Frames per second of the source video
	 */
	readonly fps: number;
	/**
	 * Video frame width in pixels
	 */
	readonly width: number;
	/**
	 * Video frame height in pixels
	 */
	readonly height: number;
	/**
	 * Video codec used in the source file (e.g., "h264", "vp9")
	 */
	readonly codec: string;
	/**
	 * Container format of the source file (e.g., "mp4", "webm", "mov")
	 */
	readonly format: string;
	/**
	 * Total number of frames in the source video
	 */
	readonly frameCount: number;
	/**
	 * Whether the source video file contained audio
	 * (audio will have been extracted to the Source's AudioBuffer)
	 */
	readonly hasAudio: boolean;
	/**
	 * Optional data URL for a thumbnail image of the video
	 * Used for timeline preview
	 */
	readonly thumbnailUrl?: string;
	/**
	 * Original video file URL (blob URL or file path)
	 * Used for video export and frame extraction
	 */
	readonly originalVideoUrl: string;
}
/**
 * Pre-computed peak data for waveform rendering at a given resolution.
 *
 * Each entry represents one "pixel column" of the waveform and stores
 * the minimum, maximum, and RMS sample values within that column's
 * frame range.
 */
export interface PeakData {
	/** Minimum sample values per peak pixel. */
	min: Float32Array;
	/** Maximum sample values per peak pixel. */
	max: Float32Array;
	/** RMS (root mean square) values per peak pixel. */
	rms: Float32Array;
	/** Number of peak entries. */
	length: number;
	/** Number of source frames represented by each peak entry. */
	resolution: number;
}
/**
 * Aggregated analysis results computed by the AudioAnalyzer.
 *
 * Fields are populated lazily — not all analysis passes produce
 * every metric, so most values are optional.
 */
export interface SourceAnalysisData {
	/** Detected transient positions in frames. */
	transients: number[];
	/** Estimated tempo in beats per minute. */
	bpm?: number;
	/** Confidence of the BPM estimate (0..1). */
	bpmConfidence?: number;
	/** Integrated loudness in LUFS. */
	lufs?: number;
	/** True peak level in dBFS. */
	truePeak?: number;
	/** Zero crossing rate (crossings per second). */
	zeroCrossingRate?: number;
	/** Spectral centroid in Hz. */
	spectralCentroid?: number;
}
/**
 * Bitflags for source metadata properties.
 */
export declare enum SourceFlags {
	WRITABLE = 1,// 1
	CAN_RENAME = 2,// 2
	REMOVABLE = 4,// 4
	MISSING = 8,// 8
	RF64_RIFF = 16
}
export declare class Source {
	readonly id: SourceId;
	readonly name: string;
	readonly url: string;
	readonly duration: FrameCount;
	readonly sampleRate: number;
	readonly channelCount: number;
	/**
	 * Optional video metadata if this source originated from a video file.
	 * When present, indicates that audio was extracted from a video file.
	 */
	readonly videoMetadata?: VideoMetadata;
	/** Bitflags describing source properties (see SourceFlags). */
	flags: number;
	/** Identifier linking this source to a specific take. */
	takeId?: string;
	/** Name of the ancestor source (e.g. the original file before edits). */
	ancestorName?: string;
	/** Reference count tracking how many regions/clips use this source. */
	private _useCount;
	/** Cached peak data for waveform display at various zoom levels. */
	private _peakCache;
	/** Analysis results (populated lazily by AudioAnalyzer). */
	private _analysisData;
	/** Emitted when peak data for a given resolution is added or updated. */
	readonly peakCacheUpdated: Signal<number>;
	/** Emitted when analysis data is set or replaced. */
	readonly analysisCompleted: Signal<SourceAnalysisData>;
	/** Natural timeline position in frames (where the source was originally recorded). */
	naturalPosition?: number;
	/** Detected transient positions in frames. */
	transients: number[];
	/** Cue markers mapping frame positions to names. */
	cueMarkers: Map<number, string>;
	/** Positions (in frames) where xruns / buffer underruns occurred during capture. */
	xrunPositions: number[];
	/** The track name this source was originally captured for. */
	capturedFor?: string;
	constructor(id: SourceId, name: string, url: string, duration: FrameCount, sampleRate?: number, channelCount?: number, videoMetadata?: VideoMetadata);
	/**
	 * Check if this source originated from a video file
	 */
	isVideoSource(): boolean;
	get useCount(): number;
	addUse(): void;
	removeUse(): void;
	/**
	 * Check whether a specific flag is set.
	 */
	hasFlag(flag: SourceFlags): boolean;
	/**
	 * Set a specific flag.
	 */
	setFlag(flag: SourceFlags): void;
	/**
	 * Clear a specific flag.
	 */
	clearFlag(flag: SourceFlags): void;
	/**
	 * Store peak data for a given resolution (frames per peak entry).
	 *
	 * Replaces any previously cached data at the same resolution.
	 * Emits {@link peakCacheUpdated} with the resolution key.
	 */
	setPeakData(resolution: number, data: PeakData): void;
	/**
	 * Retrieve cached peak data for a given resolution.
	 *
	 * @returns The peak data, or `undefined` if not yet computed.
	 */
	getPeakData(resolution: number): PeakData | undefined;
	/**
	 * Check whether peak data exists for a given resolution.
	 */
	hasPeakData(resolution: number): boolean;
	/**
	 * Clear all cached peak data for this source.
	 */
	clearPeakCache(): void;
	/**
	 * Set or replace analysis data for this source.
	 *
	 * This also updates the legacy {@link transients} array from the
	 * analysis results for backward compatibility.
	 * Emits {@link analysisCompleted} with the new data.
	 */
	setAnalysisData(data: SourceAnalysisData): void;
	/**
	 * Retrieve the analysis data, or `null` if no analysis has been run.
	 */
	getAnalysisData(): SourceAnalysisData | null;
	/**
	 * Release resources held by this source.
	 *
	 * Revokes the blob URL (if applicable), clears the peak cache, and
	 * disconnects all signal listeners. After disposal the source should
	 * not be used.
	 */
	dispose(): void;
}
/**
 * Range (Named Timespan)
 *
 * Timeline에서 특정 구간을 나타내는 named range입니다.
 * Export 시 사용하거나, Loop/Punch 영역으로 활용할 수 있습니다.
 */
declare class Range$1 {
	readonly id: RangeId;
	name: string;
	start: FrameCount;
	end: FrameCount;
	color?: string;
	readonly changed: Signal<void>;
	readonly removed: Signal<void>;
	constructor(id: RangeId, name: string, start: FrameCount, end: FrameCount, color?: string);
	setName(name: string): void;
	setRange(start: FrameCount, end: FrameCount): void;
	setColor(color: string): void;
	get length(): FrameCount;
	contains(frame: FrameCount): boolean;
	overlaps(other: Range$1): boolean;
	clone(): Range$1;
	toDTO(): {
		id: string;
		name: string;
		start: number;
		end: number;
		length: number;
		color: string | undefined;
	};
}
export type SendBusId = string;
/**
 * SendBus – 트랙에서 다른 버스/트랙으로 신호를 보내는 도메인 모델.
 *
 * - `preFader` 가 true 이면 Fader 이전 신호(원본 Games)를 전송합니다.
 * - `preFader` 가 false 이면 Fader 이후 신호를 전송합니다.
 */
export declare class SendBus {
	readonly id: SendBusId;
	readonly sourceTrackId: string;
	readonly destId: string;
	private _level;
	private _preFader;
	private _active;
	readonly levelChanged: Signal<number>;
	readonly preFaderChanged: Signal<boolean>;
	readonly activeChanged: Signal<boolean>;
	constructor(id: SendBusId, sourceTrackId: string, destId: string, level?: number, preFader?: boolean);
	get level(): number;
	setLevel(db: number): void;
	get preFader(): boolean;
	setPreFader(value: boolean): void;
	get active(): boolean;
	setActive(value: boolean): void;
}
export type MarkerId = string;
/**
 * Song Position Marker
 *
 * 타임라인상의 특정 위치를 표시하는 마커입니다.
 * Verse, Chorus, Bridge 등 구간 표시나 북마크 용도로 사용됩니다.
 */
export declare class Marker {
	readonly id: MarkerId;
	private _name;
	private _position;
	private _color;
	private _locked;
	readonly changed: Signal<void>;
	readonly removed: Signal<void>;
	constructor(id: MarkerId, name: string, position: FrameCount, color?: string, locked?: boolean);
	get name(): string;
	set name(value: string);
	get position(): FrameCount;
	set position(value: FrameCount);
	get color(): string;
	set color(value: string);
	get locked(): boolean;
	set locked(value: boolean);
	move(newPosition: FrameCount): void;
	clone(newId?: MarkerId): Marker;
}
export type RegionGroupId = string;
export declare class RegionGroup {
	readonly id: RegionGroupId;
	name: string;
	private _regionIds;
	readonly changed: Signal<RegionGroup>;
	constructor(id: RegionGroupId, name: string, regionIds?: string[]);
	get regionIds(): ReadonlySet<string>;
	addRegion(regionId: string): void;
	removeRegion(regionId: string): void;
	hasRegion(regionId: string): boolean;
	get size(): number;
	getRegionIds(): string[];
}
declare enum DitherType {
	NONE = "none",
	TPDF = "tpdf",// Triangular PDF - standard for audio
	SHAPED = "shaped"
}
declare enum ExportFormat {
	WAV = "wav",
	MP3 = "mp3",
	OGG = "ogg",
	FLAC = "flac",
	MIDI = "midi"
}
declare enum ExportSampleFormat {
	INT16 = "int16",
	INT24 = "int24",
	FLOAT32 = "float32"
}
export type NormalizeMode = "peak" | "lufs";
/**
 * Timespan for batch export
 */
export interface ExportTimespan {
	name: string;
	startFrame: FrameCount;
	endFrame: FrameCount;
}
/**
 * BWF (Broadcast WAV) metadata
 * EBU Tech 3285 — Broadcast Wave Format specification
 */
export interface BwfMetadata {
	description?: string;
	originator?: string;
	originatorReference?: string;
	originationDate?: string;
	originationTime?: string;
	timeReference?: number;
	codingHistory?: string;
}
/**
 * Export Configuration
 */
export declare class ExportConfig {
	readonly id: string;
	format: ExportFormat;
	sampleFormat: ExportSampleFormat;
	sampleRate: number;
	bitrate?: number;
	quality?: number;
	rangeId?: RangeId;
	startFrame: FrameCount;
	endFrame: FrameCount;
	filename: string;
	folder: string;
	filenameTemplate: string;
	presetId?: string;
	exportMasterOnly: boolean;
	trackIds: string[];
	stemExport: boolean;
	splitMono: boolean;
	ditherType: DitherType;
	normalize: boolean;
	normalizeMode: NormalizeMode;
	targetPeakDb?: number;
	targetLufs: number;
	truePeakLimit: boolean;
	truePeakCeiling: number;
	timespans: ExportTimespan[];
	silencePaddingStart: number;
	silencePaddingEnd: number;
	trimSilence: boolean;
	exportCdMarkers: boolean;
	cdMarkerFormat: "cue" | "toc" | "mp4ch";
	bwfMetadata: boolean;
	bwfData?: BwfMetadata;
	reimportAfterExport: boolean;
	readonly changed: Signal<void>;
	constructor(id?: string);
	setFormat(format: ExportFormat): void;
	setSampleFormat(sampleFormat: ExportSampleFormat): void;
	setRange(startFrame: FrameCount, endFrame: FrameCount): void;
	setRangeById(rangeId: RangeId): void;
	setFilename(filename: string): void;
	setFolder(folder: string): void;
	setFilenameTemplate(template: string): void;
	setNormalize(normalize: boolean, targetPeakDb?: number): void;
	setNormalizeMode(mode: NormalizeMode): void;
	setTargetLufs(lufs: number): void;
	setTruePeakLimit(enabled: boolean, ceiling?: number): void;
	setStemExport(stemExport: boolean): void;
	setSplitMono(splitMono: boolean): void;
	setQuality(quality: number): void;
	setDitherType(ditherType: DitherType): void;
	setExportMasterOnly(masterOnly: boolean): void;
	setTrackIds(trackIds: string[]): void;
	setTimespans(timespans: ExportTimespan[]): void;
	setSilencePadding(startFrames: number, endFrames: number): void;
	setTrimSilence(trim: boolean): void;
	setCdMarkerExport(enabled: boolean, format?: "cue" | "toc" | "mp4ch"): void;
	setBwfMetadata(enabled: boolean, data?: BwfMetadata): void;
	setPresetId(presetId: string | undefined): void;
	validate(): boolean;
	getDuration(): FrameCount;
	getFullPath(): string;
	/**
	 * Serialize to JSON for preset storage.
	 */
	toJSON(): ExportConfigSnapshot;
	/**
	 * Restore from JSON snapshot.
	 */
	static fromJSON(data: ExportConfigSnapshot): ExportConfig;
}
export interface ExportConfigSnapshot {
	id: string;
	format: ExportFormat;
	sampleFormat: ExportSampleFormat;
	sampleRate: number;
	bitrate?: number;
	quality?: number;
	rangeId?: string;
	startFrame: number;
	endFrame: number;
	filename: string;
	folder?: string;
	filenameTemplate?: string;
	presetId?: string;
	exportMasterOnly: boolean;
	trackIds: string[];
	stemExport: boolean;
	splitMono?: boolean;
	ditherType: DitherType;
	normalize: boolean;
	normalizeMode?: NormalizeMode;
	targetPeakDb?: number;
	targetLufs?: number;
	truePeakLimit?: boolean;
	truePeakCeiling?: number;
	timespans?: ExportTimespan[];
	silencePaddingStart?: number;
	silencePaddingEnd?: number;
	trimSilence?: boolean;
	exportCdMarkers?: boolean;
	cdMarkerFormat?: "cue" | "toc" | "mp4ch";
	bwfMetadata?: boolean;
	bwfData?: BwfMetadata;
	reimportAfterExport?: boolean;
}
declare enum ExportProgress {
	IDLE = "idle",
	RENDERING = "rendering",
	NORMALIZING = "normalizing",
	ENCODING = "encoding",
	COMPLETED = "completed",
	FAILED = "failed",
	ABORTED = "aborted"
}
export declare class ExportStatus {
	private _progress;
	private _running;
	private _aborted;
	private _errors;
	private _errorMessage;
	totalFrames: FrameCount;
	processedFrames: FrameCount;
	currentFilename: string;
	resultBlob?: Blob;
	resultUrl?: string;
	readonly progressChanged: Signal<ExportProgress>;
	readonly frameProcessed: Signal<number>;
	readonly finished: Signal<boolean>;
	readonly errorOccurred: Signal<string>;
	constructor();
	get progress(): ExportProgress;
	get running(): boolean;
	get aborted(): boolean;
	get errors(): boolean;
	get errorMessage(): string;
	get percentComplete(): number;
	init(totalFrames: FrameCount, filename: string): void;
	setProgress(progress: ExportProgress): void;
	updateProcessedFrames(frames: FrameCount): void;
	abort(errorOccurred?: boolean): void;
	setError(message: string): void;
	complete(blob: Blob, url: string): void;
	cleanup(): void;
}
/**
 * Grid Type
 */
export declare enum GridType {
	/** 그리드 없음 */
	NO_GRID = "no_grid",
	/** 박자 기반 */
	BEAT_1_32 = "1/32",
	BEAT_1_16 = "1/16",
	BEAT_1_8 = "1/8",
	BEAT_1_4 = "1/4",
	BEAT_1_2 = "1/2",
	BEAT_1 = "1",
	BEAT_2 = "2",
	BEAT_4 = "4",
	BEAT_8 = "8",
	/** 시간 기반 */
	TIMECODE = "timecode",
	MINSEC = "minsec",
	SAMPLES = "samples",
	/** CD 프레임 */
	CD_FRAMES = "cdframes"
}
/**
 * Snap Mode
 */
export declare enum SnapMode {
	/** Snap 비활성화 */
	NO_SNAP = "no_snap",
	/** Grid에 Snap */
	SNAP_TO_GRID = "snap_to_grid",
	/** 자석 효과 (가까우면 snap) */
	SNAP_MAGNETIC = "snap_magnetic"
}
/**
 * Grid Settings
 *
 * Timeline의 grid와 snap 동작을 관리합니다.
 */
export declare class GridSettings {
	private _gridType;
	private _snapMode;
	private _snapToGrid;
	private _bpm;
	private _timeSignatureNumerator;
	private _timeSignatureDenominator;
	readonly changed: Signal<void>;
	constructor(gridType?: GridType, snapMode?: SnapMode, bpm?: number);
	get gridType(): GridType;
	get snapMode(): SnapMode;
	get snapToGrid(): boolean;
	get bpm(): number;
	get timeSignatureNumerator(): number;
	get timeSignatureDenominator(): number;
	setGridType(gridType: GridType): void;
	setSnapMode(snapMode: SnapMode): void;
	setSnapToGrid(enabled: boolean): void;
	setBPM(bpm: number): void;
	setTimeSignature(numerator: number, denominator: number): void;
	/**
	 * Grid 간격을 frames로 계산
	 *
	 * @param sampleRate 샘플 레이트
	 * @returns Grid 간격 (frames)
	 */
	getGridIntervalFrames(sampleRate: number): FrameCount;
	/**
	 * Frame을 가장 가까운 grid에 snap
	 *
	 * @param frame 원본 frame
	 * @param sampleRate 샘플 레이트
	 * @returns Snapped frame
	 */
	snapToGridFrame(frame: FrameCount, sampleRate: number): FrameCount;
	/**
	 * Frame을 grid에 내림 (floor)
	 */
	snapToGridFloor(frame: FrameCount, sampleRate: number): FrameCount;
	/**
	 * Frame을 grid에 올림 (ceil)
	 */
	snapToGridCeil(frame: FrameCount, sampleRate: number): FrameCount;
	/**
	 * DTO 변환
	 */
	toDTO(): {
		gridType: GridType;
		snapMode: SnapMode;
		snapToGrid: boolean;
		bpm: number;
		timeSignature: string;
	};
}
export interface MixerSceneTrackState {
	trackId: string;
	volume: number;
	pan: number;
	mute: boolean;
	solo: boolean;
	/** Map of processorId -> { paramId -> value } */
	pluginParameters: Record<string, Record<string, number>>;
}
export interface MixerSceneSnapshot {
	id: string;
	name: string;
	createdAt: number;
	tracks: MixerSceneTrackState[];
}
/**
 * Captures all track volumes, pans, mutes, solos, and plugin parameters
 * at a point in time so they can be recalled later.
 */
export declare class MixerScene {
	readonly id: string;
	name: string;
	readonly createdAt: number;
	readonly tracks: MixerSceneTrackState[];
	constructor(id: string, name: string, tracks: MixerSceneTrackState[], createdAt?: number);
	toJSON(): MixerSceneSnapshot;
	static fromJSON(data: MixerSceneSnapshot): MixerScene;
}
declare class MixerSceneManager {
	private _scenes;
	readonly sceneAdded: Signal<MixerScene>;
	readonly sceneRemoved: Signal<string>;
	readonly sceneRecalled: Signal<string>;
	/**
	 * Capture the current mixer state from the session and save as a scene.
	 */
	saveScene(name: string, session: Session): string;
	/**
	 * Recall (restore) a saved mixer scene, applying volumes/pans/mutes/solos/plugin params.
	 */
	recallScene(sceneId: string, session: Session): boolean;
	/**
	 * Delete a scene by ID.
	 */
	deleteScene(sceneId: string): boolean;
	/**
	 * Get all saved scenes.
	 */
	get scenes(): ReadonlyArray<MixerScene>;
	/**
	 * Get a specific scene.
	 */
	getScene(sceneId: string): MixerScene | undefined;
	toJSON(): MixerSceneSnapshot[];
	loadFromJSON(snapshots: MixerSceneSnapshot[]): void;
}
/**
 * Track Group
 *
 * Groups multiple tracks so they share linked controls (gain, mute, solo, etc.).
 */
export declare class TrackGroup {
	readonly id: string;
	name: string;
	private _memberTrackIds;
	gainLinked: boolean;
	muteLinked: boolean;
	soloLinked: boolean;
	colorLinked: boolean;
	/** When true, selecting a region on one member track auto-selects equivalent regions on siblings. */
	regionSelectLinked: boolean;
	readonly memberAdded: Signal<string>;
	readonly memberRemoved: Signal<string>;
	readonly changed: Signal<void>;
	constructor(id: string, name: string);
	addMember(trackId: TrackId): void;
	removeMember(trackId: TrackId): void;
	hasMember(trackId: TrackId): boolean;
	get memberTrackIds(): ReadonlyArray<TrackId>;
	get size(): number;
	setLinked(property: "gain" | "mute" | "solo" | "color" | "regionSelect", linked: boolean): void;
	toJSON(): TrackGroupSnapshot;
	static fromJSON(data: TrackGroupSnapshot): TrackGroup;
}
export interface TrackGroupSnapshot {
	id: string;
	name: string;
	memberTrackIds: string[];
	gainLinked: boolean;
	muteLinked: boolean;
	soloLinked: boolean;
	colorLinked: boolean;
	regionSelectLinked?: boolean;
}
/**
 * CD Marker for Red Book-compliant CD mastering
 */
export declare class CDMarker {
	readonly id: string;
	index: number;
	title: string;
	performer: string;
	isrc: string;
	position: FrameCount;
	readonly changed: Signal<CDMarker>;
	readonly removed: Signal<void>;
	constructor(id: string, index: number, title: string, position: FrameCount, performer?: string, isrc?: string);
	setTitle(title: string): void;
	setPosition(position: FrameCount): void;
	setPerformer(performer: string): void;
	setISRC(isrc: string): void;
	toJSON(): CDMarkerSnapshot;
	static fromJSON(data: CDMarkerSnapshot): CDMarker;
}
export interface CDMarkerSnapshot {
	id: string;
	index: number;
	title: string;
	performer: string;
	isrc: string;
	position: number;
}
/**
 * VCA (Voltage Controlled Amplifier) Track
 * Virtual fader that controls multiple assigned tracks.
 * Adjusting the VCA fader changes gain on all slave tracks
 * while maintaining their relative volume differences.
 *
 * VCA master logic includes:
 * - Proportional gain application to slave tracks
 * - Mute/solo propagation to slave tracks
 * - Automation enable/disable
 */
export declare class VCATrack {
	readonly id: string;
	name: string;
	private _gain;
	private _slaveTrackIds;
	private _muted;
	private _soloed;
	private _automationEnabled;
	readonly gainChanged: Signal<number>;
	readonly slaveAdded: Signal<string>;
	readonly slaveRemoved: Signal<string>;
	readonly muteChanged: Signal<boolean>;
	readonly soloChanged: Signal<boolean>;
	constructor(id: string, name: string);
	get gain(): number;
	/**
	 * Set VCA gain.
	 * Returns the gain delta that should be applied to slave tracks.
	 */
	setGain(gain: number): number;
	/**
	 * Set VCA gain in dB.
	 */
	setGainDb(db: number): number;
	/**
	 * Get current gain in dB.
	 */
	getGainDb(): number;
	addSlave(trackId: TrackId): void;
	removeSlave(trackId: TrackId): void;
	hasSlave(trackId: TrackId): boolean;
	get slaveTrackIds(): ReadonlyArray<TrackId>;
	get slaveCount(): number;
	/**
	 * Apply the current VCA gain as a delta to all slave tracks.
	 *
	 * Each slave track's fader volume is multiplied by the VCA's current
	 * linear gain. This preserves relative volume differences between
	 * slave tracks while allowing group-level control.
	 *
	 * @param getTrack Function to look up a Track by its ID.
	 * @returns Map of trackId -> the gain delta that was applied.
	 */
	applyGainToSlaves(getTrack: (id: TrackId) => Track | undefined): Map<TrackId, number>;
	/**
	 * Set the VCA mute state.
	 * When a VCA is muted, all slave tracks are considered muted
	 * regardless of their individual mute state.
	 */
	setMuted(muted: boolean): void;
	get muted(): boolean;
	/**
	 * Set the VCA solo state.
	 * When a VCA is soloed, all slave tracks are treated as soloed.
	 */
	setSoloed(soloed: boolean): void;
	get soloed(): boolean;
	/**
	 * Check if a slave should be audible considering VCA state.
	 *
	 * A slave is NOT audible if:
	 * - The VCA is muted (overrides individual track state)
	 * - The slave is not actually assigned to this VCA
	 *
	 * A slave IS audible if:
	 * - The VCA is not muted, or
	 * - The VCA is soloed (solo overrides mute for slaves)
	 *
	 * @param trackId The slave track ID to check.
	 * @returns true if the slave should produce audio.
	 */
	isSlaveAudible(trackId: TrackId): boolean;
	/**
	 * Remove all slave tracks from this VCA.
	 */
	clearSlaves(): void;
	/**
	 * Enable or disable automation playback for this VCA.
	 * When enabled, the VCA gain may be driven by an automation lane.
	 */
	setAutomationEnabled(enabled: boolean): void;
	get automationEnabled(): boolean;
	toJSON(): VCATrackSnapshot;
	static fromJSON(data: VCATrackSnapshot): VCATrack;
}
export interface VCATrackSnapshot {
	id: string;
	name: string;
	gain: number;
	slaveTrackIds: string[];
	muted?: boolean;
	soloed?: boolean;
	automationEnabled?: boolean;
}
declare enum TransportMode {
	NORMAL = "normal",
	SCRUB = "scrub",
	SHUTTLE = "shuttle"
}
declare class ScrubState {
	mode: TransportMode;
	shuttleSpeed: number;
	scrubPosition: number;
	setScrubMode(): void;
	setShuttleMode(speed: number): void;
	setNormalMode(): void;
	isActive(): boolean;
	updateScrubPosition(positionSeconds: number): void;
}
/**
 * The motion state of the transport.
 */
export declare enum MotionState {
	/** Transport is stopped; playhead is stationary. */
	STOPPED = "STOPPED",
	/** Transport is rolling (playing forward or backward). */
	ROLLING = "ROLLING",
	/** Rolling -> Stopped transition: declick ramp-down in progress. */
	DECLICK_TO_STOP = "DECLICK_TO_STOP",
	/** Rolling -> Locate transition: declick ramp-down before relocating. */
	DECLICK_TO_LOCATE = "DECLICK_TO_LOCATE",
	/** Waiting for the locate operation to complete after declick. */
	WAITING_FOR_LOCATE = "WAITING_FOR_LOCATE"
}
declare enum DirectionState {
	/** Normal forward playback. */
	FORWARDS = "FORWARDS",
	/** Reverse playback (negative speed). */
	BACKWARDS = "BACKWARDS",
	/** Transitioning between directions (during declick). */
	REVERSING = "REVERSING"
}
export interface StartTransportEvent {
	type: "StartTransport";
}
export interface StopTransportEvent {
	type: "StopTransport";
}
export interface LocateEvent {
	type: "Locate";
	/** Target frame to locate to. */
	target: FrameCount;
	/** Whether to resume rolling after the locate completes. */
	rollAfterLocate: boolean;
}
export interface DeclickDoneEvent {
	type: "DeclickDone";
}
export interface SetSpeedEvent {
	type: "SetSpeed";
	/** Desired playback speed. Negative values = reverse. */
	speed: number;
}
export interface LocateCompleteEvent {
	type: "LocateComplete";
}
/**
 * Union of all transport events the FSM can process.
 */
export type TransportEvent = StartTransportEvent | StopTransportEvent | LocateEvent | DeclickDoneEvent | SetSpeedEvent | LocateCompleteEvent;
export declare class TransportFSM {
	private _motionState;
	private _directionState;
	private _speed;
	/**
	 * Frame to locate to when a Locate event is being processed through declick.
	 * Only valid when motionState is DECLICK_TO_LOCATE or WAITING_FOR_LOCATE.
	 */
	private _pendingLocateTarget;
	/**
	 * Whether the transport should resume rolling after a pending locate completes.
	 */
	private _rollAfterLocate;
	/**
	 * Speed to apply after a direction-reversal declick completes.
	 * Only valid when _directionState is REVERSING.
	 */
	private _pendingSpeed;
	/**
	 * Events that arrive during a declick phase. They are stored and
	 * replayed (in order) once the declick completes.
	 */
	private _deferredEvents;
	/**
	 * Emitted whenever the motion state changes.
	 * Payload is the new MotionState.
	 */
	readonly stateChanged: Signal<MotionState>;
	/**
	 * Emitted when the FSM determines a locate operation should be performed.
	 * The audio engine should reposition the playhead to the given frame.
	 */
	readonly locateRequested: Signal<number>;
	/**
	 * Emitted when the playback speed changes.
	 * Payload is the new speed value (can be negative for reverse).
	 */
	readonly speedChanged: Signal<number>;
	/**
	 * Emitted when the direction changes.
	 * Payload is the new DirectionState.
	 */
	readonly directionChanged: Signal<DirectionState>;
	/** Current motion state of the transport. */
	get motionState(): MotionState;
	/** Current direction state of the transport. */
	get directionState(): DirectionState;
	/**
	 * Current playback speed.
	 * Positive = forward, negative = reverse.
	 * Range: -8.0 to +8.0 (absolute minimum 0.0625).
	 * Default: 1.0.
	 */
	get speed(): number;
	/** Whether the transport is currently rolling (playing). */
	isRolling(): boolean;
	/** Whether the transport is fully stopped. */
	isStopped(): boolean;
	/** Whether the transport is in a declick transition. */
	isDeclicking(): boolean;
	/** Whether the transport is waiting for a locate to complete. */
	isWaitingForLocate(): boolean;
	/**
	 * Enqueue a transport event for processing.
	 *
	 * If the FSM is in a declick state, events are deferred and replayed
	 * after the declick completes. Otherwise, events are processed immediately.
	 */
	enqueue(event: TransportEvent): void;
	/**
	 * Process a single transport event based on the current state.
	 * Implements the full state transition logic.
	 */
	processEvent(event: TransportEvent): void;
	/**
	 * Set the playback speed.
	 *
	 * - Clamps to [-MAX_SPEED, +MAX_SPEED] range.
	 * - Absolute values below MIN_SPEED are snapped to zero (effectively stop).
	 * - If the sign changes while rolling, a declick + direction reversal is initiated.
	 *
	 * @param newSpeed The desired playback speed.
	 */
	setSpeed(newSpeed: number): void;
	/**
	 * Get the current playback speed.
	 */
	getSpeed(): number;
	private handleStartTransport;
	private handleStopTransport;
	private handleLocate;
	private handleDeclickDone;
	private handleSetSpeed;
	private handleLocateComplete;
	/**
	 * Transition to a new motion state and emit the stateChanged signal.
	 */
	private setMotionState;
	/**
	 * Apply a speed value, updating direction state and emitting signals.
	 */
	private applySpeed;
	/**
	 * Clamp a speed value to the valid range.
	 * Absolute values below MIN_SPEED are snapped to zero.
	 * Absolute values above MAX_SPEED are clamped.
	 */
	private clampSpeed;
	/**
	 * Process all deferred events that accumulated during a declick phase.
	 * Events are processed in FIFO order.
	 */
	private processDeferredEvents;
}
/**
 * Sidechain Configuration
 *
 * Routes audio from a source track into a plugin's sidechain input.
 * Commonly used for ducking (e.g., compressor sidechained to a kick drum).
 */
export declare class SidechainConfig {
	readonly id: string;
	readonly targetTrackId: TrackId;
	readonly targetProcessorId: string;
	private _sourceTrackId;
	enabled: boolean;
	/** Whether a high-pass filter is applied to the sidechain signal. */
	private _sidechainFilterEnabled;
	/** HPF cutoff frequency in Hz (20 - 500 Hz, default 80). */
	private _sidechainFilterFrequency;
	readonly sourceChanged: Signal<string | null>;
	readonly enabledChanged: Signal<boolean>;
	readonly filterChanged: Signal<{
		enabled: boolean;
		frequency: number;
	}>;
	constructor(id: string, targetTrackId: TrackId, targetProcessorId: string);
	get sourceTrackId(): TrackId | null;
	setSource(trackId: TrackId | null): void;
	setEnabled(enabled: boolean): void;
	get sidechainFilterEnabled(): boolean;
	get sidechainFilterFrequency(): number;
	setSidechainFilter(enabled: boolean, frequency?: number): void;
	toJSON(): SidechainConfigSnapshot;
	static fromJSON(data: SidechainConfigSnapshot): SidechainConfig;
}
export interface SidechainConfigSnapshot {
	id: string;
	targetTrackId: string;
	targetProcessorId: string;
	sourceTrackId: string | null;
	enabled: boolean;
	sidechainFilterEnabled: boolean;
	sidechainFilterFrequency: number;
}
declare class Take {
	readonly id: string;
	readonly takeNumber: number;
	readonly regionId: RegionId;
	readonly trackId: TrackId;
	readonly startFrame: FrameCount;
	readonly endFrame: FrameCount;
	selected: boolean;
	readonly timestamp: number;
	readonly selectionChanged: Signal<boolean>;
	constructor(id: string, takeNumber: number, regionId: RegionId, trackId: TrackId, startFrame: FrameCount, endFrame: FrameCount);
	get duration(): FrameCount;
	setSelected(selected: boolean): void;
	toJSON(): TakeSnapshot;
	static fromJSON(data: TakeSnapshot): Take;
}
export interface TakeSnapshot {
	id: string;
	takeNumber: number;
	regionId: string;
	trackId: string;
	startFrame: number;
	endFrame: number;
	selected: boolean;
	timestamp: number;
}
declare class TakeLane {
	readonly id: string;
	readonly trackId: TrackId;
	private _takes;
	readonly takeAdded: Signal<Take>;
	readonly takeRemoved: Signal<string>;
	readonly activeChanged: Signal<Take | null>;
	constructor(id: string, trackId: TrackId);
	addTake(take: Take): void;
	removeTake(takeId: string): void;
	getTake(takeId: string): Take | undefined;
	get takes(): ReadonlyArray<Take>;
	get takeCount(): number;
	/**
	 * Select a specific take (deselects all others).
	 */
	selectTake(takeId: string): void;
	/**
	 * Get the currently selected (active) take.
	 */
	getActiveTake(): Take | undefined;
	/**
	 * Comp: merge selected portions from multiple takes into one.
	 * Returns the regionIds of selected takes.
	 */
	getSelectedTakeRegionIds(): RegionId[];
}
export declare class Session {
	readonly id: string;
	name: string;
	sampleRate: SampleRate;
	tempo: number;
	timeSignature: [
		number,
		number
	];
	timecodeFps: number;
	transportFrame: FrameCount;
	recordingStartFrame: FrameCount;
	/**
	 * Transport Finite State Machine.
	 * Manages transport motion state (stopped/rolling/declick), direction,
	 * and variable-speed playback. See TransportFSM.ts for full documentation.
	 */
	readonly transportFSM: TransportFSM;
	/**
	 * Backwards-compatible `isPlaying` accessor.
	 * Delegates to `transportFSM.isRolling()` for reads.
	 * Writing `true` enqueues a StartTransport event;
	 * writing `false` triggers an immediate stop (for legacy callers
	 * like AudioEngine.pause that bypass the FSM lifecycle).
	 */
	private _isPlaying;
	get isPlaying(): boolean;
	set isPlaying(value: boolean);
	loopRangeId?: RangeId;
	loopEnabled: boolean;
	punchRangeId?: RangeId;
	punchEnabled: boolean;
	loopRecordingEnabled: boolean;
	loopRecordingTakeCount: number;
	preRollBars: number;
	rippleEdit: boolean;
	private _tracks;
	private _ranges;
	private _sendBuses;
	private _markers;
	private _markerChangeSubscriptions;
	private _regionGroups;
	readonly masterBus: Route;
	private _selectedRegionIds;
	readonly selectionChanged: Signal<Set<string>>;
	/** When true, selecting a region auto-selects its group members. */
	groupSelectEnabled: boolean;
	/** Reverse index: RegionId → RegionGroupId for O(1) lookup. */
	private _regionToGroupIndex;
	readonly trackAdded: Signal<Track>;
	readonly trackRemoved: Signal<string>;
	readonly rangeAdded: Signal<Range$1>;
	readonly rangeRemoved: Signal<string>;
	readonly loopRangeChanged: Signal<string | undefined>;
	readonly loopEnabledChanged: Signal<boolean>;
	readonly punchRangeChanged: Signal<string | undefined>;
	readonly punchEnabledChanged: Signal<boolean>;
	readonly playingChanged: Signal<boolean>;
	readonly recordingChanged: Signal<boolean>;
	readonly loopRecordingChanged: Signal<boolean>;
	readonly preRollChanged: Signal<number>;
	readonly metronomeChanged: Signal<boolean>;
	readonly metronomeVolumeChanged: Signal<number>;
	readonly transportPositionChanged: Signal<number>;
	readonly tempoChanged: Signal<number>;
	readonly timeSignatureChanged: Signal<[
		number,
		number
	]>;
	readonly sendBusAdded: Signal<SendBus>;
	readonly sendBusRemoved: Signal<string>;
	readonly markerAdded: Signal<Marker>;
	readonly markerRemoved: Signal<string>;
	readonly markerChanged: Signal<Marker>;
	readonly trackReordered: Signal<{
		trackId: TrackId;
		newIndex: number;
	}>;
	readonly rippleEditChanged: Signal<boolean>;
	readonly regionGroupAdded: Signal<RegionGroup>;
	readonly regionGroupRemoved: Signal<string>;
	isRecording: boolean;
	metronomeEnabled: boolean;
	metronomeVolume: number;
	readonly gridSettings: GridSettings;
	readonly tempoMap: TempoMap;
	readonly mixerSceneManager: MixerSceneManager;
	private _trackGroups;
	readonly trackGroupAdded: Signal<TrackGroup>;
	readonly trackGroupRemoved: Signal<string>;
	private _cdMarkers;
	readonly cdMarkerAdded: Signal<CDMarker>;
	readonly cdMarkerRemoved: Signal<string>;
	private _vcaTracks;
	readonly vcaTrackAdded: Signal<VCATrack>;
	readonly vcaTrackRemoved: Signal<string>;
	readonly scrubState: ScrubState;
	private _sidechainConfigs;
	private _sidechainSubscriptions;
	readonly sidechainConfigChanged: Signal<void>;
	/**
	 * Emitted after {@link computeLatencyCompensation} recalculates the
	 * per-route compensation delays for the session.
	 */
	readonly latencyCompensationChanged: Signal<void>;
	/** Disposers for per-route latencyChanged subscriptions. */
	private _routeLatencySubs;
	private _takeLanes;
	private _linkingService;
	constructor(name: string, id?: string, sampleRate?: SampleRate);
	addTrack(name: string, type?: TrackType, id?: TrackId): Track;
	addAuxTrack(name: string, id?: TrackId): Track;
	addBusTrack(name: string, id?: TrackId): Track;
	removeTrack(id: TrackId): void;
	getTrack(id: TrackId): Track | undefined;
	get tracks(): ReadonlyArray<Track>;
	addRange(name: string, start: FrameCount, end: FrameCount, id?: RangeId, color?: string): Range$1;
	removeRange(id: RangeId): void;
	getRange(id: RangeId): Range$1 | undefined;
	getRangeByName(name: string): Range$1 | undefined;
	get ranges(): ReadonlyArray<Range$1>;
	setLoopRange(rangeId: RangeId): void;
	clearLoopRange(): void;
	getLoopRange(): Range$1 | undefined;
	setLoopEnabled(enabled: boolean): void;
	toggleLoop(): void;
	setPunchRange(rangeId: RangeId): void;
	clearPunchRange(): void;
	getPunchRange(): Range$1 | undefined;
	setPunchEnabled(enabled: boolean): void;
	setLoopRecording(enabled: boolean): void;
	incrementTakeCount(): number;
	setPreRollBars(bars: number): void;
	/**
	 * Calculate pre-roll duration in seconds based on current tempo and time signature.
	 */
	getPreRollDurationSeconds(): number;
	/**
	 * Calculate pre-roll duration in frames.
	 */
	getPreRollDurationFrames(): FrameCount;
	setTempo(bpm: number): void;
	setTimeSignature(numerator: number, denominator: number): void;
	startTransport(): void;
	stopTransport(): void;
	/** AudioProvider가 실제 정지를 끝낸 뒤 transport 전환을 완료한다. */
	completeTransportStop(): void;
	locateTransport(frame: FrameCount): void;
	/**
	 * Locate via the FSM with proper declick handling.
	 * Use this when you want declick-aware relocation (e.g. from the timeline ruler).
	 *
	 * @param frame Target frame position.
	 * @param rollAfterLocate Whether to resume playback after the locate completes.
	 */
	locateTransportViaFSM(frame: FrameCount, rollAfterLocate?: boolean): void;
	/**
	 * Get the current playback speed from the transport FSM.
	 * Positive = forward, negative = reverse.
	 * Range: -8.0 to +8.0 (absolute minimum 0.0625 when non-zero).
	 */
	getSpeed(): number;
	/**
	 * Set the playback speed via the transport FSM.
	 * If the sign changes while rolling, the FSM will handle
	 * the declick and direction reversal automatically.
	 *
	 * @param speed Desired speed. Negative = reverse. Range: -8.0 to +8.0.
	 */
	setSpeed(speed: number): void;
	startRecording(): void;
	stopRecording(): void;
	toggleMetronome(): void;
	setMetronomeVolume(volume: number): void;
	private _sources;
	readonly sourceAdded: Signal<Source>;
	addSource(source: Source): void;
	removeSource(id: SourceId): void;
	getSource(id: SourceId): Source | undefined;
	get sources(): ReadonlyMap<SourceId, Source>;
	getIO(id: string): IO | undefined;
	private _exportConfig?;
	private _exportStatus?;
	getExportConfig(): ExportConfig;
	getExportStatus(): ExportStatus;
	getSessionDuration(): FrameCount;
	selectRegion(regionId: string, addToSelection?: boolean): void;
	selectRegions(regionIds: string[], addToSelection?: boolean): void;
	deselectRegion(regionId: string): void;
	clearSelection(): void;
	getSelectedRegionIds(): ReadonlySet<string>;
	isRegionSelected(regionId: string): boolean;
	/**
	 * Find the track that owns a region. Returns undefined if not found.
	 */
	findTrackForRegion(regionId: string): Track | undefined;
	/**
	 * Expand a set of region IDs by including group members.
	 *
	 * Tier 1 — Explicit: regions in the same RegionGroup.
	 * Tier 2 — Implicit: equivalent regions on sibling tracks in the same
	 *          TrackGroup (when regionSelectLinked is enabled).
	 */
	private expandSelection;
	addSendBus(sourceTrackId: TrackId, destId: string, level?: number, preFader?: boolean, id?: SendBusId): SendBus;
	removeSendBus(sendBusId: SendBusId): void;
	getSendBus(sendBusId: SendBusId): SendBus | undefined;
	getSendBusesForTrack(sourceTrackId: TrackId): ReadonlyArray<SendBus>;
	get sendBuses(): ReadonlyArray<SendBus>;
	addMarker(name: string, position: FrameCount, color?: string, id?: MarkerId): Marker;
	removeMarker(markerId: MarkerId): void;
	private registerMarker;
	getMarker(markerId: MarkerId): Marker | undefined;
	get markers(): ReadonlyArray<Marker>;
	/**
	 * Find the next marker after the given position.
	 */
	getNextMarker(position: FrameCount): Marker | undefined;
	/**
	 * Find the previous marker before the given position.
	 */
	getPreviousMarker(position: FrameCount): Marker | undefined;
	reorderTrack(trackId: TrackId, newIndex: number): void;
	getTrackIndex(trackId: TrackId): number;
	setRippleEdit(enabled: boolean): void;
	groupRegions(regionIds: string[], name?: string, id?: RegionGroupId): string;
	ungroupRegions(groupId: RegionGroupId): void;
	getRegionGroup(groupId: RegionGroupId): RegionGroup | undefined;
	getRegionGroupForRegion(regionId: string): RegionGroup | undefined;
	get regionGroups(): ReadonlyArray<RegionGroup>;
	addTrackGroup(name: string, id?: string): TrackGroup;
	removeTrackGroup(groupId: string): void;
	getTrackGroup(groupId: string): TrackGroup | undefined;
	getTrackGroupForTrack(trackId: TrackId): TrackGroup | undefined;
	get trackGroups(): ReadonlyArray<TrackGroup>;
	getChildTracks(parentId: TrackId): ReadonlyArray<Track>;
	setTrackParent(trackId: TrackId, parentId: TrackId | null): void;
	addVCATrack(name: string, id?: string): VCATrack;
	removeVCATrack(vcaId: string): void;
	getVCATrack(vcaId: string): VCATrack | undefined;
	get vcaTracks(): ReadonlyArray<VCATrack>;
	addSidechainConfig(targetTrackId: TrackId, targetProcessorId: string, id?: string): SidechainConfig;
	removeSidechainConfig(configId: string): void;
	getSidechainConfig(configId: string): SidechainConfig | undefined;
	getSidechainConfigsForTrack(trackId: TrackId): ReadonlyArray<SidechainConfig>;
	get sidechainConfigs(): ReadonlyArray<SidechainConfig>;
	private registerSidechainConfig;
	/**
	 * Recompute per-route latency compensation for the entire session.
	 *
	 * Finds the maximum processor latency across every track route and the
	 * master bus, then calls {@link Route.computeLatencyCompensation} on
	 * each route so that they all align to the slowest path.
	 *
	 * This is automatically invoked when any route emits `latencyChanged`,
	 * but can also be called manually after bulk route / processor changes.
	 */
	computeLatencyCompensation(): void;
	/**
	 * Subscribe to a route's {@link Route.latencyChanged} signal so that
	 * global compensation is recalculated automatically.
	 */
	private _subscribeToRouteLatency;
	/**
	 * Unsubscribe from a route's latency-changed signal.
	 */
	private _unsubscribeFromRouteLatency;
	/**
	 * Collect every Route in the session (track routes + master bus).
	 */
	private _getAllRoutes;
	addTakeLane(trackId: TrackId, id?: string): TakeLane;
	removeTakeLane(laneId: string): void;
	getTakeLane(laneId: string): TakeLane | undefined;
	getTakeLanesForTrack(trackId: TrackId): ReadonlyArray<TakeLane>;
	addCDMarker(index: number, title: string, position: FrameCount, performer?: string, isrc?: string, id?: string): CDMarker;
	removeCDMarker(markerId: string): void;
	getCDMarker(markerId: string): CDMarker | undefined;
	get cdMarkers(): ReadonlyArray<CDMarker>;
	/**
	 * 세션 전체 상태를 JSON-직렬화 가능한 객체로 변환합니다.
	 */
	toJSON(): SessionSnapshot;
	/**
	 * JSON 스냅샷으로부터 Session을 복원합니다.
	 * 트랙, 리전, Range, SendBus를 복원하지만 Signal 연결(AudioEngine)은 별도로 처리해야 합니다.
	 */
	static fromJSON(snapshot: SessionSnapshot): Session;
}
export interface RegionSnapshot {
	id: string;
	sourceId: string;
	name: string;
	start: number;
	length: number;
	sourceStart: number;
	gain: number;
	muted: boolean;
	layer: number;
	opaque?: boolean;
	fadeIn: number;
	fadeOut: number;
	playbackRate: number;
	timeDomain: number;
	locked?: boolean;
}
export interface TrackSnapshot {
	id: string;
	name: string;
	type: string;
	armed: boolean;
	mute: boolean;
	solo: boolean;
	color?: string;
	soloIsolate?: boolean;
	soloSafe?: boolean;
	monitorMode?: string;
	trimGain?: number;
	comment?: string;
	recordMode?: RecordMode;
	regions: RegionSnapshot[];
	midiRegions?: MidiRegionSnapshot[];
}
export interface RangeSnapshot {
	id: string;
	name: string;
	start: number;
	end: number;
}
export interface SendBusSnapshot {
	id: string;
	sourceTrackId: string;
	destId: string;
	level: number;
	preFader: boolean;
	active: boolean;
}
export interface MarkerSnapshot {
	id: string;
	name: string;
	position: number;
	color: string;
	locked: boolean;
}
export interface SessionSnapshot {
	id: string;
	name: string;
	sampleRate: number;
	tempo: number;
	timeSignature: [
		number,
		number
	];
	transportFrame: number;
	tracks: TrackSnapshot[];
	ranges: RangeSnapshot[];
	sendBuses: SendBusSnapshot[];
	markers?: MarkerSnapshot[];
	loopRangeId?: string;
	loopEnabled: boolean;
	punchRangeId?: string;
	punchEnabled?: boolean;
	preRollBars?: number;
	loopRecordingEnabled?: boolean;
	rippleEdit?: boolean;
	regionGroups?: RegionGroupSnapshot[];
	tempoMapEvents?: TempoEventSnapshot[];
	mixerScenes?: MixerSceneSnapshot[];
	trackGroups2?: TrackGroupSnapshot[];
	cdMarkers?: CDMarkerSnapshot[];
	vcaTracks?: VCATrackSnapshot[];
	sidechainConfigs?: SidechainConfigSnapshot[];
	takeLanes?: TakeLaneSnapshot[];
}
export interface TempoEventSnapshot {
	frame: number;
	bpm: number;
	timeSigNum?: number;
	timeSigDen?: number;
}
export interface RegionGroupSnapshot {
	id: string;
	name: string;
	regionIds: string[];
}
export interface TakeLaneSnapshot {
	id: string;
	trackId: string;
	takes: TakeSnapshot[];
}
/**
 * Mouse Mode
 *
 * 에디터의 마우스 동작 모드를 결정합니다.
 */
export declare enum MouseMode {
	/** 리전 선택/이동 (기본) */
	OBJECT = "object",
	/** 시간 범위 선택 */
	RANGE = "range",
	/** 리전 분할 */
	CUT = "cut",
	/** MIDI 노트 그리기 */
	DRAW = "draw",
	/** 리전 내부 편집 (오토메이션 포인트 등) */
	CONTENT = "content",
	/** 리전 시청 (클릭하면 재생) */
	AUDITION = "audition",
	/** 리전 타임 스트레치 */
	STRETCH = "stretch",
	/** 리전 내부 편집 (노트/오토메이션) */
	INTERNAL_EDIT = "internal_edit"
}
/**
 * Edit Mode
 *
 * 리전 이동/삭제 시 주변 리전의 반응을 결정합니다.
 */
export declare enum EditMode {
	/** 자유 이동 (겹침 허용) */
	SLIDE = "slide",
	/** 이동/삭제 시 뒤 리전 자동 밀림 */
	RIPPLE = "ripple",
	/** 리전 위치 잠금 (이동 불가) */
	LOCK = "lock"
}
/**
 * Zoom Focus
 *
 * 줌 시 기준점을 결정합니다.
 */
export declare enum ZoomFocus {
	/** 뷰포트 왼쪽 기준 */
	LEFT = "left",
	/** 뷰포트 오른쪽 기준 */
	RIGHT = "right",
	/** 뷰포트 중앙 기준 */
	CENTER = "center",
	/** 플레이헤드 기준 */
	PLAYHEAD = "playhead",
	/** 마우스 위치 기준 (현재 구현) */
	MOUSE = "mouse",
	/** 편집 커서 기준 */
	EDIT_POINT = "edit_point"
}
/**
 * Ruler Type - which rulers are visible in the timeline
 */
export declare enum RulerType {
	/** Bar|Beat ruler (기본, 현재 구현) */
	BBT = "bbt",
	/** HH:MM:SS:FF timecode */
	TIMECODE = "timecode",
	/** Minutes:Seconds */
	MINSEC = "minsec",
	/** Sample count */
	SAMPLES = "samples",
	/** Marker ruler (마커 전용 행) */
	MARKERS = "markers",
	/** Loop/Punch range display */
	RANGES = "ranges",
	/** Tempo changes */
	TEMPO = "tempo"
}
/**
 * Clock Display Mode
 */
export declare enum ClockMode {
	/** HH:MM:SS.mmm */
	MINSEC = "minsec",
	/** BBB|BB|TTTT (Bars|Beats|Ticks) */
	BBT = "bbt",
	/** HH:MM:SS:FF (Timecode frames) */
	TIMECODE = "timecode",
	/** Raw sample count */
	SAMPLES = "samples"
}
/**
 * Format frame count based on clock mode
 */
export declare function formatClock(frame: number, sampleRate: number, mode: ClockMode, bpm?: number, timeSigNum?: number): string;
/**
 * Region Clipboard Data
 *
 * Copy된 Region의 정보를 저장합니다.
 */
export interface ClipboardRegionData {
	sourceId: SourceId;
	start: FrameCount;
	length: FrameCount;
	originalTrackId: TrackId;
	name: string;
}
/**
 * Region Clipboard
 *
 * Region copy/paste 기능을 위한 클립보드입니다.
 * Singleton 패턴으로 구현됩니다.
 */
export declare class RegionClipboard {
	private static instance;
	private _clipboardData;
	private _pasteCount;
	private constructor();
	static getInstance(): RegionClipboard;
	/**
	 * Region을 클립보드에 복사
	 */
	copy(regions: Region[], trackIds: TrackId[]): void;
	/**
	 * 클립보드에서 Region 데이터 가져오기
	 */
	getClipboardData(): ReadonlyArray<ClipboardRegionData>;
	/**
	 * 클립보드가 비어있는지 확인
	 */
	isEmpty(): boolean;
	/**
	 * 클립보드 비우기
	 */
	clear(): void;
	/**
	 * Paste count for offset tracking.
	 */
	get pasteCount(): number;
	incrementPasteCount(): void;
	/**
	 * Reset paste count.
	 * Called on undo/redo.
	 */
	resetPasteCount(): void;
}
/**
 * CrossfadeEngine
 *
 * Automatically calculates and applies equal-power crossfades
 * when audio regions overlap on the same track playlist.
 */
export type CrossfadeCurveType = "equal-power" | "linear" | "s-curve";
export declare class CrossfadeEngine {
	/**
	 * The crossfade curve type used for automatic crossfade calculations.
	 * - 'equal-power' (default): constant power crossfade, smooth loudness transition
	 * - 'linear': simple linear gain ramp
	 * - 's-curve': slow start/end with fast middle transition
	 */
	static curveType: CrossfadeCurveType;
	/**
	 * Sets the crossfade curve type for all subsequent crossfade calculations.
	 */
	static setCurveType(type: CrossfadeCurveType): void;
	/**
	 * Re-calculates fades for a given list of regions.
	 * Assumes regions are passed sorted by start time.
	 */
	static calculateCrossfades(regions: Region[], _curveType?: CrossfadeCurveType): void;
}
/**
 * Collects multiple disposable subscriptions and disposes them all at once.
 *
 * Typical usage with Signal:
 * ```ts
 * const group = new DisposableGroup();
 * group.add(track.muteChanged.connect(() => { ... }));
 * group.add(track.soloChanged.connect(() => { ... }));
 *
 * // Later, when the owner is torn down:
 * group.dispose();
 * ```
 */
interface Disposable$1 {
	dispose: () => void;
}
export declare class DisposableGroup implements Disposable$1 {
	private _disposables;
	private _disposed;
	/** Number of active subscriptions. */
	get size(): number;
	/** Whether this group has already been disposed. */
	get disposed(): boolean;
	/**
	 * Add a disposable to the group.
	 * If the group is already disposed, the disposable is immediately disposed.
	 */
	add(disposable: Disposable$1): void;
	/**
	 * Dispose all collected subscriptions and prevent further additions.
	 * Safe to call multiple times.
	 */
	dispose(): void;
}
/**
 * TrackGroupLinkingService
 *
 * Subscribes to track signals (mute, solo, gain, color) and propagates
 * changes to sibling tracks in the same TrackGroup when the corresponding
 * linked flag is enabled.
 *
 * A re-entrance guard prevents infinite loops (A→B→A).
 */
export declare class TrackGroupLinkingService implements Disposable$1 {
	private _session;
	private _trackSubs;
	private _propagating;
	constructor(session: Session);
	dispose(): void;
	private subscribeTrack;
	private unsubscribeTrack;
	/**
	 * Execute `fn` only if we are not already inside a propagation cycle.
	 */
	private propagate;
	/**
	 * Call `fn` for every sibling track in the same TrackGroup that has
	 * the specified property linked.
	 */
	private forEachLinkedSibling;
	private isLinked;
}
/**
 * TriggerBox implements Ableton-style clip/slot-based playback.
 *
 * A TriggerBox contains multiple slots (triggers), each holding a clip.
 * Only one trigger per box is active at a time. Triggers can be launched
 * quantized to musical grid positions.
 */
export declare enum TriggerState {
	STOPPED = "STOPPED",
	WAITING_TO_START = "WAITING_TO_START",
	RUNNING = "RUNNING",
	WAITING_TO_STOP = "WAITING_TO_STOP",
	WAITING_TO_RETRIGGER = "WAITING_TO_RETRIGGER"
}
export declare enum LaunchQuantize {
	NONE = "NONE",// Immediate
	BAR = "BAR",// Next bar boundary
	BEAT = "BEAT",// Next beat boundary
	HALF_BAR = "HALF_BAR"
}
export declare enum FollowAction {
	NONE = "NONE",// Stop after playing
	AGAIN = "AGAIN",// Loop (play again)
	NEXT = "NEXT",// Play next slot
	PREV = "PREV",// Play previous slot
	RANDOM = "RANDOM",// Play random slot
	STOP = "STOP"
}
export interface TriggerSlot {
	id: string;
	index: number;
	name: string;
	sourceId: SourceId | null;
	state: TriggerState;
	gain: number;
	color: string;
	launchQuantize: LaunchQuantize;
	followAction: FollowAction;
	followCount: number;
	followProbability: number;
	stretchMode: "timestretch" | "resample" | "none";
	loopStart: FrameCount;
	loopEnd: FrameCount;
	playCount: number;
	playbackPosition: FrameCount;
}
export interface TriggerPlaybackInfo {
	sourceId: SourceId;
	startInSource: FrameCount;
	blockSize: number;
	gain: number;
}
export interface TriggerBoxSnapshot {
	id: string;
	trackId: string;
	slots: Array<{
		name: string;
		sourceId: string | null;
		gain: number;
		color: string;
		launchQuantize: string;
		followAction: string;
		followCount: number;
		followProbability: number;
	}>;
}
export declare class TriggerBox {
	readonly id: string;
	readonly trackId: TrackId;
	private _slots;
	private _activeSlotIndex;
	private _defaultSlotCount;
	readonly slotTriggered: Signal<{
		index: number;
		slot: TriggerSlot;
	}>;
	readonly slotStopped: Signal<{
		index: number;
	}>;
	readonly activeSlotChanged: Signal<number>;
	readonly slotStateChanged: Signal<{
		index: number;
		state: TriggerState;
	}>;
	constructor(id: string, trackId: TrackId, slotCount?: number);
	getSlot(index: number): TriggerSlot | undefined;
	get slots(): ReadonlyArray<TriggerSlot>;
	get slotCount(): number;
	get activeSlotIndex(): number;
	loadClip(slotIndex: number, sourceId: SourceId, name?: string): void;
	clearSlot(slotIndex: number): void;
	launchSlot(slotIndex: number): void;
	stopSlot(slotIndex: number): void;
	stopAll(): void;
	/**
	 * Called by the transport for each audio processing block.
	 * Handles state transitions (quantized launch, follow actions) and
	 * returns the playback information for the currently active clip.
	 */
	processBlock(currentFrame: FrameCount, blockSize: number, bpm: number, beatsPerBar: number): TriggerPlaybackInfo | null;
	/**
	 * Calculate the next quantize boundary based on the launch quantize
	 * setting of the slot that is currently transitioning.
	 */
	getNextQuantizePoint(currentFrame: FrameCount, bpm: number, beatsPerBar: number, sampleRate: number): FrameCount;
	private processFollowAction;
	toJSON(): TriggerBoxSnapshot;
	static fromJSON(data: TriggerBoxSnapshot): TriggerBox;
	private createEmptySlot;
	private activateSlot;
	private deactivateSlot;
	private setSlotState;
	/**
	 * Find the next slot (in the given direction) that has a loaded clip.
	 * Wraps around the slot list.
	 */
	private findNextLoadedSlot;
}
export interface RegionDTO {
	id: RegionId;
	sourceId: SourceId;
	start: FrameCount;
	length: FrameCount;
	end: FrameCount;
	sourceStart: FrameCount;
	name: string;
	gain: number;
	muted: boolean;
	layer: number;
	/** false면 아래 Layer와 함께 재생합니다. 생략하면 true로 처리합니다. */
	opaque?: boolean;
	fadeIn: FrameCount;
	fadeOut: FrameCount;
	playbackRate: number;
	/** Pitch-preserving time stretch ratio (1.0 = normal) */
	stretch: number;
	/** Pitch shift in semitones (0 = no shift) */
	pitchSemitones: number;
	timeDomain: TimeDomain;
}
export interface MidiNoteDTO {
	id: string;
	pitch: number;
	velocity: number;
	startFrame: number;
	durationFrames: number;
	channel: number;
}
export interface MidiRegionDTO {
	id: string;
	name: string;
	start: number;
	length: number;
	end: number;
	muted: boolean;
	notes: MidiNoteDTO[];
}
/**
 * Metering data for a single channel or bus.
 * All levels are in dBFS (decibels relative to full scale).
 */
export interface MeterData {
	/** Peak level in dBFS */
	peak: number;
	/** RMS level in dBFS */
	rms: number;
	/** Peak hold value (decays slowly over time) */
	peakHold: number;
	/** True if signal clips (peak >= 0 dBFS) */
	clipping: boolean;
	/** Short-term LUFS (ITU-R BS.1770) */
	lufs?: number;
}
export declare const ROUTING_SNAPSHOT_SCHEMA_VERSION: 1;
export type RoutingNodeType = "audio" | "midi" | "aux" | "bus" | "master" | "folder" | "vca";
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
export declare function getProcessorRuntimeType(processor: Processor): string;
export declare function createRoutingSnapshot(session: Session): RoutingSnapshot;
export interface AudioProvider {
	initialize(): Promise<void>;
	applyRoutingSnapshot(snapshot: RoutingSnapshot): void;
	start(): void;
	/**
	 * Declick으로 출력을 무음까지 낮춘 뒤 transport를 정지한다.
	 * 다음 start()가 정상 음량으로 재생할 수 있는 상태에서 Promise를 완료해야 한다.
	 */
	stopWithDeclick?(): Promise<void>;
	stop(): void;
	pause(): void;
	seek(time: number): void;
	createTrack(trackId: TrackId, name: string, inputId: string, outputId: string): void;
	createAuxTrack(trackId: TrackId, name: string, inputId: string, outputId: string): void;
	createBusTrack(trackId: TrackId, name: string, inputId: string, outputId: string): void;
	deleteTrack(trackId: TrackId): void;
	connectIO(sourceId: string, destId: string): void;
	disconnectIO(sourceId: string, destId: string): void;
	addProcessor(trackId: TrackId, processorId: ProcessorId, type: string, index: number): void;
	removeProcessor(trackId: TrackId, processorId: ProcessorId): void;
	setProcessorParameter(trackId: TrackId, processorId: ProcessorId, parameter: string, value: number): void;
	setProcessorAutomation(trackId: TrackId, processorId: ProcessorId, parameter: string, events: ReadonlyArray<AutomationPoint>): void;
	setTrackGain(trackId: string, gain: number): void;
	setTrackPan(trackId: string, pan: number): void;
	setMonitor(trackId: string, enabled: boolean): void;
	setTrackMute(trackId: string, muted: boolean): void;
	setTrackSolo(trackId: string, soloed: boolean): void;
	setTrackSoloIsolate(trackId: string, isolate: boolean): void;
	setTrackSoloSafe(trackId: string, safe: boolean): void;
	setMonitorMode(trackId: string, mode: string): void;
	scheduleRegion(trackId: TrackId, region: RegionDTO): void;
	updateRegions(trackId: TrackId, regions: RegionDTO[]): void;
	removeRegion(trackId: TrackId, regionId: string): void;
	getMeterLevel(routeId: RouteId): number;
	getMeterData(trackId: string): MeterData;
	getMasterMeterData(): MeterData;
	getAnalyserNode(trackId?: string): AnalyserNode | null;
	getAudioBuffer(sourceId: string): Promise<AudioBuffer | null>;
	addAudioBuffer(sourceId: string, buffer: AudioBuffer): void;
	prepareRecording(trackId: TrackId): Promise<void>;
	startRecording(trackId: TrackId): void;
	stopRecording(trackId: TrackId): Promise<Blob>;
	enablePunchRecording(enabled: boolean): void;
	setPunchRange(startFrame: FrameCount, endFrame: FrameCount): void;
	setRecordingMuted(trackId: TrackId, muted: boolean): void;
	setMonitorWithEffects(trackId: TrackId, enabled: boolean): void;
	getInputLatencyMs(): number;
	getCurrentFrame(): FrameCount;
	getCurrentTime(): number;
	setTempo(bpm: number): void;
	cacheBlob(url: string, blob: Blob): Promise<void>;
	enableMetronome(enabled: boolean): void | Promise<void>;
	setMetronomeVolume(volume: number): void;
	addSource(source: Source): Promise<void>;
	getEngineType(): "Worklet" | "ToneFallback";
	exportAudio(startFrame: FrameCount, endFrame: FrameCount, sampleRate: number, trackIds?: TrackId[]): Promise<AudioBuffer>;
	renderRegionsToBuffer(trackId: TrackId, regionIds: string[]): Promise<AudioBuffer>;
	setMasterGain(gain: number): void;
	addMasterProcessor(processorId: ProcessorId, type: string, index: number): void;
	removeMasterProcessor(processorId: ProcessorId): void;
	setMasterProcessorParameter(processorId: ProcessorId, parameter: string, value: number): void;
	registerMasterIO(inputId: string, outputId: string): void;
	addSendBus(sendBusId: string, sourceTrackId: TrackId, destId: string, level: number, preFader: boolean): void;
	removeSendBus(sendBusId: string): void;
	setSendBusLevel(sendBusId: string, level: number): void;
	setSendBusPreFader(sendBusId: string, preFader: boolean): void;
	setSendBusActive(sendBusId: string, active: boolean): void;
	auditionRegion(trackId: TrackId, regionId: string): void;
	stopAudition(): void;
	stripSilence(trackId: TrackId, regionId: string, thresholdDb: number, minLengthFrames: number): Promise<Array<{
		start: number;
		length: number;
	}>>;
	normalizeRegion(trackId: TrackId, regionId: string, targetDb: number): Promise<number>;
	/** Create a MIDI track with a synth instrument */
	createMidiTrack(trackId: TrackId, name: string, inputId: string, outputId: string): void;
	/** Schedule a MIDI region for playback */
	scheduleMidiRegion(trackId: TrackId, region: MidiRegionDTO): void;
	/** Remove a scheduled MIDI region */
	removeMidiRegion(trackId: TrackId, regionId: string): void;
	/** Switch the synth instrument type for a MIDI track */
	setMidiInstrument(trackId: TrackId, instrumentType: string): void;
	/** Enable/disable native transport loop */
	enableLoop(enabled: boolean): void;
	/** Set the loop range on the transport */
	setLoopRange(startTime: number, endTime: number): void;
	/** Release all sounding MIDI notes immediately */
	midiPanic(): void;
	/** Get separate L/R meter data for the master bus */
	getMasterStereoMeterData(): {
		left: MeterData;
		right: MeterData;
	};
	/** Reverse the audio buffer data for a region in-place */
	reverseRegionBuffer(trackId: TrackId, regionId: string): Promise<void>;
}
export interface MidiNoteOnEvent {
	pitch: number;
	velocity: number;
	channel: number;
}
export interface MidiNoteOffEvent {
	pitch: number;
	channel: number;
}
export interface MidiControlChangeEvent {
	controller: number;
	value: number;
	channel: number;
}
declare class MidiInput {
	private static instance;
	private midiAccess;
	private activeInput;
	private _initialized;
	readonly noteOn: Signal<MidiNoteOnEvent>;
	readonly noteOff: Signal<MidiNoteOffEvent>;
	readonly controlChange: Signal<MidiControlChangeEvent>;
	readonly deviceListChanged: Signal<void>;
	private constructor();
	static getInstance(): MidiInput;
	/** For testing – reset singleton */
	static resetInstance(): void;
	get initialized(): boolean;
	/**
	 * Request MIDI access from the browser.
	 * Must be called before using any other methods.
	 */
	initialize(): Promise<boolean>;
	/**
	 * List all available MIDI input devices.
	 */
	getInputDevices(): MIDIInput[];
	/**
	 * Get the currently active MIDI input device ID.
	 */
	getActiveInputId(): string | null;
	/**
	 * Select an active MIDI input device by ID.
	 * Pass null to deselect.
	 */
	setActiveInput(inputId: string | null): void;
	/**
	 * Parse raw MIDI messages and emit appropriate signals.
	 */
	private handleMidiMessage;
	/**
	 * Clean up resources.
	 */
	dispose(): void;
}
export declare class AudioEngine {
	private static instance;
	private backend;
	session: Session;
	private disposed;
	private isBackendTransportRunning;
	private transportStartPromise;
	private transportStopPromise;
	private midiInput;
	private midiRecordingNotes;
	private midiRecordedNotes;
	private midiNoteOnSub;
	private midiNoteOffSub;
	/** Signal disconnect handles for cleanup on dispose */
	private signalDisposers;
	/** Per-track signal disposers — cleaned up when a track is removed */
	private trackDisposers;
	/** Per-SendBus signal disposers — cleaned up when a send bus is removed */
	private sendBusDisposers;
	private constructor();
	static getInstance(backend?: AudioProvider): AudioEngine;
	/**
	 * 호출자가 생명주기를 소유하는 독립 엔진을 만듭니다.
	 *
	 * 브라우저 앱은 격리된 Composition Root를 둘 이상 만들 수 있으므로
	 * getInstance()가 반환하는 프로세스 전역 인스턴스를 공유하지 않습니다.
	 */
	static create(backend: AudioProvider): AudioEngine;
	/** Reset the singleton instance. For testing only. */
	static resetInstance(): void;
	/** Dispose all listeners and internal state to prevent memory leaks. */
	dispose(): void;
	private disconnectSessionSignals;
	setBackend(backend: AudioProvider): void;
	/**
	 * Pre-cache a decoded AudioBuffer so subsequent addSource/getAudioBuffer
	 * calls for the same URL hit the cache instead of re-fetching.
	 * Useful when the source was loaded from a blob URL that will be revoked.
	 */
	precacheAudioBuffer(url: string, buffer: AudioBuffer): void;
	getEngineType(): "Worklet" | "ToneFallback";
	getCurrentTime(): number;
	getCurrentFrame(): number;
	seek(time: number): void;
	/**
	 * Convert a Region domain object to a plain RegionDTO safe for postMessage.
	 * Only copies the properties defined in the RegionDTO interface, avoiding
	 * non-serialisable fields like Signal instances that would cause DataCloneError.
	 */
	private static toRegionDTO;
	updateRegion(trackId: string, _region: RegionDTO | Region): void;
	private syncSessionToBackend;
	private syncRoutingSnapshot;
	private syncLoopRange;
	private syncPunchRange;
	private syncTrackToBackend;
	private createBackendTrack;
	private syncProcessorState;
	private syncMasterProcessorState;
	private syncIOConnections;
	private syncSendBusToBackend;
	private clearSessionFromBackend;
	private setupSessionListeners;
	private bindSendBusSignals;
	private bindTrackRuntimeSignals;
	private static toMidiRegionDTO;
	private bindTrackSignals;
	private connectMasterProcessorSignals;
	private connectProcessorSignals;
	private bindProcessorSnapshotSignals;
	private bindAutomationList;
	initialize(): Promise<void>;
	private preRollTargetFrame;
	private preRollArmedTracks;
	private preRollWasMetronomeEnabled;
	start(): Promise<void>;
	private startBackendWhenReady;
	private clearTransportStartPromise;
	private syncId;
	private requestFrame;
	private cancelFrame;
	private startTransportSync;
	private scheduleAutomations;
	stop(): Promise<void>;
	private stopBackendAfterStart;
	private clearTransportStopPromise;
	pause(): void;
	enablePunchRecording(enabled: boolean): void;
	setMonitorWithEffects(trackId: string, enabled: boolean): void;
	getInputLatencyMs(): number;
	/**
	 * Handle loop recording take: stop current recording, save take as a region on a new layer,
	 * then restart recording for the next pass.
	 */
	private handleLoopRecordingTake;
	/**
	 * Initialize MIDI input subsystem.
	 */
	initializeMidiInput(): Promise<boolean>;
	/**
	 * Get available MIDI input devices.
	 */
	getMidiInputDevices(): MIDIInput[];
	/**
	 * Set the active MIDI input device.
	 */
	setMidiInputDevice(inputId: string | null): void;
	/**
	 * Get the MidiInput singleton for external consumers.
	 */
	getMidiInput(): MidiInput;
	private startMidiRecording;
	private stopMidiRecording;
	private finalizeMidiRecording;
	startRecording(): Promise<void>;
	stopRecording(): Promise<void>;
	addTrack(name: string, type?: TrackType, id?: string): Track;
	removeTrack(trackId: string): void;
	setTrackGain(trackId: string, gain: number): void;
	setTrackPan(trackId: string, pan: number): void;
	getExportConfig(): ExportConfig;
	getExportStatus(): ExportStatus;
	exportAudio(config: ExportConfig, _status: ExportStatus): Promise<void>;
	renderRegionsToBuffer(trackId: string, regionIds: string[]): Promise<AudioBuffer>;
	getMeterData(trackId: string): MeterData;
	getMasterMeterData(): MeterData;
	getAnalyserNode(trackId?: string): AnalyserNode | null;
	auditionRegion(trackId: string, regionId: string): void;
	stopAudition(): void;
	setMidiInstrument(trackId: string, instrumentType: string): void;
	stripSilence(trackId: string, regionId: string, thresholdDb: number, minLengthFrames: number): Promise<Array<{
		start: number;
		length: number;
	}>>;
	normalizeRegion(trackId: string, regionId: string, targetDb: number): Promise<number>;
	midiPanic(): void;
	getMasterStereoMeterData(): {
		left: MeterData;
		right: MeterData;
	};
	reverseRegionBuffer(trackId: string, regionId: string): Promise<void>;
	loadSession(newSession: Session): void;
	loadSessionFromSnapshot(snapshot: SessionSnapshot): void;
	private stopImmediately;
}
/**
 * Offline Audio Exporter
 *
 * Web Audio의 OfflineAudioContext를 활용하여 실시간보다 빠르게 렌더링합니다.
 */
export declare class OfflineExporter {
	/**
	 * Export audio using Offline Rendering
	 *
	 * @param config Export configuration
	 * @param status Export status (for progress tracking)
	 * @param getTrackAudio Callback to get track audio for a given time range
	 */
	static export(config: ExportConfig, status: ExportStatus, getTrackAudio: (trackIds: TrackId[], startFrame: FrameCount, endFrame: FrameCount) => Promise<AudioBuffer>): Promise<void>;
	/**
	 * Normalize audio buffer using peak normalization.
	 *
	 * @param buffer Audio data (modified in-place)
	 * @param targetPeakDb Target peak level in dBFS (default: -1 dBFS)
	 */
	private static normalizeBuffer;
	/**
	 * Encode AudioBuffer to Blob
	 */
	private static encodeToBlob;
	/**
	 * Encode to MP3 format using lamejs
	 */
	private static encodeMP3;
	/**
	 * Stem Export: export each track individually as separate files.
	 * Returns a map of trackId -> { blob, filename }.
	 */
	static exportStems(config: ExportConfig, status: ExportStatus, trackIds: TrackId[], trackNames: Map<TrackId, string>, getTrackAudio: (ids: TrackId[], startFrame: FrameCount, endFrame: FrameCount) => Promise<AudioBuffer>): Promise<Map<TrackId, {
		blob: Blob;
		filename: string;
	}>>;
}
/**
 * Auditioner provides solo preview playback of audio sources.
 *
 * Used to preview audio files before importing, or to audition
 * regions/clips without affecting the main transport.
 * Plays through a dedicated output path that bypasses the mixer.
 */
export declare enum AuditionerState {
	IDLE = "IDLE",
	LOADING = "LOADING",
	PLAYING = "PLAYING",
	PAUSED = "PAUSED"
}
export interface AuditionerOutput {
	sourceId: SourceId;
	url: string;
	startInSource: FrameCount;
	blockSize: number;
	gain: number;
}
export declare class Auditioner {
	private _state;
	private _currentSourceId;
	private _currentUrl;
	private _position;
	private _duration;
	private _gain;
	private _looping;
	private _regionStart;
	private _regionLength;
	readonly stateChanged: Signal<AuditionerState>;
	readonly positionChanged: Signal<number>;
	readonly finished: Signal<void>;
	get state(): AuditionerState;
	get isPlaying(): boolean;
	get position(): FrameCount;
	get duration(): FrameCount;
	get currentSourceId(): SourceId | null;
	/**
	 * Audition an entire source by URL.
	 *
	 * Cancels any currently active audition, then begins playback of the
	 * full source from the beginning.
	 */
	auditSource(sourceId: SourceId, url: string, duration: FrameCount): void;
	/**
	 * Audition a specific region of a source.
	 *
	 * Useful for previewing a trimmed region or a clip without
	 * having to play the full underlying source.
	 */
	auditRegion(sourceId: SourceId, url: string, start: FrameCount, length: FrameCount): void;
	/**
	 * Resume or start playback of the current audition.
	 */
	play(): void;
	/**
	 * Pause the current audition. Position is preserved so playback
	 * can be resumed with {@link play}.
	 */
	pause(): void;
	/**
	 * Stop playback and reset position to the beginning.
	 */
	stop(): void;
	/**
	 * Seek to an absolute frame position within the auditioned region.
	 * The position is clamped to [0, duration).
	 */
	seek(frame: FrameCount): void;
	/**
	 * Set the auditioner output gain.
	 * @param gain Linear gain value (0.0 = silence, 1.0 = unity).
	 */
	setGain(gain: number): void;
	/**
	 * Enable or disable looping for the current audition.
	 */
	setLooping(loop: boolean): void;
	/**
	 * Called by the audio engine on each render cycle to advance the
	 * auditioner position and produce an output descriptor.
	 *
	 * Returns `null` when the auditioner is not actively playing.
	 * When playback reaches the end of the region and looping is
	 * disabled, emits the {@link finished} signal and transitions
	 * to IDLE.
	 *
	 * @param blockSize   Number of frames in this render block.
	 * @param _sampleRate Current engine sample rate (reserved for
	 *                    future sample-rate conversion).
	 */
	processBlock(blockSize: number, _sampleRate: number): AuditionerOutput | null;
	/**
	 * Cancel the current audition and reset all state.
	 */
	cancel(): void;
	private setState;
}
/**
 * BWF (Broadcast Wave Format) metadata handler.
 *
 * BWF extends standard WAV with a 'bext' chunk containing:
 * - Description (256 chars)
 * - Originator (32 chars)
 * - OriginatorReference (32 chars)
 * - OriginationDate (10 chars, YYYY-MM-DD)
 * - OriginationTime (8 chars, HH:MM:SS)
 * - TimeReference (64-bit sample count)
 * - Version (2 bytes)
 * - UMID (64 bytes)
 * - LoudnessValue, LoudnessRange, MaxTruePeakLevel, etc.
 * - CodingHistory (variable length)
 *
 * Specification: EBU Tech 3285 (v2)
 */
export interface BWFData {
	description: string;
	originator: string;
	originatorReference: string;
	originationDate: string;
	originationTime: string;
	timeReference: bigint;
	version: number;
	umid: Uint8Array;
	loudnessValue: number;
	loudnessRange: number;
	maxTruePeakLevel: number;
	maxMomentaryLoudness: number;
	maxShortTermLoudness: number;
	codingHistory: string;
}
export declare class BWFMetadata {
	/**
	 * Parse BWF metadata from a WAV file ArrayBuffer.
	 *
	 * Scans the RIFF/WAVE structure for a 'bext' chunk and decodes the
	 * fields according to EBU Tech 3285 v2. Returns `null` when no bext
	 * chunk is found.
	 */
	static parse(wavData: ArrayBuffer): BWFData | null;
	/**
	 * Serialise {@link BWFData} into a standalone bext chunk (including
	 * the 8-byte chunk header: 'bext' + uint32 size).
	 */
	static createBextChunk(data: BWFData): ArrayBuffer;
	/**
	 * Inject a bext chunk into an existing WAV file.
	 *
	 * If the WAV already contains a bext chunk it is replaced.
	 * The returned ArrayBuffer is a new, valid RIFF/WAVE file.
	 */
	static injectBWF(wavData: ArrayBuffer, bwfData: BWFData): ArrayBuffer;
	/**
	 * Create default BWF data suitable for a new recording.
	 *
	 * Populates the origination date/time from the current wall clock and
	 * sets all other fields to sensible defaults.
	 */
	static createDefault(options?: {
		description?: string;
		originator?: string;
		timeReference?: bigint;
		sampleRate?: number;
	}): BWFData;
	/**
	 * Validate BWF data according to EBU Tech 3285 constraints.
	 *
	 * @returns An array of human-readable error strings (empty = valid).
	 */
	static validate(data: BWFData): string[];
	/**
	 * Read a fixed-length ASCII string from a DataView, trimming NUL
	 * padding from the right.
	 */
	private static readFixedString;
	/**
	 * Write a string into a fixed-length field, padding with NUL bytes.
	 */
	private static writeFixedString;
	/**
	 * Locate a RIFF chunk by its four-character ID.
	 *
	 * Returns the offset of the chunk *data* (after the 8-byte header)
	 * and the data size. Returns `null` if the chunk is not found.
	 */
	private static findChunk;
	/**
	 * Internal chunk finder that also returns the header offset (for
	 * replacement scenarios in {@link injectBWF}).
	 */
	private static findChunkRaw;
	/**
	 * Read a four-character chunk ID from a DataView.
	 */
	private static readChunkId;
	/**
	 * Write a four-character chunk ID into a DataView.
	 */
	private static writeChunkId;
	/**
	 * Encode a string to a Uint8Array using ASCII (Latin-1 subset).
	 */
	private static encodeString;
	/**
	 * Generate a unique originator reference string.
	 *
	 * EBU R99-1999 recommends a format based on country code, org code,
	 * and a serial number. We use a simplified random approach.
	 */
	private static generateOriginatorReference;
}
/**
 * SidechainRouter manages the actual audio signal routing for sidechain connections.
 *
 * In the Web Audio context, sidechain routing works by:
 * 1. Tapping the source track's audio output (pre or post fader)
 * 2. Optionally applying a high-pass filter
 * 3. Feeding it into the target processor's sidechain input
 *
 * The router maintains a buffer-per-config that holds the latest audio block
 * from the source track, available for the target processor to read.
 */
export declare class SidechainRouter {
	private _configs;
	/** Buffer storage: configId -> latest audio block from source */
	private _sidechainBuffers;
	/** HPF filter state per config (one state per channel, keyed by configId) */
	private _filterStates;
	/** Sample rate used for HPF coefficient computation */
	private _sampleRate;
	readonly routingChanged: Signal<void>;
	/**
	 * @param sampleRate - The audio sample rate (e.g. 44100, 48000)
	 */
	constructor(sampleRate?: number);
	/**
	 * Register a sidechain configuration.
	 * Initialises the buffer and filter state for the new config.
	 */
	addConfig(config: SidechainConfig): void;
	/**
	 * Remove a sidechain configuration and clean up its resources.
	 */
	removeConfig(configId: string): void;
	/**
	 * Get config by ID.
	 */
	getConfig(configId: string): SidechainConfig | undefined;
	/**
	 * Get all configs targeting a specific track.
	 */
	getConfigsForTarget(trackId: TrackId): SidechainConfig[];
	/**
	 * Get all configs sourcing from a specific track.
	 */
	getConfigsForSource(trackId: TrackId): SidechainConfig[];
	/**
	 * Called by the audio engine when a source track produces audio.
	 * Stores the audio block for later retrieval by target processors.
	 *
	 * For every config that sources from the given trackId, we copy the
	 * audio data into the config's sidechain buffer.
	 *
	 * @param trackId - The source track that just produced audio
	 * @param audioData - Per-channel audio data (e.g. [leftChannel, rightChannel])
	 * @param blockSize - Number of samples per channel in this block
	 */
	feedSourceAudio(trackId: TrackId, audioData: Float32Array[], blockSize: number): void;
	/**
	 * Called by the target processor to get the sidechain input.
	 * Returns the latest audio block from the source track (with optional HPF applied),
	 * or null if no valid data is available.
	 *
	 * @param configId - The sidechain configuration ID
	 * @returns Per-channel audio data, or null if unavailable
	 */
	getSidechainInput(configId: string): Float32Array[] | null;
	/**
	 * Apply a 2nd-order Butterworth high-pass filter to the sidechain signal.
	 * Processes in-place on copies of the input channels.
	 *
	 * The Butterworth HPF transfer function is implemented as a Direct Form I
	 * biquad filter: y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
	 */
	private _applyHPF;
	/**
	 * Rebuild the filter state for a given config.
	 * Called when the config is added or its filter parameters change.
	 */
	private _rebuildFilterState;
	/**
	 * Reset all buffers and filter states.
	 * Typically called when transport stops or seeks.
	 */
	reset(): void;
	/**
	 * Update the sample rate. Recomputes all HPF filter coefficients.
	 */
	setSampleRate(sampleRate: number): void;
}
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
	id: string;
	name: string;
	type: "audio" | "midi" | "aux" | "bus" | "master" | "folder" | "vca";
	inputs: Set<string>;
	outputs: Set<string>;
	processed: boolean;
	depth: number;
}
export interface FeedbackLoop {
	path: string[];
	description: string;
}
export declare class RoutingGraph {
	private _nodes;
	readonly graphChanged: Signal<void>;
	readonly feedbackDetected: Signal<FeedbackLoop>;
	/**
	 * Add a node to the graph.
	 * If a node with the same ID already exists, it is updated in place.
	 */
	addNode(id: string, name: string, type: GraphNode["type"]): void;
	/**
	 * Remove a node and all edges that reference it.
	 */
	removeNode(id: string): void;
	/**
	 * Add a directed edge from one node to another.
	 * Both nodes must already exist in the graph.
	 */
	addEdge(fromId: string, toId: string): void;
	/**
	 * Remove a directed edge between two nodes.
	 */
	removeEdge(fromId: string, toId: string): void;
	/**
	 * Rebuild the entire graph from session state.
	 * Clears all existing nodes/edges and reconstructs from the provided
	 * track descriptors. Typically called after bulk routing changes.
	 */
	rebuild(tracks: Array<{
		id: string;
		name: string;
		type: string;
		sendTargets: string[];
		outputTarget: string;
	}>): void;
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
	getProcessingOrder(): string[];
	/**
	 * Detect all feedback loops (cycles) in the graph using DFS.
	 * Returns an array of FeedbackLoop descriptors, each containing the
	 * ordered path of node IDs that form the cycle.
	 */
	detectFeedback(): FeedbackLoop[];
	/**
	 * Check whether route A feeds (directly or indirectly) into route B.
	 * Uses BFS from A, following output edges, to determine reachability.
	 */
	feeds(fromId: string, toId: string): boolean;
	/**
	 * Check whether route A directly feeds into route B (single hop).
	 */
	directFeeds(fromId: string, toId: string): boolean;
	/**
	 * Get all routes that feed (directly or indirectly) into the given route.
	 * Traverses backward from the target, following input edges via BFS.
	 */
	getUpstream(nodeId: string): string[];
	/**
	 * Get all routes that the given route feeds (directly or indirectly) into.
	 * Traverses forward from the source, following output edges via BFS.
	 */
	getDownstream(nodeId: string): string[];
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
	getParallelGroups(): string[][];
	/**
	 * Get a single node by ID.
	 */
	getNode(id: string): GraphNode | undefined;
	/**
	 * Get all nodes as a read-only array.
	 */
	get nodes(): ReadonlyArray<GraphNode>;
	/**
	 * Clear all nodes and edges, resetting the graph to an empty state.
	 */
	clear(): void;
	/**
	 * Compute the depth of each node (longest path from any leaf to this node).
	 * Leaf nodes (no inputs) have depth 0. Used for parallel group assignment
	 * and rendering the graph visualization.
	 */
	private _computeDepths;
}
/**
 * PunchRecordManager handles automatic punch-in/punch-out recording.
 *
 * When punch is enabled:
 * - Recording starts automatically when playhead enters the punch range
 * - Recording stops automatically when playhead exits the punch range
 * - Declick fades are applied at punch boundaries
 * - Pre-roll audio before punch-in is discarded
 *
 * Modes:
 * - Simple punch: single pass recording within the range
 * - Loop punch: repeated punch recording when loop + punch are both enabled
 */
export interface PunchState {
	enabled: boolean;
	punchIn: FrameCount;
	punchOut: FrameCount;
	isPunchedIn: boolean;
	armedTrackIds: TrackId[];
}
export declare class PunchRecordManager {
	private _enabled;
	private _punchIn;
	private _punchOut;
	private _isPunchedIn;
	private _armedTrackIds;
	private _declickLength;
	/** Emitted when the playhead enters the punch range and recording begins. */
	readonly punchInTriggered: Signal<string[]>;
	/** Emitted when the playhead exits the punch range and recording stops. */
	readonly punchOutTriggered: Signal<string[]>;
	/** Emitted whenever the punch state changes. */
	readonly stateChanged: Signal<PunchState>;
	/**
	 * @param sampleRate - Audio sample rate, used to compute declick fade length.
	 *                     Defaults to 44100 if omitted.
	 */
	constructor(sampleRate?: number);
	/**
	 * Configure the punch range boundaries.
	 * @param punchIn - Frame at which recording should begin
	 * @param punchOut - Frame at which recording should end
	 */
	setPunchRange(punchIn: FrameCount, punchOut: FrameCount): void;
	/**
	 * Enable or disable punch recording.
	 * Disabling while punched-in will trigger an immediate punch-out.
	 */
	setEnabled(enabled: boolean): void;
	/**
	 * Arm a track for punch recording.
	 * Only armed tracks will be affected by punch-in/punch-out events.
	 */
	armTrack(trackId: TrackId): void;
	/**
	 * Disarm a track from punch recording.
	 */
	disarmTrack(trackId: TrackId): void;
	/**
	 * Called each audio process cycle with the current transport position.
	 * Checks whether the playhead has crossed a punch boundary and triggers
	 * punch-in or punch-out accordingly.
	 *
	 * @param currentFrame - The current transport playhead position in frames
	 * @returns true if the recording state changed during this call
	 */
	processPosition(currentFrame: FrameCount): boolean;
	/**
	 * Get a snapshot of the current punch state.
	 */
	getState(): PunchState;
	/**
	 * Whether we're currently in the punched-in state (recording is active
	 * within the punch range).
	 */
	get isPunchedIn(): boolean;
	/**
	 * Compute declick fade gain at a given position relative to punch boundaries.
	 *
	 * Returns a gain value between 0.0 and 1.0:
	 * - Ramps from 0->1 over _declickLength frames starting at punchIn (fade-in)
	 * - Ramps from 1->0 over _declickLength frames ending at punchOut (fade-out)
	 * - Returns 1.0 for positions in the middle of the punch range
	 * - Returns 0.0 for positions outside the punch range
	 *
	 * Uses a raised-cosine (Hann) curve for perceptually smooth transitions,
	 * consistent with the Declicker class.
	 */
	getDeclickGain(frame: FrameCount): number;
	/**
	 * Reset state (called on transport stop).
	 * Clears the punched-in state without emitting punch-out signals,
	 * since transport stop implies recording has already ceased.
	 */
	reset(): void;
	/**
	 * Execute a punch-in: transition to recording state and notify listeners.
	 */
	private _doPunchIn;
	/**
	 * Execute a punch-out: transition out of recording state and notify listeners.
	 */
	private _doPunchOut;
	/**
	 * Emit a stateChanged signal with the current punch state snapshot.
	 */
	private _emitStateChanged;
}
/**
 * MultiTrackRecorder manages simultaneous recording on multiple tracks.
 *
 * In the Web Audio context, each armed track can record from:
 * - A specific audio input channel (via Web Audio MediaStreamSource)
 * - A MIDI input device
 *
 * The recorder manages:
 * - Per-track input assignment (which input channel -> which track)
 * - Simultaneous recording start/stop across all armed tracks
 * - Per-track audio buffer accumulation
 * - Take numbering and management
 */
export interface InputAssignment {
	trackId: TrackId;
	inputType: "audio" | "midi";
	channelIndex: number;
	deviceId?: string;
}
export interface RecordingResult {
	trackId: TrackId;
	blob: Blob;
	startFrame: FrameCount;
	durationFrames: FrameCount;
	takeNumber: number;
	peakLevel: number;
	hasClipped: boolean;
}
export interface AudioInputInfo {
	deviceId: string;
	label: string;
	channelCount: number;
}
export declare class MultiTrackRecorder {
	private _assignments;
	private _activeRecordings;
	private _takeCounters;
	private _isRecording;
	private _sampleRate;
	/** Emitted when recording starts on a set of tracks. */
	readonly recordingStarted: Signal<string[]>;
	/** Emitted when recording stops, with results for each track. */
	readonly recordingStopped: Signal<RecordingResult[]>;
	/** Emitted periodically with per-track level updates during recording. */
	readonly levelUpdate: Signal<{
		trackId: TrackId;
		level: number;
	}>;
	/** Emitted when clipping is detected on a track. */
	readonly clipDetected: Signal<string>;
	/**
	 * @param sampleRate - Audio sample rate for WAV encoding. Defaults to 44100.
	 */
	constructor(sampleRate?: number);
	/**
	 * Assign an input source to a track.
	 * Defines which audio input channel or MIDI device feeds this track.
	 */
	assignInput(assignment: InputAssignment): void;
	/**
	 * Remove an input assignment from a track.
	 */
	removeAssignment(trackId: TrackId): void;
	/**
	 * Get the input assignment for a specific track.
	 */
	getAssignment(trackId: TrackId): InputAssignment | undefined;
	/**
	 * Get all current input assignments.
	 */
	getAllAssignments(): InputAssignment[];
	/**
	 * Start recording on all assigned and armed tracks simultaneously.
	 * Only tracks that appear in both armedTrackIds AND have an input assignment
	 * will begin recording.
	 *
	 * @param armedTrackIds - List of track IDs that are armed for recording
	 * @param startFrame - The session frame at which recording begins
	 */
	startRecording(armedTrackIds: TrackId[], startFrame: FrameCount): void;
	/**
	 * Stop recording on all tracks and return results.
	 * Each result contains the accumulated audio as a WAV blob, duration,
	 * peak level, and clipping information.
	 */
	stopRecording(): RecordingResult[];
	/**
	 * Stop recording on a specific track while other tracks continue.
	 * Returns the result for that track, or null if the track was not recording.
	 */
	stopTrackRecording(trackId: TrackId): RecordingResult | null;
	/**
	 * Feed audio data for a specific track during recording.
	 * Called from the audio processing callback for each block of samples.
	 *
	 * Accumulates chunks, tracks peak levels, and detects clipping.
	 *
	 * @param trackId - The track receiving the audio
	 * @param data - Per-channel audio data (e.g. [leftChannel, rightChannel])
	 * @param blockSize - Number of frames in this block
	 */
	feedAudio(trackId: TrackId, data: Float32Array[], blockSize: number): void;
	/**
	 * Query the browser for available audio input devices.
	 * Returns a list of input devices with their capabilities.
	 */
	static getAvailableInputs(): Promise<AudioInputInfo[]>;
	/**
	 * Whether the recorder is currently recording on any track.
	 */
	get isRecording(): boolean;
	/**
	 * Get the list of track IDs that are currently being recorded.
	 */
	getActiveTrackIds(): TrackId[];
	/**
	 * Reset all state: clear active recordings, assignments, and take counters.
	 */
	reset(): void;
	/**
	 * Finalize a recording: merge accumulated chunks into a WAV blob
	 * and produce a RecordingResult.
	 */
	private _finalizeRecording;
	/**
	 * Encode per-channel Float32Array data into a WAV file Blob.
	 *
	 * Produces a standard RIFF/WAVE file with IEEE Float32 audio format.
	 * Header layout follows the canonical WAV specification.
	 *
	 * @param channels - Per-channel audio data arrays (all same length)
	 * @param sampleRate - Sample rate in Hz
	 * @param numChannels - Number of audio channels
	 */
	private static _encodeWav;
	/**
	 * Write an ASCII string into a DataView at the given byte offset.
	 */
	private static _writeString;
}
/**
 * Analysis results from the analyzer node.
 */
export interface ExportAnalysis {
	peakDb: number;
	rmsDb: number;
	lufs: number;
	truePeakDb: number;
	dcOffset: number;
	clippedSamples: number;
}
/**
 * A single processing node in the export graph.
 * Each node receives multi-channel audio (Float32Array[]) and returns processed arrays.
 */
export interface ExportNode {
	id: string;
	type: "source" | "normalize" | "limiter" | "dither" | "encoder" | "analyzer" | "silence_trim" | "gain" | "sample_rate_convert";
	process(buffer: Float32Array[], sampleRate: number): Float32Array[] | Promise<Float32Array[]>;
}
/**
 * Builds a dynamic processing chain for audio export.
 *
 * Instead of a fixed pipeline (as in OfflineExporter), ExportGraphBuilder
 * assembles an ordered sequence of ExportNode instances based on the
 * ExportConfig.  Custom nodes can be inserted at any position to extend
 * the chain without modifying the core logic.
 */
export declare class ExportGraphBuilder {
	private _nodes;
	private _sampleRate;
	private _channelCount;
	private _config;
	constructor(config: ExportConfig);
	/**
	 * Build the processing graph from an ExportConfig.
	 * Clears any existing nodes and re-creates the chain.
	 */
	buildFromConfig(config: ExportConfig): void;
	/**
	 * Add a node to the graph.
	 * @param node   The node to insert.
	 * @param position  Optional zero-based index. Appends if omitted.
	 */
	addNode(node: ExportNode, position?: number): void;
	/**
	 * Remove a node by id.
	 */
	removeNode(id: string): void;
	/**
	 * Get the current ordered list of nodes (read-only copy).
	 */
	getNodes(): ReadonlyArray<ExportNode>;
	/**
	 * Process multi-channel audio through every node in sequence.
	 */
	processBuffer(inputBuffer: Float32Array[]): Promise<Float32Array[]>;
	/**
	 * Encode the processed buffer into a Blob according to the config format.
	 * This is a lightweight wrapper that delegates to format-specific logic.
	 */
	encode(buffer: Float32Array[]): Promise<Blob>;
	/**
	 * Create a normalization node.
	 * @param mode        'peak' or 'lufs'
	 * @param targetLevel Target level in dB (peak) or LUFS
	 */
	static createNormalizeNode(mode: "peak" | "lufs", targetLevel: number): ExportNode;
	/**
	 * Create a true-peak limiter node.
	 * @param ceiling  Maximum true-peak level in dBTP (e.g. -1.0)
	 */
	static createTruePeakLimiterNode(ceiling: number): ExportNode;
	/**
	 * Create a dither node.
	 * @param type      'none', 'triangular', or 'shaped'
	 * @param bitDepth  Target bit depth (16 or 24)
	 */
	static createDitherNode(type: "none" | "triangular" | "shaped", bitDepth: number): ExportNode;
	/**
	 * Create a silence-trimming node.
	 * Removes leading and trailing silence below a threshold.
	 * @param thresholdDb  Silence threshold in dBFS (e.g. -60)
	 */
	static createSilenceTrimNode(thresholdDb: number): ExportNode;
	/**
	 * Create a gain node.
	 * @param gainDb  Gain in decibels
	 */
	static createGainNode(gainDb: number): ExportNode;
	/**
	 * Create a sample-rate conversion node.
	 * Uses linear interpolation for simplicity; a production implementation
	 * would use windowed sinc interpolation.
	 * @param fromRate  Source sample rate
	 * @param toRate    Target sample rate
	 */
	static createSampleRateConverter(fromRate: number, toRate: number): ExportNode;
	/**
	 * Create an analyzer node that measures audio characteristics
	 * without modifying the signal (pass-through).
	 */
	static createAnalyzerNode(): ExportNode & {
		getAnalysis(): ExportAnalysis;
	};
	/**
	 * Encode multi-channel Float32Array[] as a WAV Blob.
	 * Supports int16, int24, and float32.
	 */
	private _encodeWav;
	/**
	 * Wrap raw Float32 data in a generic Blob (placeholder for formats
	 * that require external encoders such as MP3, OGG, FLAC).
	 */
	private _encodeRaw;
	private _writeString;
}
/**
 * CD Marker Exporter
 *
 * Generates industry-standard marker/chapter files from CDMarker data.
 * Supports CUE sheets, cdrdao TOC files, and Nero-style MP4 chapter files.
 */
export declare class CDMarkerExporter {
	/**
	 * Generate a CUE sheet from CD markers.
	 *
	 * CUE format reference: https://en.wikipedia.org/wiki/Cue_sheet_(computing)
	 * Time format: MM:SS:FF where FF = CD frames (75 fps)
	 *
	 * @param markers     Array of CDMarker instances
	 * @param filename    Audio filename referenced in the CUE sheet
	 * @param sampleRate  Sample rate of the audio
	 * @param albumTitle  Optional album title
	 * @param albumPerformer  Optional album performer
	 */
	static generateCUE(markers: CDMarker[], filename: string, sampleRate: number, albumTitle?: string, albumPerformer?: string): string;
	/**
	 * Generate a cdrdao-compatible TOC (Table of Contents) file.
	 *
	 * TOC format reference: cdrdao(1) man page
	 *
	 * @param markers     Array of CDMarker instances
	 * @param filename    Audio filename
	 * @param sampleRate  Sample rate of the audio
	 */
	static generateTOC(markers: CDMarker[], filename: string, sampleRate: number): string;
	/**
	 * Generate Nero-style MP4 chapter metadata.
	 *
	 * Format: CHAPTERXX=HH:MM:SS.mmm / CHAPTERXXNAME=Title
	 * This format is understood by ffmpeg via -i chapters.txt.
	 *
	 * @param markers     Array of CDMarker instances
	 * @param sampleRate  Sample rate of the audio
	 */
	static generateMP4Chapters(markers: CDMarker[], sampleRate: number): string;
	/**
	 * Convert a sample-frame position to CD time format MM:SS:FF.
	 * CD frames run at 75 fps (Red Book standard).
	 *
	 * @param frames      Position in audio sample frames
	 * @param sampleRate  Audio sample rate (e.g. 44100)
	 * @returns           Time string in MM:SS:FF format
	 */
	static framesToCDTime(frames: number, sampleRate: number): string;
	/**
	 * Convert a sample-frame position to HH:MM:SS.mmm timestamp.
	 *
	 * @param frames      Position in audio sample frames
	 * @param sampleRate  Audio sample rate
	 * @returns           Time string in HH:MM:SS.mmm format
	 */
	static framesToTimestamp(frames: number, sampleRate: number): string;
}
/**
 * A partial export configuration used in presets.
 * Mirrors the relevant fields from ExportConfig.
 */
export interface ExportPresetConfig {
	format?: ExportFormat;
	sampleFormat?: ExportSampleFormat;
	sampleRate?: number;
	bitrate?: number;
	quality?: number;
	ditherType?: DitherType;
	normalize?: boolean;
	normalizeMode?: NormalizeMode;
	targetPeakDb?: number;
	targetLufs?: number;
	truePeakLimit?: boolean;
	truePeakCeiling?: number;
	exportMasterOnly?: boolean;
	stemExport?: boolean;
	splitMono?: boolean;
	filenameTemplate?: string;
	silencePaddingStart?: number;
	silencePaddingEnd?: number;
	trimSilence?: boolean;
	exportCdMarkers?: boolean;
	cdMarkerFormat?: "cue" | "toc" | "mp4ch";
	bwfMetadata?: boolean;
}
/**
 * A saved export configuration snapshot for quick recall.
 */
export interface ExportPreset {
	id: string;
	name: string;
	version: number;
	config: ExportPresetConfig;
	createdAt: string;
	updatedAt: string;
}
/**
 * Manages a collection of export presets, both user-created and built-in.
 */
export declare class ExportPresetManager {
	private _presets;
	/** Emitted whenever the preset list or any preset changes. */
	readonly presetsChanged: Signal<void>;
	constructor();
	/**
	 * Create a new preset from the given config.
	 */
	addPreset(name: string, config: ExportPresetConfig): ExportPreset;
	/**
	 * Update an existing preset's configuration.
	 */
	updatePreset(id: string, config: ExportPresetConfig): void;
	/**
	 * Remove a preset by id.
	 */
	removePreset(id: string): void;
	/**
	 * Get a single preset by id.
	 */
	getPreset(id: string): ExportPreset | undefined;
	/**
	 * Get all presets, sorted by name.
	 */
	getAllPresets(): ExportPreset[];
	/**
	 * Returns the built-in default presets covering common export workflows.
	 */
	static getDefaultPresets(): ExportPreset[];
	/**
	 * Serialize the preset manager to a JSON string for persistence.
	 */
	serialize(): string;
	/**
	 * Deserialize from a JSON string and return a new ExportPresetManager.
	 * User presets from the JSON are merged on top of the defaults.
	 */
	static deserialize(json: string): ExportPresetManager;
}
export interface Command {
	execute(): Promise<void>;
}
export interface ReversibleChange {
	undo(): Promise<void>;
	redo(): Promise<void>;
}
export interface UndoableCommand extends Command, ReversibleChange {
}
export interface HistoryEntry {
	command: ReversibleChange;
	label: string;
	timestamp: number;
}
/**
 * Serializable snapshot of the history (metadata only).
 * Full command re-execution is not supported after reload;
 * the snapshot is informational (labels + timestamps).
 */
export interface HistorySnapshot {
	undoEntries: Array<{
		label: string;
		timestamp: number;
	}>;
	redoEntries: Array<{
		label: string;
		timestamp: number;
	}>;
}
/**
 * Extended snapshot that includes serialized command data for entries whose
 * commands implement {@link SerializableCommand}.
 */
export interface SerializedHistorySnapshot {
	undoStack: string[];
	redoStack: string[];
}
/**
 * CommandHistory — manages undo/redo stacks with features:
 *
 * - Configurable depth limit (0 = unlimited, max 512)
 * - Transaction grouping (beginTransaction / commitTransaction / abortTransaction)
 * - Begin/End signals for UI synchronization
 * - Granular clear methods (clearUndo / clearRedo / clear)
 * - Dynamic labels (nextUndoLabel / nextRedoLabel)
 * - History snapshot serialization for persistence
 * - Batch undo/redo (undoMultiple / redoMultiple)
 * - Serialization support via CommandRegistry
 *
 */
export declare class CommandHistory {
	private undoStack;
	private redoStack;
	private _depth;
	private operationTail;
	private _activeTransaction;
	readonly historyChanged: Signal<void>;
	readonly beginUndoRedo: Signal<void>;
	readonly endUndoRedo: Signal<void>;
	get depth(): number;
	setDepth(d: number): void;
	get undoDepth(): number;
	get redoDepth(): number;
	private trimUndoStack;
	execute(command: UndoableCommand, label?: string): Promise<void>;
	/**
	 * 도메인 서비스가 이미 적용한 변경을 실행 없이 기록합니다.
	 * 기능 실행과 History 저장을 분리할 때 사용합니다.
	 */
	record(command: ReversibleChange, label?: string): Promise<void>;
	private store;
	private enqueueOperation;
	beginTransaction(name: string): void;
	addCommandToTransaction(cmd: UndoableCommand): void;
	commitTransaction(): Promise<void>;
	abortTransaction(): Promise<void>;
	get hasActiveTransaction(): boolean;
	undo(): Promise<void>;
	redo(): Promise<void>;
	private undoOne;
	private redoOne;
	/**
	 * Undo multiple transactions at once.
	 *
	 * This is more efficient than calling {@link undo} in a loop because it
	 * emits `beginUndoRedo` / `endUndoRedo` and `historyChanged` only once
	 * for the entire batch.
	 *
	 * @param count - Number of undo steps to perform.  Clamped to the
	 *   available undo depth.
	 */
	undoMultiple(count: number): Promise<void>;
	/**
	 * Redo multiple transactions at once.
	 *
	 * This is more efficient than calling {@link redo} in a loop because it
	 * emits `beginUndoRedo` / `endUndoRedo` and `historyChanged` only once
	 * for the entire batch.
	 *
	 * @param count - Number of redo steps to perform.  Clamped to the
	 *   available redo depth.
	 */
	redoMultiple(count: number): Promise<void>;
	get canUndo(): boolean;
	get canRedo(): boolean;
	/**
	 * Dynamic label for next undo action.
	 */
	get nextUndoLabel(): string;
	/**
	 * Dynamic label for next redo action.
	 */
	get nextRedoLabel(): string;
	/**
	 * Get the undo history stack (for UI display).
	 * Returns entries in execution order (oldest first).
	 */
	getUndoHistory(): ReadonlyArray<HistoryEntry>;
	/**
	 * Get the redo history stack.
	 * Returns entries in redo order (next to redo first).
	 */
	getRedoHistory(): ReadonlyArray<HistoryEntry>;
	/**
	 * Undo to a specific point in history (undo multiple steps).
	 */
	undoTo(index: number): Promise<void>;
	/**
	 * Get the current position in history (number of executed commands).
	 */
	get currentIndex(): number;
	/**
	 * Get total history size (undo + redo).
	 */
	get totalSize(): number;
	clearUndo(): void;
	clearRedo(): void;
	clear(): void;
	/**
	 * Serialize history metadata for persistence.
	 * @param depth Number of entries to save (0 = all, negative = all)
	 */
	getState(depth?: number): HistorySnapshot;
	/**
	 * Return a lightweight snapshot containing the transaction/command names
	 * from both stacks.
	 *
	 * This is useful for persisting history metadata (e.g. to show the user
	 * what operations were performed) without needing to serialize full
	 * command state.
	 *
	 * @returns An object with `undoStack` and `redoStack` arrays of label
	 *   strings.
	 */
	getSnapshot(): SerializedHistorySnapshot;
	/**
	 * Check whether all commands in the history implement
	 * {@link SerializableCommand}, meaning the full history could be
	 * serialized and later re-hydrated.
	 *
	 * @returns `true` if every entry's command has a `toJSON` method.
	 */
	canSerialize(): boolean;
	/**
	 * Type guard for checking if a command implements SerializableCommand.
	 */
	private isSerializable;
}
export declare const CommandType: {
	readonly PLAY: "PLAY";
	readonly PAUSE: "PAUSE";
	readonly STOP: "STOP";
	readonly ADD_TRACK: "ADD_TRACK";
	readonly REMOVE_TRACK: "REMOVE_TRACK";
	readonly ADD_REGION: "ADD_REGION";
	readonly ADD_PLUGIN: "ADD_PLUGIN";
	readonly REMOVE_PLUGIN: "REMOVE_PLUGIN";
	readonly SET_PLUGIN_PARAMETER: "SET_PLUGIN_PARAMETER";
	readonly ADD_AUTOMATION: "ADD_AUTOMATION";
	readonly UNDO: "UNDO";
	readonly REDO: "REDO";
	readonly SELECTION_UNDO: "SELECTION_UNDO";
	readonly SELECTION_REDO: "SELECTION_REDO";
	readonly START_RECORDING: "START_RECORDING";
	readonly STOP_RECORDING: "STOP_RECORDING";
	readonly TOGGLE_METRONOME: "TOGGLE_METRONOME";
	readonly ADD_SOURCE: "ADD_SOURCE";
	readonly SET_VOLUME: "SET_VOLUME";
	readonly SET_PAN: "SET_PAN";
	readonly MUTE_TRACK: "MUTE_TRACK";
	readonly SOLO_TRACK: "SOLO_TRACK";
	readonly REMOVE_REGION: "REMOVE_REGION";
	readonly MOVE_REGION: "MOVE_REGION";
	readonly RESIZE_REGION: "RESIZE_REGION";
	readonly SET_TEMPO: "SET_TEMPO";
	readonly SET_TIME_SIGNATURE: "SET_TIME_SIGNATURE";
	readonly ARM_TRACK: "ARM_TRACK";
	readonly SET_TRACK_MONITOR: "SET_TRACK_MONITOR";
	readonly MOVE_AUTOMATION_POINT: "MOVE_AUTOMATION_POINT";
	readonly REMOVE_AUTOMATION_POINT: "REMOVE_AUTOMATION_POINT";
	readonly CONNECT_IO: "CONNECT_IO";
	readonly DISCONNECT_IO: "DISCONNECT_IO";
	readonly SEEK: "SEEK";
	readonly EXPORT: "EXPORT";
	readonly OPEN_EXPORT_DIALOG: "OPEN_EXPORT_DIALOG";
	readonly DEBUG_SESSION: "DEBUG_SESSION";
	readonly ADD_RANGE: "ADD_RANGE";
	readonly REMOVE_RANGE: "REMOVE_RANGE";
	readonly SET_RANGE: "SET_RANGE";
	readonly LIST_RANGES: "LIST_RANGES";
	readonly SET_LOOP_RANGE: "SET_LOOP_RANGE";
	readonly TOGGLE_LOOP: "TOGGLE_LOOP";
	readonly SET_PUNCH_RANGE: "SET_PUNCH_RANGE";
	readonly SET_GRID: "SET_GRID";
	readonly GET_GRID: "GET_GRID";
	readonly COPY_REGION: "COPY_REGION";
	readonly PASTE_REGION: "PASTE_REGION";
	readonly DUPLICATE_REGION: "DUPLICATE_REGION";
	readonly SPLIT_REGION: "SPLIT_REGION";
	readonly SPLIT_AT_PLAYHEAD: "SPLIT_AT_PLAYHEAD";
	readonly SELECT_REGION: "SELECT_REGION";
	readonly CLEAR_SELECTION: "CLEAR_SELECTION";
	readonly SET_REGION_TIME_DOMAIN: "SET_REGION_TIME_DOMAIN";
	readonly TRIM_REGION: "TRIM_REGION";
	readonly TRIM_REGION_TO_PLAYHEAD: "TRIM_REGION_TO_PLAYHEAD";
	readonly TRIM_REGION_TO_RANGE: "TRIM_REGION_TO_RANGE";
	readonly TRIM_TO_ADJACENT_REGION: "TRIM_TO_ADJACENT_REGION";
	readonly SET_REGION_FADES: "SET_REGION_FADES";
	readonly SET_REGION_LAYER: "SET_REGION_LAYER";
	readonly SET_REGION_OPAQUE: "SET_REGION_OPAQUE";
	readonly MERGE_REGIONS: "MERGE_REGIONS";
	readonly SELECT_REGIONS: "SELECT_REGIONS";
	readonly ADD_SEND_BUS: "ADD_SEND_BUS";
	readonly REMOVE_SEND_BUS: "REMOVE_SEND_BUS";
	readonly SET_SEND_LEVEL: "SET_SEND_LEVEL";
	readonly SAVE_SESSION: "SAVE_SESSION";
	readonly LOAD_SESSION: "LOAD_SESSION";
	readonly NEW_SESSION: "NEW_SESSION";
	readonly SAVE_SNAPSHOT: "SAVE_SNAPSHOT";
	readonly ADD_MARKER: "ADD_MARKER";
	readonly REMOVE_MARKER: "REMOVE_MARKER";
	readonly MOVE_MARKER: "MOVE_MARKER";
	readonly LIST_MARKERS: "LIST_MARKERS";
	readonly GOTO_NEXT_MARKER: "GOTO_NEXT_MARKER";
	readonly GOTO_PREV_MARKER: "GOTO_PREV_MARKER";
	readonly SET_TRACK_COLOR: "SET_TRACK_COLOR";
	readonly REORDER_TRACK: "REORDER_TRACK";
	readonly BOUNCE_TRACK: "BOUNCE_TRACK";
	readonly ENABLE_PUNCH: "ENABLE_PUNCH";
	readonly SET_LOOP_RECORDING: "SET_LOOP_RECORDING";
	readonly SET_PRE_ROLL: "SET_PRE_ROLL";
	readonly SET_MONITOR_WITH_EFFECTS: "SET_MONITOR_WITH_EFFECTS";
	readonly LOCK_REGION: "LOCK_REGION";
	readonly SET_RIPPLE_EDIT: "SET_RIPPLE_EDIT";
	readonly AUDITION_REGION: "AUDITION_REGION";
	readonly STOP_AUDITION: "STOP_AUDITION";
	readonly GROUP_REGIONS: "GROUP_REGIONS";
	readonly UNGROUP_REGIONS: "UNGROUP_REGIONS";
	readonly FREEZE_TRACK: "FREEZE_TRACK";
	readonly UNFREEZE_TRACK: "UNFREEZE_TRACK";
	readonly STRIP_SILENCE: "STRIP_SILENCE";
	readonly NORMALIZE_REGION: "NORMALIZE_REGION";
	readonly SET_REGION_PLAYBACK_RATE: "SET_REGION_PLAYBACK_RATE";
	readonly TIME_STRETCH_REGION: "TIME_STRETCH_REGION";
	readonly REVERSE_REGION: "REVERSE_REGION";
	readonly ADD_MIDI_NOTE: "ADD_MIDI_NOTE";
	readonly REMOVE_MIDI_NOTE: "REMOVE_MIDI_NOTE";
	readonly MOVE_MIDI_NOTE: "MOVE_MIDI_NOTE";
	readonly RESIZE_MIDI_NOTE: "RESIZE_MIDI_NOTE";
	readonly QUANTIZE_MIDI: "QUANTIZE_MIDI";
	readonly TRANSPOSE_MIDI: "TRANSPOSE_MIDI";
	readonly SET_MIDI_INSTRUMENT: "SET_MIDI_INSTRUMENT";
	readonly ADD_AUX_TRACK: "ADD_AUX_TRACK";
	readonly ADD_BUS_TRACK: "ADD_BUS_TRACK";
	readonly ADD_TEMPO_CHANGE: "ADD_TEMPO_CHANGE";
	readonly REMOVE_TEMPO_CHANGE: "REMOVE_TEMPO_CHANGE";
	readonly SET_MIDI_INPUT_DEVICE: "SET_MIDI_INPUT_DEVICE";
	readonly APPLY_PLUGIN_PRESET: "APPLY_PLUGIN_PRESET";
	readonly SAVE_PLUGIN_PRESET: "SAVE_PLUGIN_PRESET";
	readonly EXPORT_STEMS: "EXPORT_STEMS";
	readonly SAVE_EXPORT_PRESET: "SAVE_EXPORT_PRESET";
	readonly DELETE_EXPORT_PRESET: "DELETE_EXPORT_PRESET";
	readonly LOAD_EXPORT_PRESET: "LOAD_EXPORT_PRESET";
	readonly IMPORT_MIDI: "IMPORT_MIDI";
	readonly EXPORT_MIDI: "EXPORT_MIDI";
	readonly CREATE_TRACK_GROUP: "CREATE_TRACK_GROUP";
	readonly DELETE_TRACK_GROUP: "DELETE_TRACK_GROUP";
	readonly ADD_TO_TRACK_GROUP: "ADD_TO_TRACK_GROUP";
	readonly REMOVE_FROM_TRACK_GROUP: "REMOVE_FROM_TRACK_GROUP";
	readonly SET_TRACK_PARENT: "SET_TRACK_PARENT";
	readonly ADD_VCA_TRACK: "ADD_VCA_TRACK";
	readonly REMOVE_VCA_TRACK: "REMOVE_VCA_TRACK";
	readonly SET_VCA_GAIN: "SET_VCA_GAIN";
	readonly ASSIGN_TO_VCA: "ASSIGN_TO_VCA";
	readonly SET_TRANSPORT_MODE: "SET_TRANSPORT_MODE";
	readonly ADD_CD_MARKER: "ADD_CD_MARKER";
	readonly REMOVE_CD_MARKER: "REMOVE_CD_MARKER";
	readonly GENERATE_CUE_SHEET: "GENERATE_CUE_SHEET";
	readonly SET_SIDECHAIN_SOURCE: "SET_SIDECHAIN_SOURCE";
	readonly SAVE_MIXER_SCENE: "SAVE_MIXER_SCENE";
	readonly RECALL_MIXER_SCENE: "RECALL_MIXER_SCENE";
	readonly DELETE_MIXER_SCENE: "DELETE_MIXER_SCENE";
	readonly SET_TRACK_MONITOR_MODE: "SET_TRACK_MONITOR_MODE";
	readonly SET_TRACK_TRIM_GAIN: "SET_TRACK_TRIM_GAIN";
	readonly SET_TRACK_SOLO_ISOLATE: "SET_TRACK_SOLO_ISOLATE";
	readonly SET_TRACK_SOLO_SAFE: "SET_TRACK_SOLO_SAFE";
	readonly SET_TRACK_COMMENT: "SET_TRACK_COMMENT";
	readonly SET_TRACK_RECORD_MODE: "SET_TRACK_RECORD_MODE";
	readonly SET_TRACK_PAN_WIDTH: "SET_TRACK_PAN_WIDTH";
	readonly SET_AUTOMATION_MODE: "SET_AUTOMATION_MODE";
	readonly RENAME_MIXER_SCENE: "RENAME_MIXER_SCENE";
	readonly RENAME_MARKER: "RENAME_MARKER";
	readonly SET_MARKER_LOCKED: "SET_MARKER_LOCKED";
	readonly SET_MOUSE_MODE: "SET_MOUSE_MODE";
	readonly SET_EDIT_MODE: "SET_EDIT_MODE";
	readonly SET_ZOOM_FOCUS: "SET_ZOOM_FOCUS";
	readonly ZOOM_TO_FIT: "ZOOM_TO_FIT";
	readonly SET_FOLLOW_PLAYHEAD: "SET_FOLLOW_PLAYHEAD";
	readonly SET_TRACK_HEIGHT: "SET_TRACK_HEIGHT";
	readonly TOGGLE_RULER: "TOGGLE_RULER";
};
declare const AudioCommandSchema: z.ZodDiscriminatedUnion<[
	z.ZodObject<{
		type: z.ZodLiteral<"PLAY">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"PAUSE">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"STOP">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_TRACK">;
		payload: z.ZodObject<{
			name: z.ZodString;
			trackType: z.ZodDefault<z.ZodEnum<{
				audio: "audio";
				instrument: "instrument";
			}>>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_TRACK">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_REGION">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			start: z.ZodNumber;
			duration: z.ZodNumber;
			sourceUrl: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_PLUGIN">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			pluginId: z.ZodString;
			index: z.ZodOptional<z.ZodNumber>;
			position: z.ZodOptional<z.ZodEnum<{
				pre: "pre";
				post: "post";
			}>>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_PLUGIN">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			processorId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_PLUGIN_PARAMETER">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			processorId: z.ZodString;
			parameterId: z.ZodString;
			value: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"UNDO">;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REDO">;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SELECTION_UNDO">;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SELECTION_REDO">;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_AUTOMATION">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			processorId: z.ZodString;
			parameter: z.ZodString;
			time: z.ZodNumber;
			value: z.ZodNumber;
			interpolation: z.ZodOptional<z.ZodEnum<{
				Linear: "Linear";
				Exponential: "Exponential";
				Hold: "Hold";
			}>>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"START_RECORDING">;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"STOP_RECORDING">;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"TOGGLE_METRONOME">;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_SOURCE">;
		payload: z.ZodObject<{
			id: z.ZodString;
			name: z.ZodString;
			url: z.ZodString;
			duration: z.ZodNumber;
			trackId: z.ZodOptional<z.ZodString>;
			start: z.ZodOptional<z.ZodNumber>;
			videoMetadata: z.ZodOptional<z.ZodObject<{
				fps: z.ZodNumber;
				width: z.ZodNumber;
				height: z.ZodNumber;
				codec: z.ZodString;
				format: z.ZodString;
				frameCount: z.ZodNumber;
				hasAudio: z.ZodBoolean;
				thumbnailUrl: z.ZodOptional<z.ZodString>;
				originalVideoUrl: z.ZodString;
			}, z.core.$strip>>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_VOLUME">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			volume: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_PAN">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			pan: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"MUTE_TRACK">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			mute: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SOLO_TRACK">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			solo: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_REGION">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"MOVE_REGION">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			newStart: z.ZodNumber;
			targetTrackId: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"RESIZE_REGION">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			newLength: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"TRIM_REGION">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			amount: z.ZodNumber;
			direction: z.ZodEnum<{
				front: "front";
				back: "back";
			}>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_REGION_FADES">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			fadeIn: z.ZodOptional<z.ZodNumber>;
			fadeOut: z.ZodOptional<z.ZodNumber>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_REGION_LAYER">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			layer: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_REGION_OPAQUE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			opaque: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"MERGE_REGIONS">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionIds: z.ZodArray<z.ZodString>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TEMPO">;
		payload: z.ZodObject<{
			bpm: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TIME_SIGNATURE">;
		payload: z.ZodObject<{
			numerator: z.ZodNumber;
			denominator: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ARM_TRACK">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			armed: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRACK_MONITOR">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			monitor: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SEEK">;
		payload: z.ZodObject<{
			time: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"CONNECT_IO">;
		payload: z.ZodObject<{
			sourceId: z.ZodString;
			destId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"DISCONNECT_IO">;
		payload: z.ZodObject<{
			sourceId: z.ZodString;
			destId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"MOVE_AUTOMATION_POINT">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			processorId: z.ZodString;
			parameter: z.ZodString;
			pointId: z.ZodString;
			newTime: z.ZodNumber;
			newValue: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_AUTOMATION_POINT">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			processorId: z.ZodString;
			parameter: z.ZodString;
			pointId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"EXPORT">;
		payload: z.ZodOptional<z.ZodObject<{
			filename: z.ZodOptional<z.ZodString>;
			format: z.ZodOptional<z.ZodEnum<{
				ogg: "ogg";
				wav: "wav";
				mp3: "mp3";
				flac: "flac";
			}>>;
			sampleFormat: z.ZodOptional<z.ZodEnum<{
				int16: "int16";
				int24: "int24";
				float32: "float32";
			}>>;
			normalize: z.ZodOptional<z.ZodBoolean>;
			rangeId: z.ZodOptional<z.ZodString>;
			startFrame: z.ZodOptional<z.ZodNumber>;
			endFrame: z.ZodOptional<z.ZodNumber>;
		}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"OPEN_EXPORT_DIALOG">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$loose>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"DEBUG_SESSION">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_RANGE">;
		payload: z.ZodObject<{
			name: z.ZodString;
			start: z.ZodNumber;
			end: z.ZodNumber;
			color: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_RANGE">;
		payload: z.ZodObject<{
			rangeId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_RANGE">;
		payload: z.ZodObject<{
			rangeId: z.ZodString;
			name: z.ZodOptional<z.ZodString>;
			start: z.ZodOptional<z.ZodNumber>;
			end: z.ZodOptional<z.ZodNumber>;
			color: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"LIST_RANGES">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_LOOP_RANGE">;
		payload: z.ZodOptional<z.ZodObject<{
			rangeId: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"TOGGLE_LOOP">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_PUNCH_RANGE">;
		payload: z.ZodOptional<z.ZodObject<{
			rangeId: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_GRID">;
		payload: z.ZodOptional<z.ZodObject<{
			gridType: z.ZodOptional<z.ZodString>;
			snapMode: z.ZodOptional<z.ZodString>;
			snapToGrid: z.ZodOptional<z.ZodBoolean>;
			bpm: z.ZodOptional<z.ZodNumber>;
		}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"GET_GRID">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"COPY_REGION">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"PASTE_REGION">;
		payload: z.ZodOptional<z.ZodObject<{
			trackId: z.ZodOptional<z.ZodString>;
			position: z.ZodOptional<z.ZodNumber>;
		}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"DUPLICATE_REGION">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SPLIT_REGION">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			position: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SPLIT_AT_PLAYHEAD">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SELECT_REGION">;
		payload: z.ZodObject<{
			regionId: z.ZodString;
			addToSelection: z.ZodOptional<z.ZodBoolean>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SELECT_REGIONS">;
		payload: z.ZodObject<{
			regionIds: z.ZodArray<z.ZodString>;
			addToSelection: z.ZodOptional<z.ZodBoolean>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"CLEAR_SELECTION">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_REGION_TIME_DOMAIN">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			timeDomain: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_SEND_BUS">;
		payload: z.ZodObject<{
			sourceTrackId: z.ZodString;
			destId: z.ZodString;
			level: z.ZodOptional<z.ZodNumber>;
			preFader: z.ZodOptional<z.ZodBoolean>;
			id: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_SEND_BUS">;
		payload: z.ZodObject<{
			sendBusId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_SEND_LEVEL">;
		payload: z.ZodObject<{
			sendBusId: z.ZodString;
			level: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SAVE_SESSION">;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"LOAD_SESSION">;
		payload: z.ZodObject<{
			sessionId: z.ZodOptional<z.ZodString>;
			snapshot: z.ZodOptional<z.ZodObject<{
				id: z.ZodString;
				name: z.ZodString;
				sampleRate: z.ZodNumber;
				tempo: z.ZodNumber;
				timeSignature: z.ZodTuple<[
					z.ZodNumber,
					z.ZodNumber
				], null>;
				transportFrame: z.ZodNumber;
				tracks: z.ZodArray<z.ZodObject<{
					id: z.ZodString;
					name: z.ZodString;
					type: z.ZodString;
					armed: z.ZodBoolean;
					mute: z.ZodBoolean;
					solo: z.ZodBoolean;
					color: z.ZodOptional<z.ZodString>;
					regions: z.ZodArray<z.ZodObject<{
						id: z.ZodString;
						sourceId: z.ZodString;
						name: z.ZodString;
						start: z.ZodNumber;
						length: z.ZodNumber;
						sourceStart: z.ZodNumber;
						gain: z.ZodNumber;
						muted: z.ZodBoolean;
						layer: z.ZodNumber;
						fadeIn: z.ZodNumber;
						fadeOut: z.ZodNumber;
						playbackRate: z.ZodNumber;
						timeDomain: z.ZodNumber;
						locked: z.ZodOptional<z.ZodBoolean>;
					}, z.core.$strip>>;
					midiRegions: z.ZodOptional<z.ZodArray<z.ZodObject<{
						id: z.ZodString;
						name: z.ZodString;
						start: z.ZodNumber;
						length: z.ZodNumber;
						muted: z.ZodBoolean;
						layer: z.ZodNumber;
						locked: z.ZodOptional<z.ZodBoolean>;
						timeDomain: z.ZodOptional<z.ZodNumber>;
						notes: z.ZodArray<z.ZodObject<{
							id: z.ZodString;
							pitch: z.ZodNumber;
							velocity: z.ZodNumber;
							startFrame: z.ZodNumber;
							durationFrames: z.ZodNumber;
							channel: z.ZodNumber;
						}, z.core.$strip>>;
					}, z.core.$strip>>>;
				}, z.core.$strip>>;
				ranges: z.ZodArray<z.ZodObject<{
					id: z.ZodString;
					name: z.ZodString;
					start: z.ZodNumber;
					end: z.ZodNumber;
				}, z.core.$strip>>;
				sendBuses: z.ZodArray<z.ZodObject<{
					id: z.ZodString;
					sourceTrackId: z.ZodString;
					destId: z.ZodString;
					level: z.ZodNumber;
					preFader: z.ZodBoolean;
					active: z.ZodBoolean;
				}, z.core.$strip>>;
				markers: z.ZodOptional<z.ZodArray<z.ZodObject<{
					id: z.ZodString;
					name: z.ZodString;
					position: z.ZodNumber;
					color: z.ZodString;
					locked: z.ZodBoolean;
				}, z.core.$strip>>>;
				loopRangeId: z.ZodOptional<z.ZodString>;
				loopEnabled: z.ZodBoolean;
				punchRangeId: z.ZodOptional<z.ZodString>;
				punchEnabled: z.ZodOptional<z.ZodBoolean>;
				preRollBars: z.ZodOptional<z.ZodNumber>;
				loopRecordingEnabled: z.ZodOptional<z.ZodBoolean>;
				rippleEdit: z.ZodOptional<z.ZodBoolean>;
				regionGroups: z.ZodOptional<z.ZodArray<z.ZodObject<{
					id: z.ZodString;
					name: z.ZodString;
					regionIds: z.ZodArray<z.ZodString>;
				}, z.core.$strip>>>;
				tempoMapEvents: z.ZodOptional<z.ZodArray<z.ZodObject<{
					frame: z.ZodNumber;
					bpm: z.ZodNumber;
					timeSigNum: z.ZodOptional<z.ZodNumber>;
					timeSigDen: z.ZodOptional<z.ZodNumber>;
				}, z.core.$strip>>>;
				mixerScenes: z.ZodOptional<z.ZodArray<z.ZodObject<{
					id: z.ZodString;
					name: z.ZodString;
					createdAt: z.ZodNumber;
					tracks: z.ZodArray<z.ZodObject<{
						trackId: z.ZodString;
						volume: z.ZodNumber;
						pan: z.ZodNumber;
						mute: z.ZodBoolean;
						solo: z.ZodBoolean;
						pluginParameters: z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodNumber>>;
					}, z.core.$strip>>;
				}, z.core.$strip>>>;
			}, z.core.$strip>>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"NEW_SESSION">;
		payload: z.ZodOptional<z.ZodObject<{
			name: z.ZodOptional<z.ZodString>;
			templateId: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SAVE_SNAPSHOT">;
		payload: z.ZodObject<{
			name: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_MARKER">;
		payload: z.ZodObject<{
			name: z.ZodString;
			position: z.ZodNumber;
			color: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_MARKER">;
		payload: z.ZodObject<{
			markerId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"MOVE_MARKER">;
		payload: z.ZodObject<{
			markerId: z.ZodString;
			position: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"LIST_MARKERS">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"GOTO_NEXT_MARKER">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"GOTO_PREV_MARKER">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRACK_COLOR">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			color: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REORDER_TRACK">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			newIndex: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"BOUNCE_TRACK">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ENABLE_PUNCH">;
		payload: z.ZodObject<{
			enabled: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_LOOP_RECORDING">;
		payload: z.ZodObject<{
			enabled: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_PRE_ROLL">;
		payload: z.ZodObject<{
			bars: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_MONITOR_WITH_EFFECTS">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			enabled: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"LOCK_REGION">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			locked: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_RIPPLE_EDIT">;
		payload: z.ZodObject<{
			enabled: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"AUDITION_REGION">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"STOP_AUDITION">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"GROUP_REGIONS">;
		payload: z.ZodObject<{
			regionIds: z.ZodArray<z.ZodString>;
			name: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"UNGROUP_REGIONS">;
		payload: z.ZodObject<{
			groupId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"FREEZE_TRACK">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"UNFREEZE_TRACK">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"STRIP_SILENCE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			thresholdDb: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
			minLengthFrames: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"NORMALIZE_REGION">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			targetDb: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_REGION_PLAYBACK_RATE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			playbackRate: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REVERSE_REGION">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_MIDI_NOTE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			pitch: z.ZodNumber;
			velocity: z.ZodDefault<z.ZodNumber>;
			startFrame: z.ZodNumber;
			durationFrames: z.ZodNumber;
			channel: z.ZodDefault<z.ZodNumber>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_MIDI_NOTE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			noteId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"MOVE_MIDI_NOTE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			noteId: z.ZodString;
			newStartFrame: z.ZodOptional<z.ZodNumber>;
			newPitch: z.ZodOptional<z.ZodNumber>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"RESIZE_MIDI_NOTE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			noteId: z.ZodString;
			newDurationFrames: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"QUANTIZE_MIDI">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			subdivisionFrames: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"TRANSPOSE_MIDI">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			regionId: z.ZodString;
			semitones: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_MIDI_INSTRUMENT">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			instrumentType: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_AUX_TRACK">;
		payload: z.ZodObject<{
			name: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_BUS_TRACK">;
		payload: z.ZodObject<{
			name: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_TEMPO_CHANGE">;
		payload: z.ZodObject<{
			frame: z.ZodNumber;
			bpm: z.ZodNumber;
			timeSigNum: z.ZodOptional<z.ZodNumber>;
			timeSigDen: z.ZodOptional<z.ZodNumber>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_TEMPO_CHANGE">;
		payload: z.ZodObject<{
			frame: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_MIDI_INPUT_DEVICE">;
		payload: z.ZodObject<{
			inputId: z.ZodNullable<z.ZodString>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"APPLY_PLUGIN_PRESET">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			processorId: z.ZodString;
			presetId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SAVE_PLUGIN_PRESET">;
		payload: z.ZodObject<{
			name: z.ZodString;
			pluginId: z.ZodString;
			trackId: z.ZodString;
			processorId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"EXPORT_STEMS">;
		payload: z.ZodOptional<z.ZodObject<{
			filename: z.ZodOptional<z.ZodString>;
			format: z.ZodOptional<z.ZodEnum<{
				ogg: "ogg";
				wav: "wav";
				mp3: "mp3";
				flac: "flac";
			}>>;
			normalize: z.ZodOptional<z.ZodBoolean>;
		}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SAVE_MIXER_SCENE">;
		payload: z.ZodObject<{
			name: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"RECALL_MIXER_SCENE">;
		payload: z.ZodObject<{
			sceneId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"DELETE_MIXER_SCENE">;
		payload: z.ZodObject<{
			sceneId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"CREATE_TRACK_GROUP">;
		payload: z.ZodObject<{
			name: z.ZodString;
			trackIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"DELETE_TRACK_GROUP">;
		payload: z.ZodObject<{
			groupId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_TO_TRACK_GROUP">;
		payload: z.ZodObject<{
			groupId: z.ZodString;
			trackId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_FROM_TRACK_GROUP">;
		payload: z.ZodObject<{
			groupId: z.ZodString;
			trackId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRACK_PARENT">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			parentId: z.ZodNullable<z.ZodString>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_VCA_TRACK">;
		payload: z.ZodObject<{
			name: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_VCA_TRACK">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_VCA_GAIN">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			gain: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ASSIGN_TO_VCA">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			vcaTrackId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRANSPORT_MODE">;
		payload: z.ZodObject<{
			mode: z.ZodEnum<{
				normal: "normal";
				scrub: "scrub";
				shuttle: "shuttle";
			}>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ADD_CD_MARKER">;
		payload: z.ZodObject<{
			name: z.ZodString;
			position: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"REMOVE_CD_MARKER">;
		payload: z.ZodObject<{
			markerId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"GENERATE_CUE_SHEET">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_SIDECHAIN_SOURCE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			sourceTrackId: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRACK_PAN_WIDTH">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			width: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_AUTOMATION_MODE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			processorId: z.ZodString;
			parameter: z.ZodString;
			mode: z.ZodEnum<{
				off: "off";
				write: "write";
				read: "read";
				touch: "touch";
				latch: "latch";
			}>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"RENAME_MIXER_SCENE">;
		payload: z.ZodObject<{
			sceneId: z.ZodString;
			name: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"RENAME_MARKER">;
		payload: z.ZodObject<{
			markerId: z.ZodString;
			name: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_MARKER_LOCKED">;
		payload: z.ZodObject<{
			markerId: z.ZodString;
			locked: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRACK_MONITOR_MODE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			mode: z.ZodEnum<{
				input: "input";
				auto: "auto";
				external: "external";
				disk: "disk";
			}>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRACK_RECORD_MODE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			mode: z.ZodEnum<{
				sound_on_sound: "sound_on_sound";
				non_layered: "non_layered";
				layered: "layered";
			}>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRACK_TRIM_GAIN">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			trimGainDb: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRACK_SOLO_ISOLATE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			isolate: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRACK_SOLO_SAFE">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			safe: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRACK_COMMENT">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			comment: z.ZodString;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_MOUSE_MODE">;
		payload: z.ZodObject<{
			mode: z.ZodEnum<{
				object: "object";
				content: "content";
				cut: "cut";
				range: "range";
				draw: "draw";
				audition: "audition";
				stretch: "stretch";
				internal_edit: "internal_edit";
			}>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_EDIT_MODE">;
		payload: z.ZodObject<{
			mode: z.ZodEnum<{
				slide: "slide";
				ripple: "ripple";
				lock: "lock";
			}>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_ZOOM_FOCUS">;
		payload: z.ZodObject<{
			focus: z.ZodEnum<{
				center: "center";
				left: "left";
				right: "right";
				playhead: "playhead";
				mouse: "mouse";
				edit_point: "edit_point";
			}>;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"ZOOM_TO_FIT">;
		payload: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_FOLLOW_PLAYHEAD">;
		payload: z.ZodObject<{
			follow: z.ZodBoolean;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"SET_TRACK_HEIGHT">;
		payload: z.ZodObject<{
			trackId: z.ZodString;
			height: z.ZodNumber;
		}, z.core.$strip>;
	}, z.core.$strip>,
	z.ZodObject<{
		type: z.ZodLiteral<"TOGGLE_RULER">;
		payload: z.ZodObject<{
			ruler: z.ZodEnum<{
				timecode: "timecode";
				minsec: "minsec";
				samples: "samples";
				bbt: "bbt";
				markers: "markers";
				ranges: "ranges";
				tempo: "tempo";
			}>;
		}, z.core.$strip>;
	}, z.core.$strip>
], "type">;
export type AudioCommand = z.infer<typeof AudioCommandSchema>;
/**
 * Payload type for command handlers. Zod schema validation ensures type safety
 * at runtime; this interface allows flexible property access within handlers.
 */
export interface CommandHandlerPayload {
	[key: string]: string | number | boolean | string[] | Record<string, unknown> | null | undefined;
}
/**
 * Command Handler Base Interface
 *
 * 각 Handler는 특정 카테고리의 command를 처리합니다.
 * - TransportHandler: 재생/정지/녹음
 * - TrackHandler: 트랙 관리
 * - RegionHandler: Region 편집
 * - RangeHandler: Range 관리
 * - AutomationHandler: Automation
 * - ExportHandler: Export
 */
export interface CommandHandler {
	/**
	 * Command를 처리할 수 있는지 확인
	 */
	canHandle(commandType: string): boolean;
	/**
	 * Command 실행
	 */
	execute(commandType: string, payload: CommandHandlerPayload | undefined, audioEngine: AudioEngine, history: CommandHistory): Promise<CommandResult>;
}
export interface CommandResult {
	success: boolean;
	message: string;
	data?: unknown;
}
/**
 * Command Executor (Refactored)
 *
 * 리팩토링된 Command Executor.
 * 각 카테고리별로 Handler에게 위임하여 코드를 간결하게 유지합니다.
 *
 * Before: 628 라인 (단일 파일)
 * After: ~100 라인 (메인) + 8개 핸들러 (각 50-150 라인)
 */
export declare class CommandExecutor {
	private static instance;
	private audioEngine;
	private _history;
	private handlers;
	readonly commandExecuted: Signal<{
		type: string;
		payload?: CommandHandlerPayload;
	}>;
	private constructor();
	registerHandler(handler: CommandHandler): void;
	static getInstance(): CommandExecutor;
	get history(): CommandHistory;
	/**
	 * Command 실행
	 *
	 * 1. Zod로 검증
	 * 2. AudioEngine 초기화
	 * 3. 적절한 Handler 찾기
	 * 4. Handler에게 위임
	 */
	execute(commandJson: unknown, history?: CommandHistory): Promise<CommandResult>;
}
/**
 * Optional cleanup callback type.
 *
 * A cleanup function is invoked when the command it is associated with is
 * removed or invalidated — for example via {@link UndoTransaction.removeCommand}.
 * This allows callers to release external resources (e.g. cached buffers,
 * temporary files) that were tied to the command's lifecycle.
 */
export type CommandCleanup = () => void;
/**
 * UndoTransaction groups multiple commands into one atomic undo step.
 *
 * On undo, commands are reversed in reverse order.
 * On redo, commands are re-executed in forward order.
 *
 * - Optional `cleanup` callback per command, called when a command is
 *   removed or the transaction is cleared.
 * - {@link removeCommand} for invalidating individual commands mid-transaction.
 */
export declare class UndoTransaction implements UndoableCommand {
	private entries;
	private _name;
	private _timestamp;
	constructor(name: string);
	get name(): string;
	get timestamp(): number;
	get empty(): boolean;
	get size(): number;
	/**
	 * Append a command to this transaction.
	 *
	 * @param cmd     - The undoable command to add.
	 * @param cleanup - Optional callback invoked when the command is removed
	 *                  or invalidated (e.g. via {@link removeCommand}).
	 */
	addCommand(cmd: UndoableCommand, cleanup?: CommandCleanup): void;
	/**
	 * Remove (invalidate) the command at the given index.
	 *
	 * If the entry has a cleanup callback it will be invoked before the
	 * entry is removed.
	 *
	 * @param index - Zero-based index of the command to remove.
	 * @throws {RangeError} If the index is out of bounds.
	 */
	removeCommand(index: number): void;
	execute(): Promise<void>;
	undo(): Promise<void>;
	redo(): Promise<void>;
}
export interface RegionMoveRequest {
	session: Session;
	trackId: TrackId;
	regionId: RegionId;
	newStart: FrameCount;
	targetTrackId?: TrackId;
}
export declare function moveRegionAndCreateTransaction(request: RegionMoveRequest): UndoTransaction;
/**
 * Coefficients for a single cubic spline segment.
 * The polynomial is: y = a + b*x + c*x^2 + d*x^3
 * where x is the local offset from the segment start time.
 */
export interface SplineCoefficients {
	a: number;
	b: number;
	c: number;
	d: number;
}
/**
 * Provides interpolation between automation points, including a CJC Kruger
 * constrained cubic spline algorithm that prevents overshoot.
 */
export declare class AutomationCurve {
	/** Cached spline coefficients, one per segment (points.length - 1). */
	private _splineCoeffs;
	/** The points array snapshot used to compute the current coefficients. */
	private _splinePoints;
	/**
	 * Calculates the interpolated value between two points at a given time.
	 * For non-spline interpolation types, this static method is sufficient.
	 * @param start The starting automation point
	 * @param end The ending automation point
	 * @param time The time to calculate the value for (must be between start.time and end.time)
	 * @param _curvature Optional tension/curvature parameter (not yet implemented fully)
	 */
	static getValueAt(start: AutomationPoint, end: AutomationPoint, time: number, _curvature?: number): number;
	/**
	 * Recomputes CJC Kruger constrained cubic spline coefficients for the
	 * given set of points. Must be called whenever points change if Curved
	 * interpolation is in use.
	 *
	 * The CJC Kruger variant constrains tangent slopes so that the spline
	 * is monotone between consecutive data points, preventing overshoot
	 * and oscillation artifacts common with natural cubic splines.
	 *
	 * @param points Sorted automation points array
	 */
	computeSplineCoefficients(points: ReadonlyArray<AutomationPoint>): void;
	/**
	 * Returns the spline-interpolated value at the given time.
	 * Falls back to the static getValueAt for non-Curved interpolation types.
	 *
	 * @param points The sorted automation points
	 * @param time The time to evaluate
	 * @returns The interpolated value, or null if no points exist
	 */
	getValueAt(points: ReadonlyArray<AutomationPoint>, time: number): number | null;
	/**
	 * Invalidates cached spline coefficients. Call this when points change.
	 */
	invalidateSpline(): void;
	/**
	 * Returns a copy of the current spline coefficients (for inspection/testing).
	 */
	getSplineCoefficients(): ReadonlyArray<SplineCoefficients>;
}
/**
 * AudioAnalyzer provides audio analysis algorithms.
 *
 * Algorithms:
 * - Transient detection: Find percussive onsets in audio
 * - Onset detection: Find note beginnings
 * - BPM detection: Estimate tempo from audio
 * - Peak analysis: Find loudest points
 * - RMS analysis: Compute loudness over time
 * - Zero-crossing rate: Tonal vs percussive analysis
 *
 * All DSP is implemented in pure TypeScript with no external dependencies.
 * FFT uses a radix-2 Cooley-Tukey implementation.
 */
export interface TransientResult {
	positions: number[];
	strengths: number[];
}
export interface OnsetResult {
	positions: number[];
	types: ("percussive" | "tonal" | "mixed")[];
}
export interface BPMResult {
	bpm: number;
	confidence: number;
	alternatives: {
		bpm: number;
		confidence: number;
	}[];
}
export interface PeakAnalysis {
	peaks: {
		frame: number;
		amplitude: number;
	}[];
	truePeak: number;
	peakFrame: number;
}
export interface LoudnessProfile {
	rms: Float32Array;
	windowSize: number;
	hopSize: number;
	integratedLUFS: number;
}
export declare class AudioAnalyzer {
	private sampleRate;
	constructor(sampleRate?: number);
	detectTransients(audioData: Float32Array, options?: {
		threshold?: number;
		windowSize?: number;
	}): TransientResult;
	detectOnsets(audioData: Float32Array, options?: {
		threshold?: number;
		windowSize?: number;
	}): OnsetResult;
	detectBPM(audioData: Float32Array, options?: {
		minBPM?: number;
		maxBPM?: number;
	}): BPMResult;
	analyzePeaks(audioData: Float32Array, count?: number): PeakAnalysis;
	analyzeLoudness(audioData: Float32Array, windowSize?: number): LoudnessProfile;
	computeZeroCrossingRate(audioData: Float32Array, windowSize?: number): Float32Array;
	computeSpectralCentroid(audioData: Float32Array, fftSize?: number): Float32Array;
	private computeFFT;
	private hannWindow;
	private autocorrelate;
	private nextPow2;
}
/**
 * ThawList implements the freeze/thaw notification pattern.
 *
 * When performing bulk operations (e.g., moving 50 regions),
 * you don't want 50 individual change notifications. Instead:
 *
 * 1. Call freeze() to suppress notifications
 * 2. Make all changes
 * 3. Call thaw() to emit a single batch notification
 *
 * Supports nesting: multiple freeze() calls require matching thaw() calls.
 * Only the outermost thaw() triggers the batch notification.
 */
export declare class ThawList<T = void> {
	private _freezeCount;
	private _pendingChanges;
	private _hasPendingChanges;
	/**
	 * Emitted when the outermost thaw() resolves and there are pending
	 * changes. Receives the full array of batched changes.
	 */
	readonly changed: Signal<T[]>;
	/**
	 * Emitted immediately for each change when the list is NOT frozen.
	 * When frozen, individual notifications are suppressed until thaw.
	 */
	readonly singleChanged: Signal<T>;
	/**
	 * Whether notifications are currently suppressed.
	 */
	get isFrozen(): boolean;
	/**
	 * Current nesting depth of freeze() calls.
	 */
	get freezeCount(): number;
	/**
	 * Number of changes queued while frozen.
	 */
	get pendingCount(): number;
	/**
	 * Freeze (suppress) notifications.
	 *
	 * Can be called multiple times to nest freeze contexts. Each freeze()
	 * must be balanced by a corresponding thaw().
	 */
	freeze(): void;
	/**
	 * Thaw notifications.
	 *
	 * Decrements the freeze counter. When the counter reaches zero (i.e.
	 * the outermost freeze context is resolved) and there are pending
	 * changes, a single batch notification is emitted via {@link changed}.
	 *
	 * @throws Error if called without a matching freeze().
	 */
	thaw(): void;
	/**
	 * Record a change.
	 *
	 * - If the list is **not frozen**, the change is emitted immediately
	 *   via {@link singleChanged}.
	 * - If the list **is frozen**, the change is queued and will be
	 *   included in the batch notification when the outermost thaw()
	 *   resolves.
	 */
	notify(data: T): void;
	/**
	 * Force-emit all pending changes as a batch notification, regardless
	 * of the current freeze state. The freeze counter is **not** modified.
	 *
	 * Useful for "flush before destroy" scenarios where you need to
	 * guarantee observers see all pending changes.
	 */
	flush(): void;
	/**
	 * Discard all pending changes without emitting any notification.
	 *
	 * The freeze counter is **not** modified. This is useful when an
	 * operation is aborted/rolled back and queued notifications should
	 * be silently dropped.
	 */
	discard(): void;
	/**
	 * Execute a function within a freeze/thaw block.
	 *
	 * Convenience wrapper that:
	 * 1. Calls freeze()
	 * 2. Invokes `fn`
	 * 3. Calls thaw() (even if `fn` throws)
	 *
	 * This ensures the freeze/thaw pairing is always balanced.
	 *
	 * @param fn The function to execute while notifications are frozen.
	 */
	batch(fn: () => void): void;
}
export declare class PanProcessor extends Processor {
	private _pan;
	private _width;
	readonly panChanged: Signal<number>;
	readonly widthChanged: Signal<number>;
	constructor(id: ProcessorId$1);
	get pan(): number;
	set pan(value: number);
	/** Stereo width: 0 = mono, 1 = normal, 2 = wide */
	get width(): number;
	set width(value: number);
}
export type PluginId = string;
export type ParameterId = string;
declare enum PluginType {
	EFFECT = "EFFECT",
	INSTRUMENT = "INSTRUMENT",
	ANALYZER = "ANALYZER"
}
export interface PluginParameter {
	id: ParameterId;
	name: string;
	value: number;
	min: number;
	max: number;
	step: number;
}
interface Plugin$1 {
	readonly id: PluginId;
	name: string;
	readonly type: PluginType;
	readonly parameterChanged: Signal<{
		id: ParameterId;
		value: number;
	}>;
	getParameters(): ReadonlyArray<PluginParameter>;
	getParameter(id: ParameterId): PluginParameter | undefined;
	setParameter(id: ParameterId, value: number): void;
	getState(): Record<string, number>;
	setState(state: Record<string, number>): void;
}
/**
 * PluginInsert wraps a Plugin instance inside the Processor graph, bridging
 * the plugin parameter world with the route's latency-compensation and
 * tail-length bookkeeping.
 *
 * It automatically estimates processing latency and tail time based on the
 * plugin type and name, and re-evaluates those estimates whenever a plugin
 * parameter changes.
 */
export declare class PluginInsert extends Processor {
	private _plugin;
	private _sampleRate;
	private _parameterSubscription;
	constructor(id: ProcessorId$1, plugin: Plugin$1, sampleRate?: number);
	get plugin(): Plugin$1;
	/** The sample rate used for time-to-sample conversions in tail estimation. */
	get sampleRate(): number;
	set sampleRate(rate: number);
	set active(value: boolean);
	get active(): boolean;
	/**
	 * Estimate latency (in samples) based on plugin name / type heuristics.
	 *
	 * Real-world plugins would report their exact latency; here we use
	 * conservative estimates for common processor categories:
	 *
	 * - Linear-phase EQ: ~512 samples (FIR filter latency)
	 * - Compressor / Limiter: ~64-256 samples (look-ahead)
	 * - De-esser: ~64 samples
	 * - Other effects / instruments / analyzers: 0
	 */
	updateLatencyFromPlugin(): void;
	/**
	 * Estimate the tail length (in frames / samples) based on plugin name and
	 * parameter state.
	 *
	 * - Reverb / convolution: 2-5 seconds, scaled by decay / wet parameters.
	 * - Delay: delay-time * estimated feedback-loop count.
	 * - Everything else: 0.
	 */
	updateTailFromPlugin(): void;
	/**
	 * Estimate reverb tail between 2 and 5 seconds.
	 * Uses 'decay' or 'time' parameters for the base, and 'wet' / 'mix' to
	 * scale down when the effect is barely audible.
	 */
	private _estimateReverbTail;
	/**
	 * Estimate delay tail based on delay-time and feedback.
	 *
	 * The effective tail is roughly `delayTime * loops` where loops is
	 * derived from the feedback amount:  loops ≈ log(threshold) / log(feedback).
	 * We cap at a sensible maximum (10 s).
	 */
	private _estimateDelayTail;
	/**
	 * Dispose of internal subscriptions.  Call when removing the insert from
	 * the processing chain.
	 */
	dispose(): void;
}
/**
 * SurroundPanner supports multichannel panning beyond stereo.
 *
 * Supported layouts:
 * - Stereo (2.0): L, R
 * - Quad (4.0): FL, FR, RL, RR
 * - 5.1: FL, FR, C, LFE, RL, RR
 * - 7.1: FL, FR, C, LFE, RL, RR, SL, SR
 * - Atmos/3D: adds height channels
 *
 * Uses VBAP (Vector Base Amplitude Panning) algorithm for
 * arbitrary speaker configurations.
 */
export declare enum SpeakerLayout {
	STEREO = "STEREO",
	QUAD = "QUAD",
	SURROUND_5_1 = "5.1",
	SURROUND_7_1 = "7.1"
}
export interface SpeakerPosition {
	azimuth: number;
	elevation: number;
	distance: number;
	label: string;
}
export interface SurroundPannerSnapshot {
	id: ProcessorId$1;
	name: string;
	azimuth: number;
	elevation: number;
	spread: number;
	lfeLevel: number;
	layout: SpeakerLayout;
	active: boolean;
}
export declare class SurroundPanner extends Processor {
	private _azimuth;
	private _elevation;
	private _spread;
	private _lfeLevel;
	private _layout;
	private _speakers;
	private _gains;
	readonly positionChanged: Signal<{
		azimuth: number;
		elevation: number;
	}>;
	readonly layoutChanged: Signal<SpeakerLayout>;
	constructor(id: ProcessorId$1, layout?: SpeakerLayout);
	/**
	 * Set the source position.
	 * @param azimuth  Horizontal angle in degrees (-180 to 180).
	 * @param elevation Vertical angle in degrees (-90 to 90). Defaults to current.
	 */
	setPosition(azimuth: number, elevation?: number): void;
	/**
	 * Set the source spread.
	 * @param spread 0 = point source, 1 = omnidirectional.
	 */
	setSpread(spread: number): void;
	/**
	 * Set the LFE send level.
	 * @param level 0 to 1.
	 */
	setLFELevel(level: number): void;
	get azimuth(): number;
	get elevation(): number;
	get spread(): number;
	get lfeLevel(): number;
	/**
	 * Set the speaker layout. Recomputes speaker positions and gains.
	 */
	setLayout(layout: SpeakerLayout): void;
	get layout(): SpeakerLayout;
	/** Number of output channels for the current layout. */
	get channelCount(): number;
	/** Speaker positions for the current layout. */
	get speakers(): ReadonlyArray<SpeakerPosition>;
	/**
	 * Compute per-channel gains based on the current source position,
	 * spread, and layout using VBAP.
	 *
	 * @returns Float32Array of linear gains, one per speaker/channel.
	 */
	computeGains(): Float32Array;
	/**
	 * 2D VBAP: Vector Base Amplitude Panning in the horizontal plane.
	 *
	 * For each adjacent speaker pair, computes the amplitude split
	 * based on the angular position of the source relative to both speakers.
	 *
	 * @param azimuth Source azimuth in degrees (-180 to 180).
	 */
	private vbap2D;
	/**
	 * 3D VBAP: Vector Base Amplitude Panning with elevation.
	 *
	 * Extends 2D VBAP by considering the vertical angle to distribute
	 * energy across speakers at different elevations.
	 *
	 * @param azimuth Source azimuth in degrees.
	 * @param elevation Source elevation in degrees.
	 */
	private vbap3D;
	/**
	 * Setup default speaker positions for a given layout.
	 * Angles follow the ITU-R BS.775 and ITU-R BS.2051 standards.
	 */
	private setupSpeakers;
	/**
	 * Get the index of the LFE channel in the current layout.
	 * Returns -1 if the layout has no LFE channel.
	 */
	private getLFEChannelIndex;
	toJSON(): SurroundPannerSnapshot;
	static fromJSON(data: SurroundPannerSnapshot): SurroundPanner;
}
/**
 * InternalSend routes audio from one route to another internally.
 * Unlike regular sends that go to a send bus, internal sends
 * create a direct connection between two routes.
 */
export interface InternalSendSnapshot {
	id: ProcessorId$1;
	name: string;
	targetTrackId: string;
	sendLevel: number;
	preFader: boolean;
	muted: boolean;
	active: boolean;
}
export interface InternalReturnSnapshot {
	id: ProcessorId$1;
	name: string;
	sourceTrackIds: string[];
	active: boolean;
}
export declare class InternalSend extends Processor {
	private _targetTrackId;
	private _sendLevel;
	private _preFader;
	private _muted;
	readonly targetChanged: Signal<string>;
	readonly levelChanged: Signal<number>;
	constructor(id: ProcessorId$1, name: string, targetTrackId: TrackId);
	/** The ID of the target track that receives audio from this send. */
	get targetTrackId(): TrackId;
	/**
	 * Change the target track.
	 * @param trackId The new target track ID.
	 */
	setTarget(trackId: TrackId): void;
	/** Send level in dB. 0 dB = unity gain. */
	get sendLevel(): number;
	/**
	 * Set the send level in dB.
	 * @param db Level in decibels. Clamped to [-100, +12]. -Infinity = silence, 0 = unity.
	 */
	setSendLevel(db: number): void;
	/** Whether this send taps the signal before the channel fader. */
	get preFader(): boolean;
	/**
	 * Set whether this send is pre-fader or post-fader.
	 * @param pre true for pre-fader, false for post-fader.
	 */
	setPreFader(pre: boolean): void;
	/** Whether this send is muted. */
	get muted(): boolean;
	/**
	 * Set the mute state of this send.
	 * @param muted true to mute, false to unmute.
	 */
	setMuted(muted: boolean): void;
	/**
	 * Compute the linear gain to apply to audio routed through this send.
	 * Takes into account the send level (dB) and mute state.
	 *
	 * @returns Linear gain (0.0 if muted or inactive).
	 */
	getLinearGain(): number;
	toJSON(): InternalSendSnapshot;
	static fromJSON(data: InternalSendSnapshot): InternalSend;
}
/**
 * InternalReturn receives audio from InternalSend(s).
 *
 * An InternalReturn is placed in the processor chain of the receiving track.
 * It collects audio from any number of InternalSend processors that target
 * the track containing this return.
 */
export declare class InternalReturn extends Processor {
	private _sourceTrackIds;
	readonly sourceAdded: Signal<string>;
	readonly sourceRemoved: Signal<string>;
	constructor(id: ProcessorId$1, name: string);
	/**
	 * Register a source track that is sending audio to this return.
	 * @param trackId The source track ID.
	 */
	addSource(trackId: TrackId): void;
	/**
	 * Remove a source track from this return.
	 * @param trackId The source track ID to remove.
	 */
	removeSource(trackId: TrackId): void;
	/** List of all source track IDs sending audio to this return. */
	get sourceTrackIds(): ReadonlyArray<TrackId>;
	/**
	 * Check if a specific track is registered as a source.
	 * @param trackId The track ID to check.
	 */
	hasSource(trackId: TrackId): boolean;
	toJSON(): InternalReturnSnapshot;
	static fromJSON(data: InternalReturnSnapshot): InternalReturn;
}
/**
 * Send processor -- routes a copy of the signal to a destination track or bus.
 *
 * A send can be placed either pre-fader or post-fader in the processor chain.
 * It has its own independent level (in dB) and mute state.
 *
 * The actual DSP work (copying / mixing buffers) is performed by the audio
 * backend; this processor holds the domain state and emits signals for the
 * engine to react to.
 */
export declare class SendProcessor extends Processor {
	private _level;
	private _preFader;
	private _pannable;
	private _targetId;
	private _muted;
	/** Emitted when the send level changes. */
	readonly levelChanged: Signal<number>;
	/** Emitted when the pre/post-fader placement changes. */
	readonly preFaderChanged: Signal<boolean>;
	/** Emitted when the mute state changes. */
	readonly muteChanged: Signal<boolean>;
	/**
	 * @param id        Unique processor identifier.
	 * @param targetId  The ID of the destination track or bus.
	 * @param level     Initial send level in dB (default 0 dB -- unity).
	 * @param preFader  Whether this send taps the signal before the fader.
	 * @param pannable  Whether the send has its own pan control.
	 */
	constructor(id: ProcessorId$1, targetId: string, level?: number, preFader?: boolean, pannable?: boolean);
	/** Send level in dB. */
	get level(): number;
	set level(value: number);
	/** Whether this send taps the signal before the channel fader. */
	get preFader(): boolean;
	set preFader(value: boolean);
	/** The destination track or bus ID. */
	get targetId(): string;
	/** Whether this send has its own panning control. */
	get pannable(): boolean;
	/** Whether this send is muted. */
	get muted(): boolean;
	set muted(value: boolean);
	/**
	 * Returns the current meter data for this send.
	 * In a full implementation the audio backend would feed real values;
	 * here we return sensible defaults so consumers always get a valid object.
	 */
	getMeterData(): MeterData;
}
declare enum MeterPoint {
	INPUT = "input",
	PRE_FADER = "pre_fader",
	POST_FADER = "post_fader",
	OUTPUT = "output"
}
/**
 * Metering DSP processor.
 *
 * Provides multi-channel peak, RMS, and peak-hold values along with
 * K-metering and VU calculation helpers.
 *
 * The meter can be positioned at different points in the signal chain
 * via the {@link MeterPoint} enum (input, pre-fader, post-fader, output).
 */
export declare class MeterProcessor extends Processor {
	/** Per-channel instantaneous peak levels in dBFS. */
	private peakValues;
	/** Per-channel RMS levels in dBFS. */
	private rmsValues;
	/** Per-channel peak-hold values in dBFS (decays slowly). */
	private peakHold;
	/** Peak-hold decay rate in dB per frame callback. */
	private decayRate;
	/** Number of audio channels this meter tracks. */
	private channelCount;
	/** Where in the signal chain this meter is placed. */
	private _meterPoint;
	/** Emitted when meter data is updated. */
	readonly meterUpdated: Signal<MeterData>;
	/** Emitted when the meter point changes. */
	readonly meterPointChanged: Signal<MeterPoint>;
	/**
	 * @param id          Unique processor identifier.
	 * @param meterPoint  Initial placement in the signal chain.
	 * @param channels    Number of audio channels (default 2 for stereo).
	 */
	constructor(id: ProcessorId$1, meterPoint?: MeterPoint, channels?: number);
	/**
	 * Set the meter position in the signal chain.
	 * @param point The new meter point.
	 */
	setMeterPoint(point: MeterPoint): void;
	/** Get the current meter point. */
	getMeterPoint(): MeterPoint;
	/**
	 * Calculate a K-meter value from raw samples.
	 *
	 * K-metering (Bob Katz) applies a reference offset so that the meter's
	 * 0 dB mark corresponds to the chosen reference level (e.g. -14 dBFS
	 * for K-14, -20 dBFS for K-20).
	 *
	 * @param samples   Raw audio samples for a single channel.
	 * @param reference Reference level in dBFS (e.g. -14 for K-14, -20 for K-20).
	 * @returns The K-meter value in dB (relative to the reference).
	 */
	calculateKMeter(samples: Float32Array, reference: number): number;
	/**
	 * Calculate a VU meter value from raw samples.
	 *
	 * A traditional VU meter has a 300 ms integration time (ballistic).
	 * This method computes the RMS over the provided sample block, which
	 * should ideally represent ~300 ms of audio for authentic behaviour.
	 *
	 * @param samples Raw audio samples for a single channel.
	 * @returns VU level in dB (0 VU ~ -14 dBFS by convention, but we return
	 *          raw dBFS here -- the UI layer can apply the VU offset).
	 */
	calculateVUMeter(samples: Float32Array): number;
	/**
	 * Feed new sample data into the meter.
	 *
	 * Intended to be called by the audio backend once per process cycle.
	 * Updates peak, RMS, and peak-hold values for each channel.
	 *
	 * @param channelData Array of Float32Array, one per channel.
	 */
	process(channelData: Float32Array[]): void;
	/**
	 * Get the current aggregated meter data (stereo or mono).
	 *
	 * Returns the maximum peak/RMS across all channels, matching the
	 * existing {@link MeterData} interface used throughout the application.
	 */
	getMeterData(): MeterData;
	/**
	 * Get per-channel meter data.
	 *
	 * @returns An array of MeterData, one per channel.
	 */
	getChannelMeterData(): MeterData[];
	/**
	 * Reset all peak-hold values to -Infinity.
	 */
	resetPeakHold(): void;
	/**
	 * Set the peak-hold decay rate.
	 * @param rate Decay rate in dB per frame callback.
	 */
	setDecayRate(rate: number): void;
}
export interface PluginDescriptor {
	id: string;
	name: string;
	type: PluginType;
}
export declare class PluginManager {
	private static instance;
	private availablePlugins;
	private constructor();
	static getInstance(): PluginManager;
	getAvailablePlugins(): ReadonlyArray<PluginDescriptor>;
	createPlugin(descriptorId: string): Plugin$1 | null;
}
export type ActionId = string;
declare enum ActionCategory {
	TRANSPORT = "Transport",
	TRACK = "Track",
	REGION = "Region",
	EDIT = "Edit",
	VIEW = "View",
	FILE = "File",
	DEBUG = "Debug"
}
export interface ActionDefinition {
	id: ActionId;
	label: string;
	category: ActionCategory;
	description?: string;
	/**
	 * Factory function to create the command payload.
	 * Can accept context arguments if needed.
	 * Not required if `execute` is provided.
	 */
	commandFactory?: (context?: Record<string, unknown>) => AudioCommand;
	/**
	 * Direct execute function (bypasses command system).
	 * Used for UI-only actions like opening dialogs.
	 */
	execute?: (context?: Record<string, unknown>) => void | Promise<void>;
	/**
	 * Default key binding (e.g. 'Space', 'Control+Z')
	 */
	defaultKey?: string;
}
export declare class ActionRegistry {
	private static instance;
	private actions;
	private keyMap;
	private constructor();
	static getInstance(): ActionRegistry;
	registerDefaults(actions: ActionDefinition[]): void;
	register(action: ActionDefinition): void;
	getAction(id: ActionId): ActionDefinition | undefined;
	getAllActions(): ActionDefinition[];
	/**
	 * Resolve the effective key for an action, checking custom bindings first,
	 * then falling back to the default key.
	 */
	getEffectiveKey(actionId: ActionId): string | undefined;
	/**
	 * Look up an action by key string, checking custom bindings first,
	 * then falling back to default key map.
	 */
	getActionIdByKey(key: string): ActionId | undefined;
	/**
	 * Rebuild the key map (useful after registering new actions or changing bindings).
	 */
	rebuildKeyMap(): void;
	/**
	 * Get all actions grouped by category.
	 * Category is derived from action ID prefix (e.g., "transport.play" -> "Transport").
	 */
	getActionsByCategory(): Map<string, ActionDefinition[]>;
	execute(id: ActionId, context?: Record<string, unknown>): Promise<void>;
}
export interface PreferenceValues {
	audioBufferSize: 128 | 256 | 512 | 1024 | 2048;
	sampleRate: 44100 | 48000 | 96000;
	theme: "dark" | "light";
	autoSaveInterval: number;
	snapToGrid: boolean;
	gridSubdivision: number;
	meterType: "peak" | "rms" | "vu";
	showMinimap: boolean;
	followPlayhead: boolean;
	countInBars: number;
	historyDepth: number;
	saveHistory: boolean;
	saveHistoryDepth: number;
}
/**
 * Singleton preferences system with Signal-based change notification.
 * Persists to localStorage.
 */
export declare class Preferences {
	private static instance;
	private values;
	readonly preferenceChanged: Signal<{
		key: keyof PreferenceValues;
		value: unknown;
	}>;
	private constructor();
	static getInstance(): Preferences;
	/**
	 * Get a preference value by key.
	 */
	get<K extends keyof PreferenceValues>(key: K): PreferenceValues[K];
	/**
	 * Set a preference value.
	 */
	set<K extends keyof PreferenceValues>(key: K, value: PreferenceValues[K]): void;
	/**
	 * Get all preferences as a plain object.
	 */
	getAll(): Readonly<PreferenceValues>;
	/**
	 * Reset all preferences to defaults.
	 */
	resetToDefaults(): void;
	private saveToStorage;
	private loadFromStorage;
}
/**
 * Manages custom keyboard shortcut bindings that override defaults.
 * Persists to localStorage.
 */
export declare class KeyBindings {
	private static instance;
	private customBindings;
	readonly bindingsChanged: Signal<{
		actionId: string;
		keyCombo: string | undefined;
	}>;
	private constructor();
	static getInstance(): KeyBindings;
	/**
	 * Set a custom key binding for an action, overriding the default.
	 */
	setBinding(actionId: string, keyCombo: string): void;
	/**
	 * Get the custom key binding for an action (undefined if using default).
	 */
	getBinding(actionId: string): string | undefined;
	/**
	 * Remove a custom binding, reverting to default.
	 */
	removeBinding(actionId: string): void;
	/**
	 * Clear all custom bindings, reverting everything to defaults.
	 */
	resetToDefaults(): void;
	/**
	 * Get all custom bindings as a Map of actionId -> keyCombo.
	 */
	getAllBindings(): Map<string, string>;
	private saveToStorage;
	private loadFromStorage;
}
/**
 * Auto-save manager.
 *
 * Periodically saves the current session to IndexedDB when the
 * dirty flag is set. The dirty flag is set automatically whenever
 * session signals fire, and cleared after a successful save.
 */
export declare class AutoSave {
	private static instance;
	private _dirty;
	private _lastModified;
	private _timerId;
	private _session;
	private _subscriptions;
	/** Emitted after each successful auto-save. */
	readonly saved: Signal<Date>;
	/** Emitted when the dirty flag changes. */
	readonly dirtyChanged: Signal<boolean>;
	private constructor();
	static getInstance(): AutoSave;
	get dirty(): boolean;
	get lastModified(): Date;
	/**
	 * Start monitoring the given session for changes and auto-saving.
	 */
	start(session: Session): void;
	/**
	 * Stop auto-saving and clean up subscriptions.
	 */
	stop(): void;
	/**
	 * Mark the session as dirty (has unsaved changes).
	 */
	markDirty(): void;
	/**
	 * Force an immediate save (e.g. on window beforeunload).
	 */
	saveNow(): Promise<void>;
	private startTimer;
	private stopTimer;
	private disposeSubscriptions;
	/**
	 * Subscribe to relevant session signals so that any structural or
	 * transport change automatically marks the session as dirty.
	 */
	private subscribeToSessionSignals;
}
/**
 * Metadata stored alongside each session entry.
 */
export interface SessionMeta {
	id: string;
	name: string;
	modified: Date;
}
/**
 * IndexedDB-based session storage.
 *
 * Stores full session snapshots and named snapshots (point-in-time saves)
 * in the browser's IndexedDB.
 */
export declare class SessionStorage {
	private static instance;
	private dbPromise;
	private constructor();
	static getInstance(): SessionStorage;
	private openDB;
	/**
	 * Save (insert or update) a session snapshot to IndexedDB.
	 */
	saveSession(session: {
		id: string;
		name: string;
		toJSON(): SessionSnapshot;
	}): Promise<void>;
	/**
	 * Load a session snapshot by ID.
	 */
	loadSession(id: string): Promise<SessionSnapshot | null>;
	/**
	 * List all saved sessions (lightweight metadata only).
	 */
	listSessions(): Promise<SessionMeta[]>;
	/**
	 * Delete a session and all its snapshots.
	 */
	deleteSession(id: string): Promise<void>;
	/**
	 * Save a named snapshot of the given session.
	 * Returns the snapshot ID.
	 */
	saveSnapshot(sessionId: string, name: string, snapshot: SessionSnapshot): Promise<string>;
	/**
	 * List all snapshots for a given session.
	 */
	listSnapshots(sessionId: string): Promise<{
		id: string;
		name: string;
		created: Date;
	}[]>;
	/**
	 * Load a specific snapshot by ID.
	 */
	loadSnapshot(snapshotId: string): Promise<SessionSnapshot | null>;
	/**
	 * Delete a specific snapshot.
	 */
	deleteSnapshot(snapshotId: string): Promise<void>;
}
/**
 * SessionArchive packages a session and all its referenced audio files
 * into a single downloadable archive.
 *
 * In the browser context, this creates a custom binary bundle containing:
 * - session.json (the serialized session state)
 * - audio sources (all source audio files as blobs)
 * - metadata.json (archive metadata)
 *
 * Binary format:
 * [4 bytes magic: "DAWE"]
 * [4 bytes version: 1]
 * [4 bytes metadata JSON length]
 * [metadata JSON]
 * [4 bytes session JSON length]
 * [session JSON]
 * [4 bytes source count]
 * For each source:
 *   [4 bytes name length]
 *   [name UTF-8]
 *   [4 bytes blob size]
 *   [blob data]
 */
export interface ArchiveMetadata {
	version: string;
	createdAt: string;
	sessionName: string;
	sourceCount: number;
	totalSize: number;
}
export interface ExtractedArchive {
	sessionData: string;
	sources: Array<{
		name: string;
		blob: Blob;
	}>;
	metadata: ArchiveMetadata;
}
export declare class SessionArchive {
	readonly progress: Signal<number>;
	/**
	 * Create an archive from session data and audio sources.
	 *
	 * @param sessionData  JSON string of the serialized session.
	 * @param sources      Array of audio sources to include.
	 * @param metadata     Optional metadata overrides.
	 * @returns A Blob containing the packed archive.
	 */
	createArchive(sessionData: string, sources: Array<{
		name: string;
		url: string;
		blob: Blob;
	}>, metadata?: Partial<ArchiveMetadata>): Promise<Blob>;
	/**
	 * Extract an archive into session data and audio blobs.
	 *
	 * @param archiveBlob The archive Blob to extract.
	 * @returns The extracted session data, sources, and metadata.
	 * @throws Error if the archive format is invalid.
	 */
	extractArchive(archiveBlob: Blob): Promise<ExtractedArchive>;
	/**
	 * Get archive info without fully extracting all sources.
	 * Only reads the header and metadata section.
	 *
	 * @param archiveBlob The archive Blob to inspect.
	 * @returns The archive metadata.
	 * @throws Error if the archive format is invalid.
	 */
	getArchiveInfo(archiveBlob: Blob): Promise<ArchiveMetadata>;
}
export interface TrackTemplate {
	name: string;
	type: TrackType;
	color?: string;
	plugins?: Array<{
		pluginId: string;
		params?: Record<string, number>;
	}>;
	armed?: boolean;
	monitorMode?: string;
}
export interface SessionTemplate {
	id: string;
	name: string;
	description: string;
	category: "recording" | "mixing" | "mastering" | "production" | "podcast" | "custom";
	sampleRate: number;
	tempo: number;
	timeSignature: [
		number,
		number
	];
	tracks: TrackTemplate[];
	createdAt: string;
	updatedAt: string;
}
/**
 * Manages session templates — predefined track / routing configurations
 * that users can instantiate to quickly bootstrap new sessions.
 *
 * Includes a set of built-in factory templates (recording, podcast,
 * mixing, mastering, production) and supports user-created custom
 * templates.
 */
export declare class SessionTemplateManager {
	private _templates;
	readonly templatesChanged: Signal<void>;
	constructor();
	/**
	 * Add a new template. An `id`, `createdAt`, and `updatedAt` are generated
	 * automatically.
	 */
	addTemplate(template: Omit<SessionTemplate, "id" | "createdAt" | "updatedAt">): SessionTemplate;
	/**
	 * Update an existing template. Only the supplied fields are merged; the
	 * `updatedAt` timestamp is refreshed automatically.
	 */
	updateTemplate(id: string, updates: Partial<SessionTemplate>): void;
	/**
	 * Remove a template by ID.
	 */
	removeTemplate(id: string): void;
	/**
	 * Get a single template by ID.
	 */
	getTemplate(id: string): SessionTemplate | undefined;
	/**
	 * Get all registered templates.
	 */
	getAllTemplates(): SessionTemplate[];
	/**
	 * Get templates filtered by category.
	 */
	getTemplatesByCategory(category: string): SessionTemplate[];
	/**
	 * Snapshot a Session into a reusable template.
	 */
	static createFromSession(session: Session, name: string, description: string): SessionTemplate;
	static getDefaultTemplates(): SessionTemplate[];
	/**
	 * Serialize all templates to a JSON string.
	 */
	serialize(): string;
	/**
	 * Restore a SessionTemplateManager from a JSON string produced by
	 * `serialize()`.
	 */
	static deserialize(json: string): SessionTemplateManager;
}
/**
 * DAW Custom Error Classes
 *
 * 명확한 에러 처리를 위한 Custom Error 클래스들
 */
/**
 * 기본 DAW 에러
 */
export declare class DAWError extends Error {
	constructor(message: string);
}
/**
 * Track 관련 에러
 */
export declare class TrackNotFoundError extends DAWError {
	readonly trackId: string;
	constructor(trackId: string);
}
/**
 * Region 관련 에러
 */
export declare class RegionNotFoundError extends DAWError {
	readonly regionId: string;
	constructor(regionId: string);
}
export declare class RegionOutOfBoundsError extends DAWError {
	readonly regionId: string;
	readonly position: number;
	readonly start: number;
	readonly end: number;
	constructor(regionId: string, position: number, start: number, end: number);
}
/**
 * Range 관련 에러
 */
export declare class RangeNotFoundError extends DAWError {
	readonly rangeId: string;
	constructor(rangeId: string);
}
export declare class InvalidRangeError extends DAWError {
	readonly start: number;
	readonly end: number;
	constructor(start: number, end: number);
}
/**
 * Source 관련 에러
 */
export declare class SourceNotFoundError extends DAWError {
	readonly sourceId: string;
	constructor(sourceId: string);
}
export declare class AudioLoadError extends DAWError {
	readonly url: string;
	readonly reason: string;
	constructor(url: string, reason: string);
}
/**
 * IO 관련 에러
 */
export declare class IONotFoundError extends DAWError {
	readonly ioId: string;
	constructor(ioId: string);
}
export declare class IOConnectionError extends DAWError {
	readonly sourceId: string;
	readonly destId: string;
	readonly reason: string;
	constructor(sourceId: string, destId: string, reason: string);
}
/**
 * Command 관련 에러
 */
export declare class InvalidCommandError extends DAWError {
	constructor(message: string);
}
export declare class CommandExecutionError extends DAWError {
	readonly commandType: string;
	readonly reason: string;
	constructor(commandType: string, reason: string);
}
/**
 * Export 관련 에러
 */
export declare class ExportError extends DAWError {
	constructor(message: string);
}
export declare class ExportConfigurationError extends DAWError {
	constructor(message: string);
}
/**
 * Selection 관련 에러
 */
export declare class NoSelectionError extends DAWError {
	constructor();
}
/**
 * Automation 관련 에러
 */
export declare class AutomationPointNotFoundError extends DAWError {
	readonly pointId: string;
	constructor(pointId: string);
}
export declare class ProcessorNotFoundError extends DAWError {
	readonly processorId: string;
	constructor(processorId: string);
}

export {
	Disposable$1 as Disposable,
	Range$1 as Range,
};

export {};
