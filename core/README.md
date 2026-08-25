# @daw-engine/core

Headless DAW (Digital Audio Workstation) engine for TypeScript/JavaScript. Provides domain models, command system, audio engine, automation, plugins, and MIDI — all with zero browser or framework dependencies.

```bash
npm install @daw-engine/core
```

## Features

- **Headless** — No browser, no React, no framework required. Runs in Node.js, Electron, or any JS runtime.
- **Command Pattern** — All mutations go through `CommandExecutor` with built-in Undo/Redo.
- **Dependency Injection** — Bring your own audio backend via the `AudioProvider` interface.
- **60+ Commands** — Transport, tracks, regions, automation, plugins, MIDI, markers, ranges, export.
- **20+ Built-in Plugins** — EQ, compressor, reverb, delay, saturation, de-esser, and more.
- **Signal-based Events** — Type-safe reactive event system (Qt Signal/Slot pattern).
- **Serialization** — Full session save/load with JSON snapshots.
- **TypeScript-first** — Complete type definitions included.

---

## Quick Start

```typescript
import {
  AudioEngine,
  Session,
  Track,
  TrackType,
  CommandExecutor,
  CommandType,
} from "@daw-engine/core";

// 1. Implement AudioProvider interface for your platform
class MyAudioBackend implements AudioProvider {
  // ... implement the interface methods
}

// 2. Initialize the engine with your backend
const engine = AudioEngine.getInstance(new MyAudioBackend());

// 3. Work with the session directly
const track = engine.session.addTrack("Vocals", TrackType.AUDIO);

// 4. Or use the command system (with undo/redo support)
await CommandExecutor.getInstance().execute({
  type: CommandType.ADD_TRACK,
  payload: { name: "Guitar", trackType: "audio" },
});
```

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Your App                                        │
│  (React, Electron, Node.js CLI, etc.)            │
│                                                  │
│  ┌─────────────┐  ┌────────────────────────────┐ │
│  │ UI Layer    │  │ AudioProvider (impl)        │ │
│  │ (optional)  │  │ e.g. Web Audio, PortAudio  │ │
│  └──────┬──────┘  └─────────────┬──────────────┘ │
├─────────┼───────────────────────┼────────────────┤
│         ▼                       ▼                │
│  ┌─────────────┐  ┌────────────────────────────┐ │
│  │ Command     │  │ AudioEngine                │ │
│  │ Executor    │  │ (session + backend)        │ │
│  └──────┬──────┘  └────────────────────────────┘ │
│         ▼                                        │
│  ┌───────────────────────────────────────┐       │
│  │ Domain Layer                          │       │
│  │ Session → Track → Playlist → Region   │       │
│  │ Automation, Plugins, MIDI, Markers    │       │
│  └───────────────────────────────────────┘       │
│                                                  │
│  @daw-engine/core                                        │
└──────────────────────────────────────────────────┘
```

---

## Core Concepts

### Session

The root container for a DAW project. Manages tracks, sources, markers, ranges, tempo, and transport state.

```typescript
import { Session, TrackType } from "@daw-engine/core";

const session = new Session("My Song", undefined, 44100);

// Tracks
const vocal = session.addTrack("Vocals", TrackType.AUDIO);
const bass = session.addTrack("Bass", TrackType.AUDIO);
const synth = session.addTrack("Synth", TrackType.MIDI);
const reverb = session.addAuxTrack("Reverb Bus");

// Transport
session.setTempo(120);
session.setTimeSignature(4, 4);

// Markers
session.addMarker("Chorus", 44100 * 30); // at 30 seconds

// Ranges
const loopRange = session.addRange("Loop A", 44100 * 10, 44100 * 20);
session.setLoopRange(loopRange.id);
session.setLoopEnabled(true);

// Serialization
const snapshot = session.toJSON();
const restored = Session.fromJSON(snapshot);
```

### Track

Represents an audio, MIDI, aux, bus, folder, or VCA track. Each track has a `Route` (signal chain) and a `Playlist` (region container).

```typescript
const track = session.addTrack("Lead Guitar", TrackType.AUDIO);

