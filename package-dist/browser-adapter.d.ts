export type FrameCount = number;
export type SampleRate = number;
export type ProcessorId = string;
export type RouteId = string;
export type TrackId = string;
export type RegionId = string;
export type SourceId = string;
export type RangeId = string;
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
 * A lightweight implementation of the Signal/Slot pattern.
 * Allows objects to expose strongly-typed events that others can subscribe to.
 */
export type Slot<T> = (data: T) => void;
declare class Signal<T = void> {
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
declare enum SourceFlags {
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
declare enum TimeDomain {
	/** Absolute time (samples/seconds), BPM-independent */
	AudioTime = 0,
	/** Musical time (beats/bars), BPM-dependent */
	BeatTime = 1
}
declare class Beats {
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
export interface AudioProvider {
	initialize(): Promise<void>;
	start(): void;
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
declare enum AutomationMode {
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
declare class AutomationList {
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
declare abstract class Processor {
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
declare class GainProcessor extends Processor {
	private _gain;
	readonly gainChanged: Signal<number>;
	constructor(id: ProcessorId$1, name?: string);
	get gain(): number;
	set gain(db: number);
}
declare enum PannerType {
	/** Simple left/right balance control. */
	STEREO_BALANCE = "stereo_balance",
	/** Stereo width (MS mid-side encoding). */
	STEREO_WIDTH = "stereo_width",
	/** Equal-power panning law (cosine/sine). */
	EQUAL_POWER = "equal_power",
	/** Linear panning law. */
	LINEAR = "linear"
}
declare enum PanLaw {
	/** -3 dB center attenuation (equal power, default). */
	MINUS_3DB = "-3dB",
	/** -4.5 dB center attenuation (compromise). */
	MINUS_4_5DB = "-4.5dB",
	/** -6 dB center attenuation (linear). */
	MINUS_6DB = "-6dB",
	/** 0 dB center — no compensation. */
	ZERO_DB = "0dB"
}
declare class Panner extends Processor {
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
declare class IO {
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
declare class LatencyCompensator {
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
declare class Route {
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
declare class TempoMap {
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
declare enum OverlapType {
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
declare enum FadeShape {
	LINEAR = 0,
	EQUAL_POWER = 1,
	S_CURVE = 2,
	FAST = 3,
	SLOW = 4,
	CUSTOM = 5
}
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
declare class MidiNote {
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
declare class MidiRegion {
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
declare class Playlist {
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
	getRegionsInRange(start: FrameCount, end: FrameCount): Region[];
	/**
	 * Shift all regions whose start >= afterFrame by deltaFrames.
	 * Used for ripple editing.
	 */
	rippleShift(afterFrame: FrameCount, deltaFrames: number): void;
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
declare enum MonitorMode {
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
 * Track mode determines recording and playback behavior.
 *
 * - 'normal': standard layered playback (default) -- all overlapping regions
 *   play simultaneously, respecting layer ordering.
 * - 'non_layered': only the top-most region at any given time position is
 *   audible; lower layers are silenced.
 * - 'tape': destructive recording mode -- new audio physically replaces
 *   existing audio in the source file rather than creating new regions.
 */
export type TrackMode = "normal" | "non_layered" | "tape";
declare class Track {
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
}
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
declare class SendBus {
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
declare class Marker {
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
declare class RegionGroup {
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
declare class ExportConfig {
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
declare class ExportStatus {
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
declare enum GridType {
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
declare enum SnapMode {
	/** Snap 비활성화 */
	NO_SNAP = "no_snap",
	/** Grid에 Snap */
	SNAP_TO_GRID = "snap_to_grid",
	/** 자석 효과 (가까우면 snap) */
	SNAP_MAGNETIC = "snap_magnetic"
}
declare class GridSettings {
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
declare class MixerScene {
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
declare class TrackGroup {
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
declare class CDMarker {
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
declare class VCATrack {
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
declare enum MotionState {
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
declare class TransportFSM {
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
declare class SidechainConfig {
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
	private setupSessionListeners;
	private bindTrackRuntimeSignals;
	private static toMidiRegionDTO;
	private bindTrackSignals;
	private getProcessorType;
	private connectMasterProcessorSignals;
	private connectProcessorSignals;
	private bindAutomationList;
	initialize(): Promise<void>;
	private preRollTargetFrame;
	private preRollArmedTracks;
	private preRollWasMetronomeEnabled;
	start(): Promise<void>;
	private syncId;
	private requestFrame;
	private cancelFrame;
	private startTransportSync;
	private scheduleAutomations;
	stop(): void;
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
}

export {};
