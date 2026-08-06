# DAW Engine

DAW Engine is a TypeScript library for implementing DAW editing state and workflows.

It manages multitrack editing state with `Session`, `Track`, and `Region`, and executes editing operations such as move, split, trim, and fade as commands.

It does not depend on a specific UI framework or audio runtime, so you can connect the UI and audio backend that suit your product.

## Features

- DAW domain model based on `Session`, `Track`, `Region`, and `Source`
- Command execution with Zod validation and handlers
- Undo/redo and transactions
- Non-destructive editing that preserves the original audio
- Replaceable `AudioProvider` interface
- Timeline, waveform, and canvas calculation utilities
- State change subscriptions based on `Signal<T>`
- Session serialization and restoration

## Packages

| Package                              | Description                                                |
| ------------------------------------ | ---------------------------------------------------------- |
| [`@daw-engine/core`](./core)         | DAW domain, commands, history, and audio backend interface |
| [`@daw-engine/ui-utils`](./ui-utils) | Timeline, waveform, and canvas rendering calculations      |

`ui-utils` depends on `core`. If you do not need timeline or waveform features, you can install `core` only.

## Installation

npm Registry 배포 전에는 재현 가능한 설치를 위해 commit SHA를 고정한 Git dependency를 사용합니다.

```json
{
  "dependencies": {
    "@daw-engine/core": "git+https://github.com/HURRAEY/daw-engine.git#<commit-sha>"
  }
}
```

저장소 루트의 `prepare`가 `core/dist`를 빌드하며, 소비자는 일반 package import를 사용합니다.

```bash
npm install @daw-engine/core
```

To use the timeline and waveform utilities, install both packages.

```bash
npm install @daw-engine/core @daw-engine/ui-utils
```

## Quick Start

### Create a session

```typescript
import { Session, TrackType } from "@daw-engine/core";

const session = new Session("My Song", undefined, 48_000);

const vocalTrack = session.addTrack("Vocal", TrackType.AUDIO);

vocalTrack.setArmed(true);
session.setTempo(120);

const snapshot = session.toJSON();
const restoredSession = Session.fromJSON(snapshot);
```

### Execute a command

Before executing a command, connect an `AudioProvider` for your product environment to `AudioEngine`.

```typescript
import { AudioEngine, CommandExecutor, CommandType } from "@daw-engine/core";

AudioEngine.getInstance(audioProvider);

const executor = CommandExecutor.getInstance();

const result = await executor.execute({
  type: CommandType.ADD_TRACK,
  payload: {
    name: "Guitar",
    trackType: "audio",
  },
});

if (!result.success) {
  throw new Error(result.message);
}

await executor.history.undo();
await executor.history.redo();
```

### Timeline coordinates

```typescript
import { TimelineViewport } from "@daw-engine/ui-utils";

const viewport = new TimelineViewport(48_000);

viewport.setDuration(180);
viewport.setViewportWidth(1_200);
viewport.setPixelsPerSecond(100);

viewport.frameToPixel(48_000); // 100
```

### Waveform peaks

```typescript
import { computePeaksFromSamples } from "@daw-engine/ui-utils";

const samples = new Float32Array([0, 0.25, 0.5, -0.5, -0.25, 0]);

const peaks = computePeaksFromSamples(samples, 2);
```

## Core Concepts

### Command

Editing operations are represented as data in the form `{ type, payload }`.

UI buttons, keyboard shortcuts, scripts, and automation can use the same command format. Inputs are validated against Zod schemas before execution.

### Non-destructive editing

`Source` represents the original audio, while `Region` represents an instance of a source placed on the timeline.

Multiple regions can reference the same source, allowing you to edit without modifying the original file.

### AudioProvider

DAW Engine does not directly implement audio playback or recording.

The `AudioProvider` interface connects playback, recording, region scheduling, metering, and export features to your product's Web Audio or native audio implementation.

## Documentation

- [Core documentation](./core/README.md)
- [UI Utils documentation](./ui-utils/README.md)
- [AudioProvider interface](./core/src/audio/AudioProvider.ts)

## Requirements

- Node.js 18 or later
- A runtime or bundler that supports ESM
- An `AudioProvider` implementation for playback and recording
- Web APIs such as Canvas, `AudioBuffer`, and `requestAnimationFrame`, depending on the features you use

## Status

DAW Engine currently provides a command-oriented editing architecture, but it does not require every state change to use a command.

Not every command or state change supports undo/redo. Before integrating DAW Engine into a product, verify the commands you use and your `AudioProvider` implementation separately.

## Development

Install and verify each package independently.

```bash
cd core
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

```bash
cd ui-utils
pnpm install
pnpm typecheck
pnpm build
```

## License

MIT
