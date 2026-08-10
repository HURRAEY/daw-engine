import { z } from "zod";

export const CommandType = {
  PLAY: "PLAY",
  PAUSE: "PAUSE",
  STOP: "STOP",
  ADD_TRACK: "ADD_TRACK",
  REMOVE_TRACK: "REMOVE_TRACK",
  ADD_REGION: "ADD_REGION",
  ADD_PLUGIN: "ADD_PLUGIN",
  REMOVE_PLUGIN: "REMOVE_PLUGIN",
  SET_PLUGIN_PARAMETER: "SET_PLUGIN_PARAMETER",
  ADD_AUTOMATION: "ADD_AUTOMATION",
  UNDO: "UNDO",
  REDO: "REDO",
  SELECTION_UNDO: "SELECTION_UNDO",
  SELECTION_REDO: "SELECTION_REDO",
  START_RECORDING: "START_RECORDING",
  STOP_RECORDING: "STOP_RECORDING",
  TOGGLE_METRONOME: "TOGGLE_METRONOME",
  ADD_SOURCE: "ADD_SOURCE",
  SET_VOLUME: "SET_VOLUME",
  SET_PAN: "SET_PAN",
  MUTE_TRACK: "MUTE_TRACK",
  SOLO_TRACK: "SOLO_TRACK",
  REMOVE_REGION: "REMOVE_REGION",
  MOVE_REGION: "MOVE_REGION",
  RESIZE_REGION: "RESIZE_REGION",
  SET_TEMPO: "SET_TEMPO",
  SET_TIME_SIGNATURE: "SET_TIME_SIGNATURE",
  ARM_TRACK: "ARM_TRACK",
  SET_TRACK_MONITOR: "SET_TRACK_MONITOR",
  MOVE_AUTOMATION_POINT: "MOVE_AUTOMATION_POINT",
  REMOVE_AUTOMATION_POINT: "REMOVE_AUTOMATION_POINT",
  CONNECT_IO: "CONNECT_IO",
  DISCONNECT_IO: "DISCONNECT_IO",
  SEEK: "SEEK",
  EXPORT: "EXPORT",
  OPEN_EXPORT_DIALOG: "OPEN_EXPORT_DIALOG",
  DEBUG_SESSION: "DEBUG_SESSION",
  ADD_RANGE: "ADD_RANGE",
  REMOVE_RANGE: "REMOVE_RANGE",
  SET_RANGE: "SET_RANGE",
  LIST_RANGES: "LIST_RANGES",
  SET_LOOP_RANGE: "SET_LOOP_RANGE",
  TOGGLE_LOOP: "TOGGLE_LOOP",
  SET_PUNCH_RANGE: "SET_PUNCH_RANGE",

  // Grid & Snap
  SET_GRID: "SET_GRID",
  GET_GRID: "GET_GRID",

  // Region Editing
  COPY_REGION: "COPY_REGION",
  PASTE_REGION: "PASTE_REGION",
  DUPLICATE_REGION: "DUPLICATE_REGION",
  SPLIT_REGION: "SPLIT_REGION",
  SPLIT_AT_PLAYHEAD: "SPLIT_AT_PLAYHEAD",
  SELECT_REGION: "SELECT_REGION",
  CLEAR_SELECTION: "CLEAR_SELECTION",
  SET_REGION_TIME_DOMAIN: "SET_REGION_TIME_DOMAIN",
  TRIM_REGION: "TRIM_REGION",
  TRIM_REGION_TO_PLAYHEAD: "TRIM_REGION_TO_PLAYHEAD",
  TRIM_REGION_TO_RANGE: "TRIM_REGION_TO_RANGE",
  TRIM_TO_ADJACENT_REGION: "TRIM_TO_ADJACENT_REGION",
  SET_REGION_FADES: "SET_REGION_FADES",
  SET_REGION_LAYER: "SET_REGION_LAYER",
  SET_REGION_OPAQUE: "SET_REGION_OPAQUE",
  MERGE_REGIONS: "MERGE_REGIONS",
  SELECT_REGIONS: "SELECT_REGIONS",

  // Send Bus (Side-chain)
  ADD_SEND_BUS: "ADD_SEND_BUS",
  REMOVE_SEND_BUS: "REMOVE_SEND_BUS",
  SET_SEND_LEVEL: "SET_SEND_LEVEL",

  // Session Serialization
  SAVE_SESSION: "SAVE_SESSION",
  LOAD_SESSION: "LOAD_SESSION",
  NEW_SESSION: "NEW_SESSION",
  SAVE_SNAPSHOT: "SAVE_SNAPSHOT",

  // Markers
  ADD_MARKER: "ADD_MARKER",
  REMOVE_MARKER: "REMOVE_MARKER",
  MOVE_MARKER: "MOVE_MARKER",
  LIST_MARKERS: "LIST_MARKERS",
  GOTO_NEXT_MARKER: "GOTO_NEXT_MARKER",
  GOTO_PREV_MARKER: "GOTO_PREV_MARKER",

  // Track Enhancements
  SET_TRACK_COLOR: "SET_TRACK_COLOR",
  REORDER_TRACK: "REORDER_TRACK",
  BOUNCE_TRACK: "BOUNCE_TRACK",

  // Recording Improvements (Phase 12)
  ENABLE_PUNCH: "ENABLE_PUNCH",
  SET_LOOP_RECORDING: "SET_LOOP_RECORDING",
  SET_PRE_ROLL: "SET_PRE_ROLL",
  SET_MONITOR_WITH_EFFECTS: "SET_MONITOR_WITH_EFFECTS",

  // Advanced Editing (Phase 14)
  LOCK_REGION: "LOCK_REGION",
  SET_RIPPLE_EDIT: "SET_RIPPLE_EDIT",
  AUDITION_REGION: "AUDITION_REGION",
  STOP_AUDITION: "STOP_AUDITION",
  GROUP_REGIONS: "GROUP_REGIONS",
  UNGROUP_REGIONS: "UNGROUP_REGIONS",

  // Track Freeze
  FREEZE_TRACK: "FREEZE_TRACK",
  UNFREEZE_TRACK: "UNFREEZE_TRACK",

  // Strip Silence & Normalize
  STRIP_SILENCE: "STRIP_SILENCE",
  NORMALIZE_REGION: "NORMALIZE_REGION",

  // Playback Rate & Time Stretch
  SET_REGION_PLAYBACK_RATE: "SET_REGION_PLAYBACK_RATE",
  TIME_STRETCH_REGION: "TIME_STRETCH_REGION",

  // Region Reverse
  REVERSE_REGION: "REVERSE_REGION",

  // MIDI Editing
  ADD_MIDI_NOTE: "ADD_MIDI_NOTE",
  REMOVE_MIDI_NOTE: "REMOVE_MIDI_NOTE",
  MOVE_MIDI_NOTE: "MOVE_MIDI_NOTE",
  RESIZE_MIDI_NOTE: "RESIZE_MIDI_NOTE",
  QUANTIZE_MIDI: "QUANTIZE_MIDI",
  TRANSPOSE_MIDI: "TRANSPOSE_MIDI",
  SET_MIDI_INSTRUMENT: "SET_MIDI_INSTRUMENT",

  // Aux/Bus Tracks
  ADD_AUX_TRACK: "ADD_AUX_TRACK",
  ADD_BUS_TRACK: "ADD_BUS_TRACK",

  // Tempo Map
  ADD_TEMPO_CHANGE: "ADD_TEMPO_CHANGE",
  REMOVE_TEMPO_CHANGE: "REMOVE_TEMPO_CHANGE",

  // MIDI Input Device
  SET_MIDI_INPUT_DEVICE: "SET_MIDI_INPUT_DEVICE",

  // Plugin Presets
  APPLY_PLUGIN_PRESET: "APPLY_PLUGIN_PRESET",
  SAVE_PLUGIN_PRESET: "SAVE_PLUGIN_PRESET",

  // Stem Export
  EXPORT_STEMS: "EXPORT_STEMS",

  // Export Presets (Phase 1)
  SAVE_EXPORT_PRESET: "SAVE_EXPORT_PRESET",
  DELETE_EXPORT_PRESET: "DELETE_EXPORT_PRESET",
  LOAD_EXPORT_PRESET: "LOAD_EXPORT_PRESET",

  // MIDI File I/O (Phase 3)
  IMPORT_MIDI: "IMPORT_MIDI",
  EXPORT_MIDI: "EXPORT_MIDI",

  // Track Groups (Phase 10)
  CREATE_TRACK_GROUP: "CREATE_TRACK_GROUP",
  DELETE_TRACK_GROUP: "DELETE_TRACK_GROUP",
  ADD_TO_TRACK_GROUP: "ADD_TO_TRACK_GROUP",
  REMOVE_FROM_TRACK_GROUP: "REMOVE_FROM_TRACK_GROUP",
  SET_TRACK_PARENT: "SET_TRACK_PARENT",

  // VCA (Phase 10)
  ADD_VCA_TRACK: "ADD_VCA_TRACK",
  REMOVE_VCA_TRACK: "REMOVE_VCA_TRACK",
  SET_VCA_GAIN: "SET_VCA_GAIN",
  ASSIGN_TO_VCA: "ASSIGN_TO_VCA",

  // Scrub/Shuttle (Phase 10)
  SET_TRANSPORT_MODE: "SET_TRANSPORT_MODE",

  // CD Markers (Phase 12)
  ADD_CD_MARKER: "ADD_CD_MARKER",
  REMOVE_CD_MARKER: "REMOVE_CD_MARKER",
  GENERATE_CUE_SHEET: "GENERATE_CUE_SHEET",

  // Sidechain (Phase 12)
  SET_SIDECHAIN_SOURCE: "SET_SIDECHAIN_SOURCE",

  // Mixer Scenes
  SAVE_MIXER_SCENE: "SAVE_MIXER_SCENE",
  RECALL_MIXER_SCENE: "RECALL_MIXER_SCENE",
  DELETE_MIXER_SCENE: "DELETE_MIXER_SCENE",

  // Phase 15: Track Enhancements
  SET_TRACK_MONITOR_MODE: "SET_TRACK_MONITOR_MODE",
  SET_TRACK_TRIM_GAIN: "SET_TRACK_TRIM_GAIN",
  SET_TRACK_SOLO_ISOLATE: "SET_TRACK_SOLO_ISOLATE",
  SET_TRACK_SOLO_SAFE: "SET_TRACK_SOLO_SAFE",
  SET_TRACK_COMMENT: "SET_TRACK_COMMENT",
  SET_TRACK_RECORD_MODE: "SET_TRACK_RECORD_MODE",

  // Phase 15: Additional
  SET_TRACK_PAN_WIDTH: "SET_TRACK_PAN_WIDTH",
  SET_AUTOMATION_MODE: "SET_AUTOMATION_MODE",
  RENAME_MIXER_SCENE: "RENAME_MIXER_SCENE",
  RENAME_MARKER: "RENAME_MARKER",
  SET_MARKER_LOCKED: "SET_MARKER_LOCKED",

  // Phase 13: Editor Modes
  SET_MOUSE_MODE: "SET_MOUSE_MODE",
  SET_EDIT_MODE: "SET_EDIT_MODE",
  SET_ZOOM_FOCUS: "SET_ZOOM_FOCUS",
  ZOOM_TO_FIT: "ZOOM_TO_FIT",
  SET_FOLLOW_PLAYHEAD: "SET_FOLLOW_PLAYHEAD",
  SET_TRACK_HEIGHT: "SET_TRACK_HEIGHT",
  TOGGLE_RULER: "TOGGLE_RULER",
} as const;