track.setMute(false);
track.setSolo(true);
track.setArmed(true);
track.setColor("#ff6b6b");
track.setMonitorMode(MonitorMode.AUTO);

// React to changes
track.muteChanged.connect((muted) => console.log("Mute:", muted));
track.soloChanged.connect((soloed) => console.log("Solo:", soloed));
```

**Track Types:**

| Type     | Description                                       |
| -------- | ------------------------------------------------- |
| `AUDIO`  | Standard audio track with region playback         |
| `MIDI`   | MIDI track with note data and virtual instruments |
| `AUX`    | Auxiliary bus for send effects (reverb, delay)    |
| `BUS`    | Mix bus for subgroup routing                      |
| `FOLDER` | Folder track for organizing child tracks          |
| `VCA`    | VCA fader for linked level control                |

### Region

A segment of audio on the timeline, referencing a `Source`.

```typescript
import { Region } from "@daw-engine/core";

const region = new Region(
  "region-1", // id
  "source-1", // sourceId
  0, // start (frames)
  44100 * 10, // length (10 seconds at 44.1kHz)
  0, // sourceStart
  "Vocal Take 1", // name
);

region.setFadeIn(4410); // 100ms fade in
region.setFadeOut(4410); // 100ms fade out
region.move(44100 * 5); // move to 5 seconds
region.resize(44100 * 8); // resize to 8 seconds
```

### AudioEngine

Central controller connecting the session to an audio backend. Uses the singleton pattern with dependency injection.

```typescript
import { AudioEngine, AudioProvider } from "@daw-engine/core";

// Initialize with your backend implementation
const engine = AudioEngine.getInstance(myBackend);
await engine.initialize();

// Transport
await engine.start();
engine.pause();
engine.seek(10.5); // seek to 10.5 seconds
engine.stop();

// Metering
const meter = engine.getMeterData("track-1");
console.log("Peak:", meter.peak, "RMS:", meter.rms);

// Export
await engine.exportAudio(engine.getExportConfig(), engine.getExportStatus());

// Swap backend at runtime
engine.setBackend(new DifferentBackend());
```

### AudioProvider Interface

Implement this interface to connect @daw-engine/core to any audio system.

```typescript
import { AudioProvider, RoutingSnapshot } from "@daw-engine/core";

class WebAudioBackend implements AudioProvider {
  async initialize(): Promise<void> {
    /* ... */
  }

  applyRoutingSnapshot(snapshot: RoutingSnapshot): void {
    // Replace the runtime graph atomically. Do not retain mutable Session objects.
  }

  // Transport
  start(): void {
    /* ... */
  }
  async stopWithDeclick(): Promise<void> {
    // Fade the output to silence, stop the transport, and prepare the next start.
  }
  stop(): void {
    /* ... */
  }
  pause(): void {
    /* ... */
  }
  seek(time: number): void {
    /* ... */
  }

  // Track management
  createTrack(trackId, name, inputId, outputId): void {
    /* ... */
  }
  deleteTrack(trackId): void {
    /* ... */
  }

  // Region scheduling
  scheduleRegion(trackId, region): void {
    /* ... */
  }
  updateRegions(trackId, regions): void {
    /* ... */
  }
  removeRegion(trackId, regionId): void {
    /* ... */
  }

  // Metering
  getMeterData(trackId): MeterData {
    /* ... */
  }
  getMasterMeterData(): MeterData {
    /* ... */
  }

  // ... and more (see full interface in source)
}
```

`stopWithDeclick()` is optional. When provided, `AudioEngine.stop()` keeps the
transport in `DECLICK_TO_STOP` until the returned promise settles. Providers
without this capability continue to use the immediate `stop()` fallback.

**Included backend examples (in the daw-engine app, not in this package):**

| Backend                 | Environment | Description                   |
| ----------------------- | ----------- | ----------------------------- |
| `ToneAudioProvider`     | Browser     | Tone.js + Web Audio API       |
| `HeadlessAudioProvider` | Node.js     | No-op backend for CLI/testing |
| `MockAudioProvider`     | Test        | Mock backend for unit tests   |

---

## Command System

All state mutations can go through the command system, providing validation (via Zod), handler routing, and undo/redo support.

### Executing Commands

```typescript
import { CommandExecutor, CommandType } from "@daw-engine/core";

