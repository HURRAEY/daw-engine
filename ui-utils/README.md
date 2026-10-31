# @daw-engine/ui-utils

**DAW 타임라인 화면을 만들기 위한 TypeScript 도구.**

타임라인 좌표 변환, 파형 peak 계산, 눈금, 트랙 배치, 가상 스크롤과 Canvas SceneGraph를 제공합니다. `@daw-engine/core`의 타입과 Signal을 사용하며, 화면 프레임워크에 의존하지 않습니다.

[시작하기](#quick-start) · [파형](#waveforms) · [공개 API](https://github.com/HURRAEY/daw-engine/blob/main/ui-utils/src/index.ts) · [프로젝트 안내](https://github.com/HURRAEY/daw-engine#readme)

## Installation

저장소에서 빌드한 로컬 패키지를 설치합니다. 애플리케이션 폴더와 `daw-engine`이 같은 상위 폴더에 있을 때 실행합니다.

```bash
npm install ../daw-engine/core ../daw-engine/ui-utils lamejs
```

먼저 `core`, 다음으로 `ui-utils`를 빌드합니다. 자세한 순서는 [루트 README](https://github.com/HURRAEY/daw-engine#installation)를 참고하세요. 현재 `core`의 공개 진입점이 `lamejs`를 정적으로 불러오므로 함께 설치합니다.

## Quick start

프레임과 화면 좌표를 변환하는 Viewport를 만듭니다. 이 예제는 DOM이나 오디오 장치에 접근하지 않습니다.

```typescript
import { TimelineViewport } from "@daw-engine/ui-utils";

const viewport = new TimelineViewport(44100);
viewport.setPixelsPerSecond(100);
viewport.setViewportWidth(800);
viewport.setDuration(180);

console.log(viewport.frameToPixel(44100)); // 100
console.log(viewport.framesToWidth(88200)); // 200

viewport.setScrollX(50);
console.log(viewport.frameToViewportPixel(44100)); // 50
```

절대 좌표는 타임라인 전체의 위치이며, Viewport 좌표는 현재 화면의 스크롤을 반영한 위치입니다. UI에 리전을 배치할 때는 두 좌표계를 구분합니다.

## Timeline viewport

`TimelineViewport`는 확대 배율, 가로 스크롤, 보이는 프레임 범위를 관리합니다.

- 좌표 변환: `frameToPixel()`, `pixelToFrame()`, `frameToViewportPixel()`
- 길이 변환: `framesToWidth()`, `widthToFrames()`
- 확대·축소: `zoom()`, `zoomToFit()`, `zoomToRange()`
- 위치 이동: `setScrollX()`, `scrollToFrame()`
- 변경 알림: `changed`

`pixelsPerSecond`는 1부터 1,000까지 제한됩니다. 줌 기준점은 `ZoomFocus`로 선택하며, 세부 옵션은 [TimelineViewport](https://github.com/HURRAEY/daw-engine/blob/main/ui-utils/src/viewport/TimelineViewport.ts)를 참고하세요.

## Waveforms

### Peak data

원본 샘플을 화면 해상도에 맞는 min/max/RMS 데이터로 줄입니다.

```typescript
import { computePeaksFromSamples } from "@daw-engine/ui-utils";

const samples = new Float32Array([0, 0.5, -0.5, 1, 0, -1, 0.25, 0]);
const peaks = computePeaksFromSamples(samples, 2);

console.log(peaks.length); // 4
console.log(peaks.resolution); // 2
```

`resolution`은 peak 하나에 포함되는 샘플 프레임 수입니다. `computePeaks(audioBuffer, resolution, channel?)`은 AudioBuffer에서 같은 형태의 데이터를 만들며, `recommendResolution(viewport.framesPerPixel)`로 줌에 맞는 해상도를 선택할 수 있습니다.

Peak 데이터는 `Source.setPeakData()`의 캐시에 저장해 재사용할 수 있습니다. 계산, 캐시 저장과 화면 그리기를 연결하는 작업은 애플리케이션이 담당합니다.

### Canvas rendering

브라우저에서 Canvas와 PCM 샘플을 전달해 파형을 그립니다.

```typescript
import { computePeaksFromSamples, renderWaveform } from "@daw-engine/ui-utils";

export function drawWaveform(
  canvas: HTMLCanvasElement,
  samples: Float32Array,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is required");
  }

  const peaks = computePeaksFromSamples(samples, 512);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderWaveform({
    ctx,
    peaks,
    width: canvas.width,
    height: canvas.height,
    color: "#4a9eff",
  });
}
```

좌우 채널을 나눠 그리려면 `renderStereoWaveform()`을 사용합니다. 이 패키지는 오디오 URL을 가져오거나 파일을 디코딩하지 않으므로, 샘플과 버퍼를 애플리케이션에서 전달합니다.

## Ruler ticks

현재 Viewport에 필요한 눈금과 레이블을 계산합니다.

```typescript
import { ClockMode } from "@daw-engine/core";
import { computeRulerTicks, TimelineViewport } from "@daw-engine/ui-utils";

const viewport = new TimelineViewport(44100);
viewport.setPixelsPerSecond(100);
viewport.setViewportWidth(800);
viewport.setDuration(180);

const ticks = computeRulerTicks({ viewport, mode: ClockMode.MINSEC });
const visibleTicks = ticks.map((tick) => ({
  ...tick,
  x: tick.x - viewport.scrollX,
}));

console.log(visibleTicks.length > 0); // true
```

`ClockMode.BBT`, `MINSEC`, `TIMECODE`, `SAMPLES`를 사용할 수 있습니다. BBT 계산에는 `bpm`, `timeSigNum`, `timeSigDen`을 전달할 수 있습니다. 반환된 `x`는 타임라인 절대 좌표입니다.

## Track layout and virtual scroll

`TrackLayout`은 트랙의 세로 위치와 높이를 계산합니다.

```typescript
import { TrackLayout, VirtualScroll } from "@daw-engine/ui-utils";

const layout = new TrackLayout();
layout.setTracks(["vocals", "guitar", "drums"]);
layout.setTrackHeight("vocals", 120);

const entries = layout.getEntries();
const scroll = new VirtualScroll({
  itemCount: entries.length,
  itemSize: (index) => entries[index].height,
  overscan: 1,
});

scroll.setViewportSize(160);
scroll.setScrollOffset(0);

console.log(layout.getEntry("vocals")?.height); // 120
console.log(scroll.getVisibleItems().length > 0); // true
```

`VirtualScroll`은 보이는 항목과 overscan 영역을 계산합니다. 항목을 실제로 렌더링하거나 화면에서 제거하는 작업은 UI가 담당합니다. `InfiniteTimeline`은 타임라인의 가로 탐색 범위를 관리하는 별도 도구입니다.

## Playhead tracking

`PlayheadTracker`는 현재 프레임을 읽는 함수를 받아 Viewport의 픽셀 좌표로 변환합니다. 브라우저의 `requestAnimationFrame`을 사용합니다.

```typescript
import { PlayheadTracker, TimelineViewport } from "@daw-engine/ui-utils";

export function attachPlayhead(
  viewport: TimelineViewport,
  getFrame: () => number,
  playhead: HTMLElement,
) {
  const tracker = new PlayheadTracker(viewport, getFrame);
  const subscription = tracker.moved.connect(({ x }) => {
    playhead.style.transform = "translateX(" + x + "px)";
  });

  tracker.start();

  return () => {
    subscription.dispose();
    tracker.dispose();
  };
}
```

엔진과 연결할 때 `getFrame`에는 `() => engine.session.transportFrame`을 전달할 수 있습니다. UI가 제거될 때 반환된 정리 함수를 호출합니다.

## Canvas scene graph

여러 타임라인 요소를 Canvas에서 다룰 때 다음 도구를 조합할 수 있습니다.

- `CanvasItem`, `CanvasGroup`: 요소와 부모·자식 관계
- `SceneGraph`: 렌더링과 좌표 기반 선택의 진입점
- `LookupTable`: 선택 후보를 찾는 공간 조회
- `DirtyRectTracker`: 다시 그릴 영역 추적
- `RenderLayer`: 렌더링 계층 구분

각 타임라인 요소의 모양과 사용자 동작은 애플리케이션이 구현합니다. [공개 export](https://github.com/HURRAEY/daw-engine/blob/main/ui-utils/src/index.ts)에서 세부 API를 확인할 수 있습니다.

## Runtime support

좌표·레이아웃·peak 계산은 일반 TypeScript 데이터로 수행합니다. 파형 렌더링과 SceneGraph에는 Canvas 2D context가 필요하며, PlayheadTracker에는 `requestAnimationFrame`과 `cancelAnimationFrame`이 필요합니다.

프레임워크별 UI 컴포넌트, 완성된 타임라인 화면과 오디오 백엔드는 포함하지 않습니다. `core`를 함께 사용하므로 실행 환경의 지원 범위도 [Core README](https://github.com/HURRAEY/daw-engine/tree/main/core#runtime-support)를 확인하세요.

## Development

의존성을 설치하고 `core`를 빌드한 뒤 `ui-utils` 폴더에서 실행합니다.

```bash
npm run build
npm run typecheck
```

현재 별도의 테스트 실행 스크립트는 없습니다. 전체 설치 순서와 기여 방법은 [프로젝트 README](https://github.com/HURRAEY/daw-engine#development)를 참고하세요.

## License

[MIT](./LICENSE)