export const PlayCommandSchema = z.object({
  type: z.literal(CommandType.PLAY),
  payload: z.object({}).optional(),
});

export const PauseCommandSchema = z.object({
  type: z.literal(CommandType.PAUSE),
  payload: z.object({}).optional(),
});

export const StopCommandSchema = z.object({
  type: z.literal(CommandType.STOP),
  payload: z.object({}).optional(),
});

export const AddTrackCommandSchema = z.object({
  type: z.literal(CommandType.ADD_TRACK),
  payload: z.object({
    name: z.string(),
    trackType: z.enum(["audio", "instrument"]).default("audio"),
  }),
});

export const RemoveTrackCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_TRACK),
  payload: z.object({
    trackId: z.string(),
  }),
});

export const AddRegionCommandSchema = z.object({
  type: z.literal(CommandType.ADD_REGION),
  payload: z.object({
    trackId: z.string(),
    start: z.number(),
    duration: z.number(),
    sourceUrl: z.string(),
  }),
});

export const AddPluginCommandSchema = z.object({
  type: z.literal(CommandType.ADD_PLUGIN),
  payload: z.object({
    trackId: z.string(),
    pluginId: z.string(),
    index: z.number().optional(),
    position: z.enum(["pre", "post"]).optional(),
  }),
});