const executor = CommandExecutor.getInstance();

// Add a track
await executor.execute({
  type: CommandType.ADD_TRACK,
  payload: { name: "Vocals", trackType: "audio" },
});

// Set volume
await executor.execute({
  type: CommandType.SET_VOLUME,
  payload: { trackId: "track-1", volume: 0.75 },
});

// Split region at playhead
await executor.execute({
  type: CommandType.SPLIT_AT_PLAYHEAD,
  payload: { trackId: "track-1", frame: 44100 * 15 },
});

// Add a plugin
await executor.execute({
  type: CommandType.ADD_PLUGIN,
  payload: { trackId: "track-1", pluginId: "internal-eq6" },
});
```

### Undo / Redo

```typescript
const history = executor.history;

await history.undo();
await history.redo();
await history.undoMultiple(3); // undo 3 steps

console.log(history.canUndo); // true
console.log(history.nextUndoLabel); // "Add Track"

// Transaction: group multiple commands into one undo step
history.beginTransaction("Move and resize");
// ... execute multiple commands ...
await history.commitTransaction();
```

### Registering Custom Handlers

```typescript
import { CommandHandler, CommandResult } from "@daw-engine/core";

class MyCustomHandler implements CommandHandler {
  readonly handledTypes = ["MY_CUSTOM_COMMAND"];

  async execute(type: string, payload: any): Promise<CommandResult> {
    // your logic here
    return { success: true };
  }
}

CommandExecutor.getInstance().registerHandler(new MyCustomHandler());
```

### Command Types

**Transport:** `PLAY`, `PAUSE`, `STOP`, `SEEK`, `SET_TEMPO`, `SET_TIME_SIGNATURE`, `TOGGLE_METRONOME`, `START_RECORDING`, `STOP_RECORDING`

**Tracks:** `ADD_TRACK`, `REMOVE_TRACK`, `SET_VOLUME`, `SET_PAN`, `MUTE_TRACK`, `SOLO_TRACK`, `ARM_TRACK`, `SET_TRACK_MONITOR`

**Regions:** `ADD_REGION`, `REMOVE_REGION`, `MOVE_REGION`, `RESIZE_REGION`, `SPLIT_AT_PLAYHEAD`, `DUPLICATE_REGION`, `COPY_REGION`, `PASTE_REGION`, `MERGE_REGIONS`, `TRIM_REGION`, `SET_REGION_FADES`, `REVERSE_REGION`, `NORMALIZE_REGION`, `STRIP_SILENCE`, `TIME_STRETCH_REGION`, `LOCK_REGION`, `GROUP_REGIONS`, `UNGROUP_REGIONS`

**Automation:** `ADD_AUTOMATION`, `MOVE_AUTOMATION_POINT`, `REMOVE_AUTOMATION_POINT`

**Plugins:** `ADD_PLUGIN`, `REMOVE_PLUGIN`, `SET_PLUGIN_PARAMETER`

**Ranges:** `ADD_RANGE`, `REMOVE_RANGE`, `SET_RANGE`, `SET_LOOP_RANGE`, `SET_PUNCH_RANGE`, `TOGGLE_LOOP`

**Markers:** `ADD_MARKER`, `REMOVE_MARKER`, `MOVE_MARKER`

**IO/Routing:** `CONNECT_IO`, `DISCONNECT_IO`, `ADD_SEND_BUS`, `REMOVE_SEND_BUS`, `SET_SEND_LEVEL`

**Session:** `EXPORT`, `NEW_SESSION`, `LOAD_SESSION`, `SAVE_SESSION`, `SAVE_SNAPSHOT`

**History:** `UNDO`, `REDO`, `SELECTION_UNDO`, `SELECTION_REDO`

---

## Plugins

20+ built-in audio effect plugins, managed by `PluginManager`.

```typescript
import { PluginManager } from "@daw-engine/core";

