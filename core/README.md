# @daw-engine/core

**DAW 애플리케이션의 편집 상태와 명령을 관리하는 TypeScript 엔진.**

트랙, 타임라인 리전, 믹서 경로, MIDI, 오토메이션을 도메인 객체로 표현합니다. 화면 프레임워크에 의존하지 않으며, 실제 오디오 재생과 녹음은 `AudioProvider`를 구현한 백엔드에 연결합니다.

[시작하기](#quick-start) · [오디오 백엔드](#audio-backend) · [공개 API](https://github.com/HURRAEY/daw-engine/blob/main/core/src/index.ts) · [프로젝트 안내](https://github.com/HURRAEY/daw-engine#readme)

## Installation

저장소에서 빌드한 로컬 패키지를 설치합니다. 애플리케이션 폴더와 `daw-engine`이 같은 상위 폴더에 있을 때 실행합니다.

```bash
npm install ../daw-engine/core lamejs
```

소스 빌드 순서는 [루트 README](https://github.com/HURRAEY/daw-engine#installation)를 참고하세요. 예제는 TypeScript와 ESM을 지원하는 번들러 환경을 기준으로 합니다.

소스에서 빌드한 패키지의 전체 공개 진입점은 `lamejs`를 정적으로 import하므로 함께 설치합니다. `soundtouchjs`도 선택적 peer dependency로 선언돼 있지만, 이 패키지가 해당 라이브러리를 직접 호출하는 경로는 없습니다. 빌드된 루트 패키지를 Git 커밋으로 설치하는 방법도 [루트 README](https://github.com/HURRAEY/daw-engine#installation)에 안내돼 있습니다.

## Domain-only entry point

소스에서 빌드한 이 패키지는 `@daw-engine/core/domain`으로 `Session`, `Source`, `Track`, `Region`을 제공합니다. 브라우저 오디오나 IndexedDB 모듈을 가져오지 않으며, 도메인 객체를 생성하려면 `crypto.randomUUID()`를 지원하는 런타임이 필요합니다.

이 진입점은 재생·녹음·저장을 구현하지 않습니다. `npm run build:domain`으로 해당 진입점과 의존 모듈을 별도로 빌드할 수 있으며, 일반 `npm run build`에도 포함됩니다. Git 설치용 루트 패키지는 현재 `domain` 하위 경로를 노출하지 않으므로, 이 진입점을 사용하려면 개별 `core` 패키지를 빌드해 설치합니다.

## Quick start

오디오 장치 없이 세션과 트랙을 만들 수 있습니다.

```typescript
import { Session, TrackType } from "@daw-engine/core/domain";

const session = new Session("My Song", undefined, 44100);
const track = session.addTrack("Vocals", TrackType.AUDIO);

session.setTempo(120);
track.setMute(false);

console.log(session.tracks.length); // 1
console.log(track.name); // Vocals
```

`TrackType`에는 `AUDIO`, `MIDI`, `AUX`, `BUS`, `FOLDER`, `VCA`가 있습니다. 트랙의 `playlist`는 리전 배치를, `route`는 오디오 입출력과 Processor 체인을 담당합니다.

## Regions and sources

`Source`는 원본 오디오의 참조이고, `Region`은 원본의 어느 구간을 타임라인 어디에 배치할지 나타냅니다. 아래 예제는 파일을 읽거나 재생하지 않고 편집 정보를 구성합니다.

```typescript
import { Region, Session, Source, TrackType } from "@daw-engine/core";

const sampleRate = 44100;
const session = new Session("Guitar Demo", undefined, sampleRate);
const track = session.addTrack("Guitar", TrackType.AUDIO);
const source = new Source(
  "guitar-source",
  "guitar.wav",
  "/audio/guitar.wav",
  sampleRate * 8,
  sampleRate,
  2,
);

session.addSource(source);

const region = new Region(
  "guitar-intro",
  source.id,
  0,
  sampleRate * 4,
  0,
  "Intro",
);

region.fadeIn = 4410;
track.playlist.addRegion(region);

console.log(region.end / sampleRate); // 4
```

`start`, `length`, `sourceStart`와 페이드 길이는 샘플 프레임 단위입니다. 일반적인 이동과 트림은 원본 참조와 리전의 편집 정보를 분리해 처리합니다.

## Audio backend

실제 재생을 위해서는 애플리케이션이 [AudioProvider](https://github.com/HURRAEY/daw-engine/blob/main/core/src/audio/AudioProvider.ts)를 구현해야 합니다. 이 저장소에는 완성된 백엔드 구현이 포함돼 있지 않습니다.

아래 함수는 애플리케이션이 준비한 백엔드를 인자로 받습니다.

```typescript
import { AudioEngine, CommandExecutor, CommandType } from "@daw-engine/core";
import type { AudioProvider } from "@daw-engine/core";

export async function initializeDAW(backend: AudioProvider) {
  const engine = AudioEngine.getInstance(backend);
  await engine.initialize();

  const commands = CommandExecutor.getInstance();
  const result = await commands.execute({
    type: CommandType.ADD_TRACK,
    payload: { name: "Vocals" },
  });

  if (!result.success) {
    throw new Error(result.message);
  }

  return { engine, commands };
}
```

첫 번째 `AudioEngine.getInstance()` 호출에는 백엔드가 필요합니다. `CommandExecutor`도 같은 엔진을 사용하므로 엔진을 먼저 구성합니다. 기본 엔진과 명령 실행기는 Singleton으로 관리됩니다.

`AudioEngine`은 도메인의 변경 알림을 받아 트랙, 리전, Processor 파라미터를 백엔드에 전달합니다. 재생 중에는 백엔드의 현재 프레임을 읽어 `Session.transportFrame`을 갱신합니다.

- `engine.start()`, `pause()`, `stop()`: 재생 제어
- `engine.seek(seconds)`: 초 단위 탐색
- `engine.getMeterData(trackId)`: 트랙 미터 조회
- `engine.startRecording()`, `stopRecording()`: 녹음 제어

Web Audio 백엔드에서는 사용자 입력에 따른 AudioContext 활성화도 백엔드와 애플리케이션에서 처리합니다.

백엔드는 `applyRoutingSnapshot()`을 구현해 트랙·Processor 연결의 동결된 실행 구조를 전달받습니다. 비동기 페이드아웃 후 정지가 필요하면 선택적 `stopWithDeclick()`도 구현할 수 있습니다. `engine.setBackend(backend)`는 기존 세션을 새 백엔드에 구성하는 비동기 작업이므로 `await`로 완료를 기다립니다.

## Commands and undo / redo

`CommandExecutor.execute()`는 명령을 검증하고 `{ success, message, data? }` 결과를 반환합니다. Track, Region, Transport, Automation, Plugin, MIDI, Session 등의 Handler가 명령을 처리합니다.

이미 초기화된 엔진에서 편집을 수행하는 함수의 예제입니다.

```typescript
import { CommandExecutor, CommandType } from "@daw-engine/core";

export async function addTrackWithHistory() {
  const commands = CommandExecutor.getInstance();
  const result = await commands.execute({
    type: CommandType.ADD_TRACK,
    payload: { name: "Guitar" },
  });

  if (!result.success) {
    throw new Error(result.message);
  }

  await commands.history.undo();
  await commands.history.redo();
}
```

되돌릴 수 있는 편집은 `CommandHistory`에 기록됩니다. 저장·재생 같은 모든 동작이 Undo 대상인 것은 아닙니다. 도메인 객체를 직접 수정한 내용도 자동으로 히스토리에 기록되지 않습니다.

명령 이름과 payload는 [명령 스키마](https://github.com/HURRAEY/daw-engine/blob/main/core/src/commands/types.ts), 실행과 취소 API는 [CommandHistory](https://github.com/HURRAEY/daw-engine/blob/main/core/src/commands/CommandHistory.ts)를 참고하세요.

## Events

상태를 가진 객체는 타입이 지정된 `Signal`을 노출합니다.

```typescript
import { Session } from "@daw-engine/core";

const session = new Session("My Song");
const subscription = session.tempoChanged.connect((bpm) => {
  console.log("Tempo: " + bpm);
});

session.setTempo(128); // Tempo: 128
subscription.dispose();
```

대표적으로 `trackAdded`, `trackRemoved`, `tempoChanged`, `transportPositionChanged`, `muteChanged`, `parameterChanged`를 구독할 수 있습니다. 구독이 필요 없어지면 `dispose()`로 해제합니다.

`Signal.emit()`은 구독 콜백을 동기적으로 호출합니다. 오디오 신호를 생성하거나 별도 스레드에서 콜백을 실행하는 API는 아닙니다.

## Automation

파라미터의 시간별 값을 포인트와 곡선으로 표현합니다. 포인트의 시간은 초 단위입니다.

```typescript
import { AutomationList, AutomationMode } from "@daw-engine/core";

const automation = new AutomationList();
automation.addPoint(0, 0.5);
automation.addPoint(2, 1.0);
automation.mode = AutomationMode.READ;

console.log(automation.getValueAt(1)); // 0.75
```

모드는 `OFF`, `READ`, `WRITE`, `TOUCH`, `LATCH`를 제공합니다. 선형·지수·로그·Hold·곡선 보간 코드가 포함돼 있으며, 실제 재생 파라미터에 적용하는 작업은 백엔드와 연결됩니다.

## Plugins and routing

`PluginManager`에는 EQ, 컴프레서, 리버브, 딜레이 등을 포함한 20개 효과 타입이 등록돼 있습니다.

```typescript
import { PluginManager } from "@daw-engine/core";

const manager = PluginManager.getInstance();
const eq = manager.createPlugin("internal-eq6");

if (eq) {
  eq.setParameter("band1Freq", 100);
  eq.setParameter("band1Gain", 3);
  console.log(eq.getState().band1Gain); // 3
}
```

이 API는 파라미터와 상태를 관리합니다. 실제 효과음 처리는 `AudioProvider`의 구현이 담당하며, VST나 AU 호스트는 포함하지 않습니다.

트랙의 Route는 다음 순서의 Processor 체인을 표현합니다.

```text
Input → Trim → Pre-fader plugins → Fader → Polarity
      → Post-fader plugins → Panner → Output
```

## Saving and export

`Session.toJSON()`은 편집 상태를 직렬화하고 `Session.fromJSON()`은 해당 Snapshot에서 객체를 구성합니다. `SessionStorage`는 IndexedDB에 세션과 이름 있는 스냅샷을 저장합니다.

Snapshot에는 Source 메타데이터와 URL, 트랙·리전, 트랙과 마스터 Route의 입출력·Processor 체인·플러그인 파라미터·오토메이션 상태 등이 포함됩니다. `LOAD_SESSION` 명령도 같은 직렬화 구조를 사용해 기존 Session을 복원하고 백엔드의 소스·트랙·리전·라우팅을 다시 구성합니다.

원본 오디오 파일의 바이트는 Snapshot에 포함되지 않습니다. 전체 프로젝트를 장기 보관하려면 파일을 함께 저장하고, 복원 시 사용할 수 있는 URL이나 자산 참조로 연결해야 합니다.

`SessionArchive`는 호출자가 전달한 세션 JSON과 오디오 Blob을 묶습니다. 아카이브를 생성하는 것과 백엔드에 소스를 다시 연결하는 것은 별개의 작업입니다.

오디오 출력 코드는 WAV, MP3, FLAC, OGG 경로와 정규화, true peak 제한, 디더링, 트랙별 출력을 포함합니다. 렌더링한 버퍼는 백엔드에서 공급받습니다.

- WAV 샘플 형식: int16, int24, float32
- MP3: `lamejs` 사용
- OGG: MediaRecorder의 코덱 지원에 의존하며, 대체 PCM 경로는 유효한 Vorbis·Opus 파일이 아닙니다.

## Runtime support

화면 프레임워크 의존성은 없습니다. 기능별로 필요한 플랫폼 API가 다릅니다.

- 세션 저장: IndexedDB
- 환경설정과 키 바인딩: localStorage
- MIDI 장치 입력: Web MIDI API
- 파일 다운로드: DOM, Blob URL
- 오디오 백엔드 계약: AudioBuffer, AnalyserNode, Blob 등

개발 도구는 Node.js 18 이상을 요구합니다. 이 조건이 모든 기능을 Node.js에서 바로 실행할 수 있다는 의미는 아닙니다.

## API and development

- [공개 export](https://github.com/HURRAEY/daw-engine/blob/main/core/src/index.ts)
- [AudioProvider 계약](https://github.com/HURRAEY/daw-engine/blob/main/core/src/audio/AudioProvider.ts)
- [명령과 입력 스키마](https://github.com/HURRAEY/daw-engine/blob/main/core/src/commands/types.ts)
- [전체 구조와 기여 안내](https://github.com/HURRAEY/daw-engine#architecture)

의존성을 설치한 뒤 `core` 폴더에서 실행합니다.

```bash
npm run build
npm run typecheck
npm test
```

빌드는 JavaScript, 타입 선언, 소스맵을 생성합니다. 테스트는 Vitest를 사용하며 실제 재생·녹음 검증에는 별도 백엔드가 필요합니다.

## License

Copyright (c) 2025 HURRAEY.

Licensed under the GNU General Public License, version 2 or (at your option)
any later version (`GPL-2.0-or-later`). See [LICENSE](./LICENSE) for the full
terms and [NOTICE](./NOTICE) for the project copyright and licensing notice.

- Use, study, modification, and commercial use are permitted.
- Redistributed copies must preserve the copyright, license, and warranty
  notices and include the GPL text. Modified files must state that they were
  changed and record the date of the change.
- When distributing a covered derivative or combined work, license that work
  under the GPL. Distribution of covered binaries or bundles must satisfy
  GPLv2 section 3, including providing the complete corresponding source code
  or a qualifying source offer. This includes modifications and the scripts
  needed to control compilation and installation, not just the engine's source.
- Purely private use and modification do not require publishing source code.
  Running a server without distributing software does not by itself trigger
  GPLv2's source distribution obligations. Delivering JavaScript bundles to
  users' browsers does distribute software.
- Audio, MIDI, and project files merely created or processed with the engine
  are not covered by the GPL unless their contents themselves include covered
  software.

GPL requires preserving legal notices. It does not impose a universal
"Powered by" banner or project-link requirement. Interactive notice obligations
apply where GPLv2 section 2(c) requires them. An About or Third-Party Notices
section can identify the project as:

```text
DAW Engine by HURRAEY - https://github.com/HURRAEY/daw-engine
```

Earlier copies obtained under MIT retain their MIT permissions. This change
does not retroactively revoke those permissions. Separately licensed third-party
dependencies and bundled third-party code retain their own licenses.