export const RemovePluginCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_PLUGIN),
  payload: z.object({
    trackId: z.string(),
    processorId: z.string(),
  }),
});

export const SetPluginParameterCommandSchema = z.object({
  type: z.literal(CommandType.SET_PLUGIN_PARAMETER),
  payload: z.object({
    trackId: z.string(),
    processorId: z.string(),
    parameterId: z.string(),
    value: z.number(),
  }),
});

export const UndoCommandSchema = z.object({
  type: z.literal(CommandType.UNDO),
});

export const RedoCommandSchema = z.object({
  type: z.literal(CommandType.REDO),
});

export const SelectionUndoCommandSchema = z.object({
  type: z.literal(CommandType.SELECTION_UNDO),
});

export const SelectionRedoCommandSchema = z.object({
  type: z.literal(CommandType.SELECTION_REDO),
});

// Mixer Commands
export const SetTrackVolumeCommandSchema = z.object({
  type: z.literal(CommandType.SET_VOLUME),
  payload: z.object({
    trackId: z.string(),
    volume: z.number(),
  }),
});

export const SetTrackPanCommandSchema = z.object({
  type: z.literal(CommandType.SET_PAN),
  payload: z.object({
    trackId: z.string(),
    pan: z.number(),
  }),
});

export const SetTrackMuteCommandSchema = z.object({
  type: z.literal(CommandType.MUTE_TRACK),
  payload: z.object({
    trackId: z.string(),
    mute: z.boolean(),
  }),
});

export const SetTrackSoloCommandSchema = z.object({
  type: z.literal(CommandType.SOLO_TRACK),
  payload: z.object({
    trackId: z.string(),
    solo: z.boolean(),
  }),
});

// Region Commands
export const RemoveRegionCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
  }),
});

export const MoveRegionCommandSchema = z.object({
  type: z.literal(CommandType.MOVE_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    newStart: z.number(),
    targetTrackId: z.string().optional(),
  }),
});

export const ResizeRegionCommandSchema = z.object({
  type: z.literal(CommandType.RESIZE_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    newLength: z.number(),
  }),
});

export const TrimRegionCommandSchema = z.object({
  type: z.literal(CommandType.TRIM_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    amount: z.number(),
    direction: z.enum(["front", "back"]),
  }),
});

export const SetRegionFadesCommandSchema = z.object({
  type: z.literal(CommandType.SET_REGION_FADES),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    fadeIn: z.number().optional(),
    fadeOut: z.number().optional(),
  }),
});

export const SetRegionLayerCommandSchema = z.object({
  type: z.literal(CommandType.SET_REGION_LAYER),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    layer: z.number().int().nonnegative(),
  }),
});

export const SetRegionOpaqueCommandSchema = z.object({
  type: z.literal(CommandType.SET_REGION_OPAQUE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    opaque: z.boolean(),
  }),
});

export const MergeRegionsCommandSchema = z.object({
  type: z.literal(CommandType.MERGE_REGIONS),
  payload: z.object({
    trackId: z.string(),
    regionIds: z.array(z.string()),
  }),
});

export const SelectRegionsCommandSchema = z.object({
  type: z.literal(CommandType.SELECT_REGIONS),
  payload: z.object({
    regionIds: z.array(z.string()),
    addToSelection: z.boolean().optional(),
  }),
});

export const AddSendBusCommandSchema = z.object({
  type: z.literal(CommandType.ADD_SEND_BUS),
  payload: z.object({
    sourceTrackId: z.string(),
    destId: z.string(),
    level: z.number().optional(),
    preFader: z.boolean().optional(),
    id: z.string().optional(),
  }),
});

export const RemoveSendBusCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_SEND_BUS),
  payload: z.object({
    sendBusId: z.string(),
  }),
});

export const SetSendLevelCommandSchema = z.object({
  type: z.literal(CommandType.SET_SEND_LEVEL),
  payload: z.object({
    sendBusId: z.string(),
    level: z.number(),
  }),
});

export const SaveSessionCommandSchema = z.object({
  type: z.literal(CommandType.SAVE_SESSION),
});

// ─── SessionSnapshot Zod Schemas ─────────────────────────────────────────────

const RegionSnapshotSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  name: z.string(),
  start: z.number(),
  length: z.number(),
  sourceStart: z.number(),
  gain: z.number(),
  muted: z.boolean(),
  layer: z.number(),
  fadeIn: z.number(),
  fadeOut: z.number(),
  playbackRate: z.number(),
  timeDomain: z.number(),
  locked: z.boolean().optional(),
});

const MidiNoteSnapshotSchema = z.object({
  id: z.string(),
  pitch: z.number(),
  velocity: z.number(),
  startFrame: z.number(),
  durationFrames: z.number(),
  channel: z.number(),
});

const MidiRegionSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  start: z.number(),
  length: z.number(),
  muted: z.boolean(),
  layer: z.number(),
  locked: z.boolean().optional(),
  timeDomain: z.number().optional(),
  notes: z.array(MidiNoteSnapshotSchema),
});

const TrackSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  armed: z.boolean(),
  mute: z.boolean(),
  solo: z.boolean(),
  color: z.string().optional(),
  regions: z.array(RegionSnapshotSchema),
  midiRegions: z.array(MidiRegionSnapshotSchema).optional(),
});

const RangeSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  start: z.number(),
  end: z.number(),
});

const SendBusSnapshotSchema = z.object({
  id: z.string(),
  sourceTrackId: z.string(),
  destId: z.string(),
  level: z.number(),
  preFader: z.boolean(),
  active: z.boolean(),
});

const MarkerSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
  color: z.string(),
  locked: z.boolean(),
});

const TempoEventSnapshotSchema = z.object({
  frame: z.number(),
  bpm: z.number(),
  timeSigNum: z.number().optional(),
  timeSigDen: z.number().optional(),
});

const RegionGroupSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  regionIds: z.array(z.string()),
});

const MixerSceneTrackStateSchema = z.object({
  trackId: z.string(),
  volume: z.number(),
  pan: z.number(),
  mute: z.boolean(),
  solo: z.boolean(),
  pluginParameters: z.record(z.string(), z.record(z.string(), z.number())),
});

const MixerSceneSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  tracks: z.array(MixerSceneTrackStateSchema),
});

const SessionSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  sampleRate: z.number(),
  tempo: z.number(),
  timeSignature: z.tuple([z.number(), z.number()]),
  transportFrame: z.number(),
  tracks: z.array(TrackSnapshotSchema),
  ranges: z.array(RangeSnapshotSchema),
  sendBuses: z.array(SendBusSnapshotSchema),
  markers: z.array(MarkerSnapshotSchema).optional(),
  loopRangeId: z.string().optional(),
  loopEnabled: z.boolean(),
  punchRangeId: z.string().optional(),
  punchEnabled: z.boolean().optional(),
  preRollBars: z.number().optional(),
  loopRecordingEnabled: z.boolean().optional(),
  rippleEdit: z.boolean().optional(),
  regionGroups: z.array(RegionGroupSnapshotSchema).optional(),
  tempoMapEvents: z.array(TempoEventSnapshotSchema).optional(),
  mixerScenes: z.array(MixerSceneSnapshotSchema).optional(),
});

export const LoadSessionCommandSchema = z.object({
  type: z.literal(CommandType.LOAD_SESSION),
  payload: z.object({
    sessionId: z.string().optional(),
    snapshot: SessionSnapshotSchema.optional(),
  }),
});

export const NewSessionCommandSchema = z.object({
  type: z.literal(CommandType.NEW_SESSION),
  payload: z
    .object({
      name: z.string().optional(),
      templateId: z.string().optional(),
    })
    .optional(),
});

export const SaveSnapshotCommandSchema = z.object({
  type: z.literal(CommandType.SAVE_SNAPSHOT),
  payload: z.object({
    name: z.string(),
  }),
});

// Advanced Editing (Phase 14)
export const LockRegionCommandSchema = z.object({
  type: z.literal(CommandType.LOCK_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    locked: z.boolean(),
  }),
});

export const SetRippleEditCommandSchema = z.object({
  type: z.literal(CommandType.SET_RIPPLE_EDIT),
  payload: z.object({
    enabled: z.boolean(),
  }),
});

export const AuditionRegionCommandSchema = z.object({
  type: z.literal(CommandType.AUDITION_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
  }),
});

export const StopAuditionCommandSchema = z.object({
  type: z.literal(CommandType.STOP_AUDITION),
  payload: z.object({}).optional(),
});

export const GroupRegionsCommandSchema = z.object({
  type: z.literal(CommandType.GROUP_REGIONS),
  payload: z.object({
    regionIds: z.array(z.string()),
    name: z.string().optional(),
  }),
});

export const UngroupRegionsCommandSchema = z.object({
  type: z.literal(CommandType.UNGROUP_REGIONS),
  payload: z.object({
    groupId: z.string(),
  }),
});

// Track Freeze
export const FreezeTrackCommandSchema = z.object({
  type: z.literal(CommandType.FREEZE_TRACK),
  payload: z.object({
    trackId: z.string(),
  }),
});

export const UnfreezeTrackCommandSchema = z.object({
  type: z.literal(CommandType.UNFREEZE_TRACK),
  payload: z.object({
    trackId: z.string(),
  }),
});

// Strip Silence
export const StripSilenceCommandSchema = z.object({
  type: z.literal(CommandType.STRIP_SILENCE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    thresholdDb: z.number().optional().default(-60),
    minLengthFrames: z.number().optional().default(4410),
  }),
});

// Normalize Region
export const NormalizeRegionCommandSchema = z.object({
  type: z.literal(CommandType.NORMALIZE_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    targetDb: z.number().optional().default(0),
  }),
});