const manager = PluginManager.getInstance();

// List all available plugins
const plugins = manager.getAvailablePlugins();
plugins.forEach((p) => console.log(p.id, p.name));

// Create a plugin instance
const eq = manager.createPlugin("internal-eq6");
eq.setParameter("band1-freq", 100);
eq.setParameter("band1-gain", 3.0);

// Get/set full state (presets)
const state = eq.getState();
eq.setState(state);

// React to parameter changes
eq.parameterChanged.connect(({ id, value }) => {
  console.log(`${id} changed to ${value}`);
});
```

### Available Plugins

| ID                        | Name                 | Description                 |
| ------------------------- | -------------------- | --------------------------- |
| `internal-eq6`            | Parametric EQ        | 6-band parametric equalizer |
| `internal-compressor`     | Compressor           | Dynamics compressor         |
| `internal-multiband-comp` | Multiband Compressor | Multi-band dynamics         |
| `internal-expander`       | Expander             | Expander/gate               |
| `internal-gate`           | Gate                 | Noise gate                  |
| `internal-deesser`        | De-Esser             | Sibilance reduction         |
| `internal-reverb`         | Reverb               | Algorithmic reverb          |
| `internal-convolver`      | Convolution Reverb   | IR-based reverb             |
| `internal-delay`          | Delay                | Simple delay                |
| `internal-sync-delay`     | Sync Delay           | BPM-synced delay            |
| `internal-chorus`         | Chorus               | Chorus effect               |
| `internal-phaser`         | Phaser               | Phaser effect               |
| `internal-tremolo`        | Tremolo              | Tremolo effect              |
| `internal-vibrato`        | Vibrato              | Vibrato effect              |
| `internal-autopan`        | Auto Pan             | Automatic panning           |
| `internal-distortion`     | Distortion           | Distortion/overdrive        |
| `internal-tape-sat`       | Tape Saturation      | Analog tape emulation       |
| `internal-filter`         | Filter               | Multi-mode filter           |
| `internal-eq3`            | 3-Band EQ            | Simple 3-band EQ            |
| `internal-gain`           | Gain                 | Utility gain                |

---

## Automation

Per-parameter automation with multiple recording modes.

```typescript
import { AutomationList, AutomationMode } from "@daw-engine/core";

const automation = new AutomationList();

// Add points
automation.addPoint(0, 0.5); // value 0.5 at time 0
automation.addPoint(2.0, 1.0); // value 1.0 at time 2s
automation.addPoint(4.0, 0.0); // value 0.0 at time 4s

// Read interpolated value
const value = automation.getValueAt(1.0); // ~0.75 (linear interpolation)

// Modes
automation.mode = AutomationMode.READ; // playback only
automation.mode = AutomationMode.WRITE; // overwrite
automation.mode = AutomationMode.TOUCH; // write while touching, snap back on release
automation.mode = AutomationMode.LATCH; // write while touching, hold last value

// Range operations
const copied = automation.copy(1.0, 3.0);
automation.paste(copied, 5.0);
automation.eraseRange(1.0, 3.0);
```

---

## Signal (Event System)

Type-safe event emitter inspired by Qt's Signal/Slot pattern. Used throughout the domain layer.

```typescript
import { Signal } from "@daw-engine/core";

const signal = new Signal<number>();

// Subscribe
const sub = signal.connect((value) => {
  console.log("Received:", value);
});

// Emit
signal.emit(42); // logs "Received: 42"

// Unsubscribe
sub.dispose();

// Or disconnect by reference
const handler = (v: number) => console.log(v);
signal.connect(handler);
signal.disconnect(handler);

