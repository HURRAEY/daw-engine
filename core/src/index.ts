// 선언 번들 생성기가 lamejs ambient module을 찾도록 entry에서 타입 선언을 직접 참조합니다.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./lamejs.d.ts" />

// ─── Domain ─────────────────────────────────────────────────────────────────
export { Session } from "./domain/Session";
export { Track, TrackType } from "./domain/Track";
export { Region } from "./domain/Region";
export { Playlist } from "./domain/Playlist";
export { Source, SourceFlags } from "./domain/Source";
export type { PeakData, SourceAnalysisData } from "./domain/Source";
export { Range } from "./domain/Range";
export { Marker } from "./domain/Marker";
export { MidiNote } from "./domain/MidiNote";
export { MidiRegion } from "./domain/MidiRegion";
export { SendBus } from "./domain/SendBus";
export { GridSettings, GridType, SnapMode } from "./domain/GridSettings";
export { ExportConfig } from "./domain/ExportConfig";
export { ExportStatus } from "./domain/ExportStatus";
export { MouseMode } from "./domain/MouseMode";
export { EditMode } from "./domain/EditMode";
export { ZoomFocus } from "./domain/ZoomFocus";
export { RulerType } from "./domain/RulerType";
export { ClockMode, formatClock } from "./domain/ClockMode";
export type { Beats } from "./domain/temporal/types";
export { TimeDomain, TICKS_PER_BEAT } from "./domain/temporal/types";
export { TempoMap } from "./domain/temporal/TempoMap";
export type {
  TempoEvent,
  MeterEvent,
  BBT,
  SubdivisionType,
  TempoAndMeter,
} from "./domain/temporal/TempoMap";
export { RecordMode } from "./domain/RecordMode";
export { MonitorMode } from "./domain/MonitorMode";
export { RegionClipboard } from "./domain/RegionClipboard";
export { RegionGroup } from "./domain/RegionGroup";
export { Route } from "./domain/Route";
export { CrossfadeEngine } from "./domain/CrossfadeEngine";
export type { FadeEnvelope } from "./domain/FadeEnvelope";
export { FadeShape, computeFadeGain } from "./domain/FadeEnvelope";
export { MixerScene } from "./domain/MixerScene";
export { TrackGroup } from "./domain/TrackGroup";
export type { TrackGroupSnapshot } from "./domain/TrackGroup";
export { TrackGroupLinkingService } from "./domain/TrackGroupLinkingService";
export type {
  TrackId,
  RegionId,
  RangeId,
  FrameCount,
  ProcessorId,
  RouteId,
} from "./domain/types";
export type { VideoMetadata } from "./domain/VideoMetadata";
export { SidechainConfig } from "./domain/SidechainConfig";
export type { SidechainConfigSnapshot } from "./domain/SidechainConfig";
export { VCATrack } from "./domain/VCATrack";
export type { VCATrackSnapshot } from "./domain/VCATrack";
export {
  TriggerBox,
  TriggerState,
  LaunchQuantize,
  FollowAction,
} from "./domain/TriggerBox";
export type {
  TriggerSlot,
  TriggerPlaybackInfo,
  TriggerBoxSnapshot,
} from "./domain/TriggerBox";
export { CDMarker } from "./domain/CDMarker";
export { OverlapType } from "./domain/OverlapType";
export { TransportFSM, MotionState } from "./domain/TransportFSM";

// ─── Audio ──────────────────────────────────────────────────────────────────
export { AudioEngine } from "./audio/AudioEngine";
export type { AudioProvider } from "./audio/AudioProvider";
export { OfflineExporter } from "./audio/OfflineExporter";
export { Auditioner, AuditionerState } from "./audio/Auditioner";
export type { AuditionerOutput } from "./audio/Auditioner";
export { BWFMetadata } from "./audio/BWFMetadata";
export type { BWFData } from "./audio/BWFMetadata";