// Playback Rate
export const SetRegionPlaybackRateCommandSchema = z.object({
  type: z.literal(CommandType.SET_REGION_PLAYBACK_RATE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    playbackRate: z.number(),
  }),
});

// Pitch-Preserving Time Stretch
export const TimeStretchRegionCommandSchema = z.object({
  type: z.literal(CommandType.TIME_STRETCH_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    /** Speed multiplier (1.0 = normal, 0.5 = half speed) */
    stretch: z.number().min(0.1).max(4.0),
    /** Pitch shift in semitones (0 = no shift) */
    pitchSemitones: z.number().min(-24).max(24).default(0),
  }),
});

// Region Reverse
export const ReverseRegionCommandSchema = z.object({
  type: z.literal(CommandType.REVERSE_REGION),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
  }),
});

// MIDI Editing Commands
export const AddMidiNoteCommandSchema = z.object({
  type: z.literal(CommandType.ADD_MIDI_NOTE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    pitch: z.number().min(0).max(127),
    velocity: z.number().min(0).max(127).default(100),
    startFrame: z.number(),
    durationFrames: z.number(),
    channel: z.number().min(0).max(15).default(0),
  }),
});

export const RemoveMidiNoteCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_MIDI_NOTE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    noteId: z.string(),
  }),
});

export const MoveMidiNoteCommandSchema = z.object({
  type: z.literal(CommandType.MOVE_MIDI_NOTE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    noteId: z.string(),
    newStartFrame: z.number().optional(),
    newPitch: z.number().min(0).max(127).optional(),
  }),
});

export const ResizeMidiNoteCommandSchema = z.object({
  type: z.literal(CommandType.RESIZE_MIDI_NOTE),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    noteId: z.string(),
    newDurationFrames: z.number(),
  }),
});

export const QuantizeMidiCommandSchema = z.object({
  type: z.literal(CommandType.QUANTIZE_MIDI),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    subdivisionFrames: z.number(),
  }),
});

export const TransposeMidiCommandSchema = z.object({
  type: z.literal(CommandType.TRANSPOSE_MIDI),
  payload: z.object({
    trackId: z.string(),
    regionId: z.string(),
    semitones: z.number(),
  }),
});

export const SetMidiInstrumentCommandSchema = z.object({
  type: z.literal(CommandType.SET_MIDI_INSTRUMENT),
  payload: z.object({
    trackId: z.string(),
    instrumentType: z.string(),
  }),
});

// Aux/Bus Track Commands
export const AddAuxTrackCommandSchema = z.object({
  type: z.literal(CommandType.ADD_AUX_TRACK),
  payload: z.object({
    name: z.string(),
  }),
});

export const AddBusTrackCommandSchema = z.object({
  type: z.literal(CommandType.ADD_BUS_TRACK),
  payload: z.object({
    name: z.string(),
  }),
});

// Tempo Map Commands
export const AddTempoChangeCommandSchema = z.object({
  type: z.literal(CommandType.ADD_TEMPO_CHANGE),
  payload: z.object({
    frame: z.number(),
    bpm: z.number(),
    timeSigNum: z.number().optional(),
    timeSigDen: z.number().optional(),
  }),
});

export const RemoveTempoChangeCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_TEMPO_CHANGE),
  payload: z.object({
    frame: z.number(),
  }),
});

// MIDI Input Device
export const SetMidiInputDeviceCommandSchema = z.object({
  type: z.literal(CommandType.SET_MIDI_INPUT_DEVICE),
  payload: z.object({
    inputId: z.string().nullable(),
  }),
});

// Plugin Presets
export const ApplyPluginPresetCommandSchema = z.object({
  type: z.literal(CommandType.APPLY_PLUGIN_PRESET),
  payload: z.object({
    trackId: z.string(),
    processorId: z.string(),
    presetId: z.string(),
  }),
});

export const SavePluginPresetCommandSchema = z.object({
  type: z.literal(CommandType.SAVE_PLUGIN_PRESET),
  payload: z.object({
    name: z.string(),
    pluginId: z.string(),
    trackId: z.string(),
    processorId: z.string(),
  }),
});

// Stem Export
export const ExportStemsCommandSchema = z.object({
  type: z.literal(CommandType.EXPORT_STEMS),
  payload: z
    .object({
      filename: z.string().optional(),
      format: z.enum(["wav", "mp3", "ogg", "flac"]).optional(),
      normalize: z.boolean().optional(),
    })
    .optional(),
});

// Mixer Scenes
export const SaveMixerSceneCommandSchema = z.object({
  type: z.literal(CommandType.SAVE_MIXER_SCENE),
  payload: z.object({
    name: z.string(),
  }),
});

export const RecallMixerSceneCommandSchema = z.object({
  type: z.literal(CommandType.RECALL_MIXER_SCENE),
  payload: z.object({
    sceneId: z.string(),
  }),
});

export const DeleteMixerSceneCommandSchema = z.object({
  type: z.literal(CommandType.DELETE_MIXER_SCENE),
  payload: z.object({
    sceneId: z.string(),
  }),
});

// Track Group Commands
export const CreateTrackGroupCommandSchema = z.object({
  type: z.literal(CommandType.CREATE_TRACK_GROUP),
  payload: z.object({
    name: z.string(),
    trackIds: z.array(z.string()).optional(),
  }),
});

export const DeleteTrackGroupCommandSchema = z.object({
  type: z.literal(CommandType.DELETE_TRACK_GROUP),
  payload: z.object({
    groupId: z.string(),
  }),
});

export const AddToTrackGroupCommandSchema = z.object({
  type: z.literal(CommandType.ADD_TO_TRACK_GROUP),
  payload: z.object({
    groupId: z.string(),
    trackId: z.string(),
  }),
});

export const RemoveFromTrackGroupCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_FROM_TRACK_GROUP),
  payload: z.object({
    groupId: z.string(),
    trackId: z.string(),
  }),
});

export const SetTrackParentCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_PARENT),
  payload: z.object({
    trackId: z.string(),
    parentId: z.string().nullable(),
  }),
});

// VCA Commands
export const AddVCATrackCommandSchema = z.object({
  type: z.literal(CommandType.ADD_VCA_TRACK),
  payload: z.object({
    name: z.string(),
  }),
});

export const RemoveVCATrackCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_VCA_TRACK),
  payload: z.object({
    trackId: z.string(),
  }),
});

export const SetVCAGainCommandSchema = z.object({
  type: z.literal(CommandType.SET_VCA_GAIN),
  payload: z.object({
    trackId: z.string(),
    gain: z.number(),
  }),
});

export const AssignToVCACommandSchema = z.object({
  type: z.literal(CommandType.ASSIGN_TO_VCA),
  payload: z.object({
    trackId: z.string(),
    vcaTrackId: z.string(),
  }),
});

// Transport Mode
export const SetTransportModeCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRANSPORT_MODE),
  payload: z.object({
    mode: z.enum(["normal", "scrub", "shuttle"]),
  }),
});

// CD Marker Commands
export const AddCDMarkerCommandSchema = z.object({
  type: z.literal(CommandType.ADD_CD_MARKER),
  payload: z.object({
    name: z.string(),
    position: z.number(),
  }),
});

export const RemoveCDMarkerCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_CD_MARKER),
  payload: z.object({
    markerId: z.string(),
  }),
});

export const GenerateCueSheetCommandSchema = z.object({
  type: z.literal(CommandType.GENERATE_CUE_SHEET),
  payload: z.object({}).optional(),
});

// Sidechain
export const SetSidechainSourceCommandSchema = z.object({
  type: z.literal(CommandType.SET_SIDECHAIN_SOURCE),
  payload: z.object({
    trackId: z.string(),
    sourceTrackId: z.string(),
  }),
});

// Phase 15: Track Enhancements
export const SetTrackMonitorModeCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_MONITOR_MODE),
  payload: z.object({
    trackId: z.string(),
    mode: z.enum(["auto", "input", "disk", "external"]),
  }),
});

export const SetTrackRecordModeCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_RECORD_MODE),
  payload: z.object({
    trackId: z.string(),
    mode: z.enum(["sound_on_sound", "non_layered", "layered"]),
  }),
});

export const SetTrackTrimGainCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_TRIM_GAIN),
  payload: z.object({
    trackId: z.string(),
    trimGainDb: z.number(),
  }),
});

export const SetTrackSoloIsolateCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_SOLO_ISOLATE),
  payload: z.object({
    trackId: z.string(),
    isolate: z.boolean(),
  }),
});

export const SetTrackSoloSafeCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_SOLO_SAFE),
  payload: z.object({
    trackId: z.string(),
    safe: z.boolean(),
  }),
});

export const SetTrackCommentCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_COMMENT),
  payload: z.object({
    trackId: z.string(),
    comment: z.string(),
  }),
});

// Phase 15: Additional
export const SetTrackPanWidthCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_PAN_WIDTH),
  payload: z.object({
    trackId: z.string(),
    width: z.number(),
  }),
});

export const SetAutomationModeCommandSchema = z.object({
  type: z.literal(CommandType.SET_AUTOMATION_MODE),
  payload: z.object({
    trackId: z.string(),
    processorId: z.string(),
    parameter: z.string(),
    mode: z.enum(["off", "read", "write", "touch", "latch"]),
  }),
});

export const RenameMixerSceneCommandSchema = z.object({
  type: z.literal(CommandType.RENAME_MIXER_SCENE),
  payload: z.object({
    sceneId: z.string(),
    name: z.string(),
  }),
});

export const RenameMarkerCommandSchema = z.object({
  type: z.literal(CommandType.RENAME_MARKER),
  payload: z.object({
    markerId: z.string(),
    name: z.string(),
  }),
});

export const SetMarkerLockedCommandSchema = z.object({
  type: z.literal(CommandType.SET_MARKER_LOCKED),
  payload: z.object({
    markerId: z.string(),
    locked: z.boolean(),
  }),
});

// Phase 13: Editor Modes
export const SetMouseModeCommandSchema = z.object({
  type: z.literal(CommandType.SET_MOUSE_MODE),
  payload: z.object({
    mode: z.enum([
      "object",
      "range",
      "cut",
      "draw",
      "content",
      "audition",
      "stretch",
      "internal_edit",
    ]),
  }),
});

export const SetEditModeCommandSchema = z.object({
  type: z.literal(CommandType.SET_EDIT_MODE),
  payload: z.object({
    mode: z.enum(["slide", "ripple", "lock"]),
  }),
});

export const SetZoomFocusCommandSchema = z.object({
  type: z.literal(CommandType.SET_ZOOM_FOCUS),
  payload: z.object({
    focus: z.enum([
      "left",
      "right",
      "center",
      "playhead",
      "mouse",
      "edit_point",
    ]),
  }),
});

export const ZoomToFitCommandSchema = z.object({
  type: z.literal(CommandType.ZOOM_TO_FIT),
  payload: z.object({}).optional(),
});

export const SetFollowPlayheadCommandSchema = z.object({
  type: z.literal(CommandType.SET_FOLLOW_PLAYHEAD),
  payload: z.object({
    follow: z.boolean(),
  }),
});

export const SetTrackHeightCommandSchema = z.object({
  type: z.literal(CommandType.SET_TRACK_HEIGHT),
  payload: z.object({
    trackId: z.string(),
    height: z.number(),
  }),
});