// Clear all listeners
signal.clear();
```

### Common Signals

```typescript
// Session
session.trackAdded.connect((track) => {
  /* ... */
});
session.trackRemoved.connect((trackId) => {
  /* ... */
});
session.tempoChanged.connect((bpm) => {
  /* ... */
});
session.playingChanged.connect((isPlaying) => {
  /* ... */
});
session.selectionChanged.connect((selectedIds) => {
  /* ... */
});
session.markerAdded.connect((marker) => {
  /* ... */
});

// Track
track.muteChanged.connect((muted) => {
  /* ... */
});
track.soloChanged.connect((soloed) => {
  /* ... */
});
track.armChanged.connect((armed) => {
  /* ... */
});

// CommandExecutor
executor.commandExecuted.connect(({ type, payload }) => {
  /* ... */
});

// CommandHistory
history.historyChanged.connect(() => {
  /* ... */
});
```

---

## Actions & Key Bindings

Map keyboard shortcuts to commands.

```typescript
import { ActionRegistry, ActionCategory } from "@daw-engine/core";

const registry = ActionRegistry.getInstance();

// Register default actions (typically done at app bootstrap)
registry.registerDefaults([
  {
    id: "transport.play",
    label: "Play/Pause",
    category: ActionCategory.TRANSPORT,
    defaultKey: "Space",
    commandFactory: () => ({ type: CommandType.PLAY, payload: {} }),
  },
  {
    id: "edit.undo",
    label: "Undo",
    category: ActionCategory.EDIT,
    defaultKey: "Ctrl+Z",
    commandFactory: () => ({ type: CommandType.UNDO, payload: {} }),
  },
]);

// Execute by action ID
await registry.execute("transport.play");

// Query
const actions = registry.getActionsByCategory();
const key = registry.getEffectiveKey("transport.play"); // 'Space'
```

### Custom Key Bindings

```typescript
import { KeyBindings } from "@daw-engine/core";

const bindings = KeyBindings.getInstance();

bindings.setBinding("transport.play", "Enter");
bindings.getBinding("transport.play"); // 'Enter'
bindings.removeBinding("transport.play"); // back to default
bindings.resetToDefaults();
```

---

## Preferences

Persistent settings with defaults.

```typescript
import { Preferences } from "@daw-engine/core";

const prefs = Preferences.getInstance();

prefs.set("sampleRate", 48000);
prefs.set("audioBufferSize", 256);
prefs.set("theme", "dark");
prefs.set("snapToGrid", true);
prefs.set("historyDepth", 100);

const sr = prefs.get("sampleRate"); // 48000

// React to changes
prefs.preferenceChanged.connect(() => {
  console.log("Settings updated");
});

// Reset
prefs.resetToDefaults();
```

**Available Keys:** `audioBufferSize`, `sampleRate`, `theme`, `autoSaveInterval`, `snapToGrid`, `gridSubdivision`, `meterType`, `showMinimap`, `followPlayhead`, `countInBars`, `historyDepth`, `saveHistory`, `saveHistoryDepth`

---

## Storage

Session persistence via IndexedDB (browser) or localStorage fallback.

```typescript
import { SessionStorage } from "@daw-engine/core";

const storage = SessionStorage.getInstance();

// Save
await storage.saveSession(session);

// List
const sessions = await storage.listSessions();
// [{ id: '...', name: 'My Song', modified: Date }]

// Load
const snapshot = await storage.loadSession(sessions[0].id);
const restored = Session.fromJSON(snapshot);

// Snapshots (named save points)
const snapId = await storage.saveSnapshot(
  session.id,
  "Before mixing",
  session.toJSON(),
);
const snap = await storage.loadSnapshot(snapId);

// Delete
await storage.deleteSession(session.id);
```

---

## Processing Chain

Each track has a `Route` containing an ordered chain of processors.

```typescript
import {
  GainProcessor,
  PanProcessor,
  PluginInsert,
  SendProcessor,
  MeterProcessor,
} from "@daw-engine/core";