// ─── Audio Engine ───────────────────────────────────────────────────────────
export { LatencyCompensator } from "./audio/engine/LatencyCompensator";
export { SidechainRouter } from "./audio/engine/SidechainRouter";
export { RoutingGraph } from "./audio/engine/RoutingGraph";
export type { GraphNode, FeedbackLoop } from "./audio/engine/RoutingGraph";
export { PunchRecordManager } from "./audio/engine/PunchRecordManager";
export type { PunchState } from "./audio/engine/PunchRecordManager";
export { MultiTrackRecorder } from "./audio/engine/MultiTrackRecorder";
export type {
  InputAssignment,
  RecordingResult,
} from "./audio/engine/MultiTrackRecorder";

// ─── Audio Export ───────────────────────────────────────────────────────────
export { ExportGraphBuilder } from "./audio/export/ExportGraphBuilder";
export { CDMarkerExporter } from "./audio/export/CDMarkerExporter";
export { ExportPresetManager } from "./audio/export/ExportPresetManager";

// ─── Commands ───────────────────────────────────────────────────────────────
export { CommandExecutor } from "./commands/CommandExecutor";
export { CommandHistory } from "./commands/CommandHistory";
export { UndoTransaction } from "./commands/UndoTransaction";
export type {
  Command,
  ReversibleChange,
  UndoableCommand,
} from "./commands/Command";
export type { HistoryEntry } from "./commands/CommandHistory";
export { moveRegionAndCreateTransaction } from "./commands/history/moveRegionAndCreateTransaction";
export type { RegionMoveRequest } from "./commands/history/moveRegionAndCreateTransaction";
export { CommandType } from "./commands/types";
export type { AudioCommand } from "./commands/types";
export type {
  CommandHandler,
  CommandResult,
} from "./commands/handlers/CommandHandler";

// ─── Automation ─────────────────────────────────────────────────────────────
export { AutomationList } from "./automation/AutomationList";
export { AutomationCurve } from "./automation/AutomationCurve";
export { AutomationMode } from "./automation/AutomationMode";

// ─── Analysis ───────────────────────────────────────────────────────────────
export { AudioAnalyzer } from "./analysis/AudioAnalyzer";
export type {
  TransientResult,
  OnsetResult,
  BPMResult,
  PeakAnalysis,
  LoudnessProfile,
} from "./analysis/AudioAnalyzer";

// ─── Lib ────────────────────────────────────────────────────────────────────
export { Signal } from "./lib/Signal";
export { ThawList } from "./lib/ThawList";
export { DisposableGroup } from "./lib/DisposableGroup";
export type { Disposable } from "./lib/DisposableGroup";

// ─── Processing ─────────────────────────────────────────────────────────────
export { Processor } from "./processing/Processor";
export { GainProcessor } from "./processing/GainProcessor";
export { PanProcessor } from "./processing/PanProcessor";
export { Panner, PannerType, PanLaw } from "./processing/Panner";
export { PluginInsert } from "./processing/PluginInsert";
export { SurroundPanner, SpeakerLayout } from "./processing/SurroundPanner";
export type { SpeakerPosition } from "./processing/SurroundPanner";
export { InternalSend, InternalReturn } from "./processing/InternalSend";
export { SendProcessor } from "./processing/SendProcessor";
export { MeterProcessor } from "./processing/MeterProcessor";
export { IO } from "./processing/IO";

// ─── Plugins ────────────────────────────────────────────────────────────────
export { PluginManager } from "./plugins/PluginManager";

// ─── Actions ────────────────────────────────────────────────────────────────
export { ActionRegistry } from "./actions/ActionRegistry";
export type { ActionDefinition } from "./actions/types";

// ─── Preferences ────────────────────────────────────────────────────────────
export { Preferences } from "./preferences/Preferences";
export { KeyBindings } from "./preferences/KeyBindings";
export type { PreferenceValues } from "./preferences/Preferences";

// ─── Storage ────────────────────────────────────────────────────────────────
export { AutoSave } from "./storage/AutoSave";
export { SessionStorage } from "./storage/SessionStorage";
export { SessionArchive } from "./storage/SessionArchive";
export type {
  ArchiveMetadata,
  ExtractedArchive,
} from "./storage/SessionArchive";
export { SessionTemplateManager } from "./storage/SessionTemplate";

// ─── Errors ─────────────────────────────────────────────────────────────────
export * from "./errors/DAWErrors";