export const ToggleRulerCommandSchema = z.object({
  type: z.literal(CommandType.TOGGLE_RULER),
  payload: z.object({
    ruler: z.enum([
      "bbt",
      "timecode",
      "minsec",
      "samples",
      "markers",
      "ranges",
      "tempo",
    ]),
  }),
});

export const AudioCommandSchema = z.discriminatedUnion("type", [
  PlayCommandSchema,
  PauseCommandSchema,
  StopCommandSchema,
  AddTrackCommandSchema,
  RemoveTrackCommandSchema,
  AddRegionCommandSchema,
  AddPluginCommandSchema,
  RemovePluginCommandSchema,
  SetPluginParameterCommandSchema,
  UndoCommandSchema,
  RedoCommandSchema,
  SelectionUndoCommandSchema,
  SelectionRedoCommandSchema,
  z.object({
    type: z.literal(CommandType.ADD_AUTOMATION),
    payload: z.object({
      trackId: z.string(),
      processorId: z.string(),
      parameter: z.string(),
      time: z.number(),
      value: z.number(),
      interpolation: z.enum(["Linear", "Exponential", "Hold"]).optional(),
    }),
  }),
  z.object({ type: z.literal(CommandType.START_RECORDING) }),
  z.object({ type: z.literal(CommandType.STOP_RECORDING) }),
  z.object({ type: z.literal(CommandType.TOGGLE_METRONOME) }),
  z.object({
    type: z.literal(CommandType.ADD_SOURCE),
    payload: z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      duration: z.number(),
      trackId: z.string().optional(),
      start: z.number().optional(),
      videoMetadata: z
        .object({
          fps: z.number(),
          width: z.number(),
          height: z.number(),
          codec: z.string(),
          format: z.string(),
          frameCount: z.number(),
          hasAudio: z.boolean(),
          thumbnailUrl: z.string().optional(),
          originalVideoUrl: z.string(),
        })
        .optional(),
    }),
  }),
  SetTrackVolumeCommandSchema,
  SetTrackPanCommandSchema,
  SetTrackMuteCommandSchema,
  SetTrackSoloCommandSchema,
  RemoveRegionCommandSchema,
  MoveRegionCommandSchema,
  ResizeRegionCommandSchema,
  TrimRegionCommandSchema,
  SetRegionFadesCommandSchema,
  SetRegionLayerCommandSchema,
  SetRegionOpaqueCommandSchema,
  MergeRegionsCommandSchema,
  z.object({
    type: z.literal(CommandType.SET_TEMPO),
    payload: z.object({ bpm: z.number() }),
  }),
  z.object({
    type: z.literal(CommandType.SET_TIME_SIGNATURE),
    payload: z.object({ numerator: z.number(), denominator: z.number() }),
  }),
  z.object({
    type: z.literal(CommandType.ARM_TRACK),
    payload: z.object({ trackId: z.string(), armed: z.boolean() }),
  }),
  z.object({
    type: z.literal(CommandType.SET_TRACK_MONITOR),
    payload: z.object({ trackId: z.string(), monitor: z.boolean() }),
  }),
  z.object({
    type: z.literal(CommandType.SEEK),
    payload: z.object({ time: z.number() }),
  }),
  z.object({
    type: z.literal(CommandType.CONNECT_IO),
    payload: z.object({ sourceId: z.string(), destId: z.string() }),
  }),
  z.object({
    type: z.literal(CommandType.DISCONNECT_IO),
    payload: z.object({ sourceId: z.string(), destId: z.string() }),
  }),
  z.object({
    type: z.literal(CommandType.MOVE_AUTOMATION_POINT),
    payload: z.object({
      trackId: z.string(),
      processorId: z.string(),
      parameter: z.string(),
      pointId: z.string(),
      newTime: z.number(),
      newValue: z.number(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.REMOVE_AUTOMATION_POINT),
    payload: z.object({
      trackId: z.string(),
      processorId: z.string(),
      parameter: z.string(),
      pointId: z.string(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.EXPORT),
    payload: z
      .object({
        filename: z.string().optional(),
        format: z.enum(["wav", "mp3", "ogg", "flac"]).optional(),
        sampleFormat: z.enum(["int16", "int24", "float32"]).optional(),
        normalize: z.boolean().optional(),
        rangeId: z.string().optional(), // Export named range
        startFrame: z.number().optional(),
        endFrame: z.number().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal(CommandType.OPEN_EXPORT_DIALOG),
    payload: z.object({}).passthrough().optional(),
  }),
  z.object({
    type: z.literal(CommandType.DEBUG_SESSION),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal(CommandType.ADD_RANGE),
    payload: z.object({
      name: z.string(),
      start: z.number(),
      end: z.number(),
      color: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.REMOVE_RANGE),
    payload: z.object({
      rangeId: z.string(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.SET_RANGE),
    payload: z.object({
      rangeId: z.string(),
      name: z.string().optional(),
      start: z.number().optional(),
      end: z.number().optional(),
      color: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.LIST_RANGES),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal(CommandType.SET_LOOP_RANGE),
    payload: z
      .object({
        rangeId: z.string().optional(), // undefined to clear
      })
      .optional(),
  }),
  z.object({
    type: z.literal(CommandType.TOGGLE_LOOP),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal(CommandType.SET_PUNCH_RANGE),
    payload: z
      .object({
        rangeId: z.string().optional(), // undefined to clear
      })
      .optional(),
  }),
  z.object({
    type: z.literal(CommandType.SET_GRID),
    payload: z
      .object({
        gridType: z.string().optional(),
        snapMode: z.string().optional(),
        snapToGrid: z.boolean().optional(),
        bpm: z.number().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal(CommandType.GET_GRID),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal(CommandType.COPY_REGION),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal(CommandType.PASTE_REGION),
    payload: z
      .object({
        trackId: z.string().optional(),
        position: z.number().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal(CommandType.DUPLICATE_REGION),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal(CommandType.SPLIT_REGION),
    payload: z.object({
      trackId: z.string(),
      regionId: z.string(),
      position: z.number(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.SPLIT_AT_PLAYHEAD),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal(CommandType.SELECT_REGION),
    payload: z.object({
      regionId: z.string(),
      addToSelection: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.SELECT_REGIONS),
    payload: z.object({
      regionIds: z.array(z.string()),
      addToSelection: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.CLEAR_SELECTION),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal(CommandType.SET_REGION_TIME_DOMAIN),
    payload: z.object({
      trackId: z.string(),
      regionId: z.string(),
      timeDomain: z.number(), // Enum value
    }),
  }),
  AddSendBusCommandSchema,
  RemoveSendBusCommandSchema,
  SetSendLevelCommandSchema,
  SaveSessionCommandSchema,
  LoadSessionCommandSchema,
  NewSessionCommandSchema,
  SaveSnapshotCommandSchema,
  // Markers
  z.object({
    type: z.literal(CommandType.ADD_MARKER),
    payload: z.object({
      name: z.string(),
      position: z.number(),
      color: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.REMOVE_MARKER),
    payload: z.object({
      markerId: z.string(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.MOVE_MARKER),
    payload: z.object({
      markerId: z.string(),
      position: z.number(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.LIST_MARKERS),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal(CommandType.GOTO_NEXT_MARKER),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal(CommandType.GOTO_PREV_MARKER),
    payload: z.object({}).optional(),
  }),
  // Track Enhancements
  z.object({
    type: z.literal(CommandType.SET_TRACK_COLOR),
    payload: z.object({
      trackId: z.string(),
      color: z.string(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.REORDER_TRACK),
    payload: z.object({
      trackId: z.string(),
      newIndex: z.number(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.BOUNCE_TRACK),
    payload: z.object({
      trackId: z.string(),
    }),
  }),
  // Recording Improvements (Phase 12)
  z.object({
    type: z.literal(CommandType.ENABLE_PUNCH),
    payload: z.object({
      enabled: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.SET_LOOP_RECORDING),
    payload: z.object({
      enabled: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.SET_PRE_ROLL),
    payload: z.object({
      bars: z.number(),
    }),
  }),
  z.object({
    type: z.literal(CommandType.SET_MONITOR_WITH_EFFECTS),
    payload: z.object({
      trackId: z.string(),
      enabled: z.boolean(),
    }),
  }),
  // Advanced Editing (Phase 14)
  LockRegionCommandSchema,
  SetRippleEditCommandSchema,
  AuditionRegionCommandSchema,
  StopAuditionCommandSchema,
  GroupRegionsCommandSchema,
  UngroupRegionsCommandSchema,
  FreezeTrackCommandSchema,
  UnfreezeTrackCommandSchema,
  StripSilenceCommandSchema,
  NormalizeRegionCommandSchema,
  SetRegionPlaybackRateCommandSchema,
  ReverseRegionCommandSchema,
  // MIDI
  AddMidiNoteCommandSchema,
  RemoveMidiNoteCommandSchema,
  MoveMidiNoteCommandSchema,
  ResizeMidiNoteCommandSchema,
  QuantizeMidiCommandSchema,
  TransposeMidiCommandSchema,
  SetMidiInstrumentCommandSchema,
  // Aux/Bus Tracks
  AddAuxTrackCommandSchema,
  AddBusTrackCommandSchema,
  // Tempo Map
  AddTempoChangeCommandSchema,
  RemoveTempoChangeCommandSchema,
  // MIDI Input Device
  SetMidiInputDeviceCommandSchema,
  // Plugin Presets
  ApplyPluginPresetCommandSchema,
  SavePluginPresetCommandSchema,
  // Stem Export
  ExportStemsCommandSchema,
  // Mixer Scenes
  SaveMixerSceneCommandSchema,
  RecallMixerSceneCommandSchema,
  DeleteMixerSceneCommandSchema,
  // Track Groups
  CreateTrackGroupCommandSchema,
  DeleteTrackGroupCommandSchema,
  AddToTrackGroupCommandSchema,
  RemoveFromTrackGroupCommandSchema,
  SetTrackParentCommandSchema,
  // VCA
  AddVCATrackCommandSchema,
  RemoveVCATrackCommandSchema,
  SetVCAGainCommandSchema,
  AssignToVCACommandSchema,
  // Transport Mode
  SetTransportModeCommandSchema,
  // CD Markers
  AddCDMarkerCommandSchema,
  RemoveCDMarkerCommandSchema,
  GenerateCueSheetCommandSchema,
  // Sidechain
  SetSidechainSourceCommandSchema,
  // Phase 15: Track Enhancements
  SetTrackPanWidthCommandSchema,
  SetAutomationModeCommandSchema,
  RenameMixerSceneCommandSchema,
  RenameMarkerCommandSchema,
  SetMarkerLockedCommandSchema,
  SetTrackMonitorModeCommandSchema,
  SetTrackRecordModeCommandSchema,
  SetTrackTrimGainCommandSchema,
  SetTrackSoloIsolateCommandSchema,
  SetTrackSoloSafeCommandSchema,
  SetTrackCommentCommandSchema,
  // Phase 13: Editor Modes
  SetMouseModeCommandSchema,
  SetEditModeCommandSchema,
  SetZoomFocusCommandSchema,
  ZoomToFitCommandSchema,
  SetFollowPlayheadCommandSchema,
  SetTrackHeightCommandSchema,
  ToggleRulerCommandSchema,
]);

export type AudioCommand = z.infer<typeof AudioCommandSchema>;