// Processor types available in the chain:
// GainProcessor  — Fader / Trim level control
// PanProcessor   — Stereo panning and width
// PluginInsert   — Plugin effect slot
// SendProcessor  — Pre/Post fader send to aux bus
// MeterProcessor — Peak/RMS metering
```

---

## Usage Examples

### Node.js CLI

```typescript
import {
  AudioEngine,
  Session,
  CommandExecutor,
  CommandType,
} from "@daw-engine/core";

// Headless backend (no audio output)
class HeadlessBackend implements AudioProvider {
  async initialize() {}
  start() {}
  stop() {}
  // ... no-op implementations
}

const engine = AudioEngine.getInstance(new HeadlessBackend());
const session = engine.session;

session.addTrack("Track 1", TrackType.AUDIO);
console.log(
  "Tracks:",
  session.tracks.map((t) => t.name),
);

const snapshot = session.toJSON();
// Save to file, process offline, etc.
```

### Electron App

```typescript
import { AudioEngine, AudioProvider } from "@daw-engine/core";

class ElectronAudioBackend implements AudioProvider {
  // Use PortAudio or native audio APIs
  // ...
}

const engine = AudioEngine.getInstance(new ElectronAudioBackend());
await engine.initialize();
```

### React Integration

```typescript
import { useEffect, useState } from "react";
import { AudioEngine, Session } from "@daw-engine/core";

function useDAWEngine(backend: AudioProvider) {
  const [engine] = useState(() => AudioEngine.getInstance(backend));

  useEffect(() => {
    const sub = engine.session.tempoChanged.connect((bpm) => {
      // update React state
    });
    return () => sub.dispose();
  }, [engine]);

  return engine;
}
```

---

## API Reference

### Singletons

| Class             | Access                  | Description                             |
| ----------------- | ----------------------- | --------------------------------------- |
| `AudioEngine`     | `getInstance(backend?)` | Audio engine with session and transport |
| `CommandExecutor` | `getInstance()`         | Command dispatch with validation        |
| `PluginManager`   | `getInstance()`         | Plugin factory                          |
| `ActionRegistry`  | `getInstance()`         | Keyboard shortcut ↔ command mapping     |
| `Preferences`     | `getInstance()`         | User settings                           |
| `KeyBindings`     | `getInstance()`         | Custom key binding overrides            |
| `SessionStorage`  | `getInstance()`         | Session persistence                     |

### Domain Models

| Class             | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `Session`         | Project root — tracks, sources, markers, ranges, tempo |
| `Track`           | Audio/MIDI/AUX/BUS/FOLDER/VCA track                    |
| `Region`          | Audio segment on the timeline                          |
| `Playlist`        | Region collection within a track                       |
| `Source`          | Audio file reference (URL, duration, sampleRate)       |
| `Range`           | Loop/punch/selection range                             |
| `Marker`          | Timeline marker (position + name)                      |
| `MidiNote`        | Single MIDI note event                                 |
| `MidiRegion`      | MIDI note collection on the timeline                   |
| `SendBus`         | Pre/post fader send bus                                |
| `Route`           | Signal chain (input → processors → output)             |
| `TempoMap`        | BPM change events over time                            |
| `GridSettings`    | Grid type and snap mode                                |
| `CrossfadeEngine` | Automatic crossfade calculation                        |
| `MixerScene`      | Mixer snapshot save/restore                            |
| `TrackGroup`      | Track grouping for linked control                      |

### Type Definitions

```typescript
type FrameCount = number; // sample frame position
type SampleRate = number; // e.g. 44100, 48000, 96000
type Gain = number; // 0.0 to 1.0+
type DB = number; // decibels

type TrackId = string;
type RegionId = string;
type SourceId = string;
type RangeId = string;
type ProcessorId = string;
type RouteId = string;
```

---

## Dependencies

| Package        | Type            | Description                |
| -------------- | --------------- | -------------------------- |
| `zod`          | runtime         | Command payload validation |
| `lamejs`       | peer (optional) | MP3 export support         |
| `soundtouchjs` | peer (optional) | Time-stretch / pitch-shift |

---

## License

MIT
