import { describe, expect, it } from "vitest";

import type { RegionDTO } from "../dto";
import { TimeDomain } from "../../domain/temporal/types";
import { PlaylistEngine } from "./PlaylistEngine";

function createRegion(
  id: string,
  sourceId: string,
  layer: number,
  opaque?: boolean,
): RegionDTO {
  return {
    id,
    sourceId,
    start: 0,
    length: 4,
    end: 4,
    sourceStart: 0,
    name: id,
    gain: 1,
    muted: false,
    layer,
    opaque,
    fadeIn: 0,
    fadeOut: 0,
    playbackRate: 1,
    stretch: 1,
    pitchSemitones: 0,
    timeDomain: TimeDomain.AudioTime,
  };
}

function createBuffer(value: number): AudioBuffer {
  const samples = new Float32Array([value, value, value, value, value]);
  return {
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function render(regions: RegionDTO[]): Float32Array {
  const engine = new PlaylistEngine();
  const left = new Float32Array(4);
  const right = new Float32Array(4);
  const buffers = new Map([
    ["lower-source", createBuffer(1)],
    ["upper-source", createBuffer(2)],
  ]);
  engine.render(left, right, 0, 4, regions, (sourceId) => {
    return buffers.get(sourceId) ?? null;
  });
  return left;
}

describe("PlaylistEngine layer rendering", () => {
  it("불투명한 상위 Layer가 하위 Layer를 가린다", () => {
    const output = render([
      createRegion("lower", "lower-source", 0, true),
      createRegion("upper", "upper-source", 1, true),
    ]);

    expect([...output]).toEqual([2, 2, 2, 2]);
  });

  it("투명한 상위 Layer는 하위 Layer와 함께 재생된다", () => {
    const output = render([
      createRegion("lower", "lower-source", 0, true),
      createRegion("upper", "upper-source", 1, false),
    ]);

    expect([...output]).toEqual([3, 3, 3, 3]);
  });

  it("mixes overlapping opaque regions on the same layer", () => {
    const output = render([
      createRegion("first", "lower-source", 1, true),
      createRegion("second", "upper-source", 1, true),
    ]);

    expect([...output]).toEqual([3, 3, 3, 3]);
  });

  it("uses the union of same-layer opaque coverage to mask lower layers", () => {
    const first = createRegion("first", "upper-source", 1, true);
    first.length = 2;
    first.end = 2;
    const second = createRegion("second", "upper-source", 1, true);
    second.start = 1;
    second.length = 2;
    second.end = 3;

    const output = render([
      createRegion("lower", "lower-source", 0, true),
      first,
      second,
    ]);

    expect([...output]).toEqual([2, 4, 2, 1]);
  });

  it("applies playback rate when calculating a block's source offset", () => {
    const engine = new PlaylistEngine();
    const left = new Float32Array(2);
    const right = new Float32Array(2);
    const region = createRegion("rate", "rate-source", 0, true);
    region.length = 8;
    region.end = 8;
    region.playbackRate = 2;
    const samples = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    engine.render(left, right, 2, 2, [region], () => {
      return {
        numberOfChannels: 1,
        getChannelData: () => samples,
      } as unknown as AudioBuffer;
    });

    expect([...left]).toEqual([4, 6]);
  });

  it("renders a valid sample at the exact playback-rate buffer boundary", () => {
    const engine = new PlaylistEngine();
    const left = new Float32Array(3);
    const right = new Float32Array(3);
    const region = createRegion("rate", "rate-source", 0, true);
    region.length = 10;
    region.end = 10;
    region.playbackRate = 2;
    const samples = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    engine.render(left, right, 2, 3, [region], () => {
      return {
        numberOfChannels: 1,
        getChannelData: () => samples,
      } as unknown as AudioBuffer;
    });

    expect([...left]).toEqual([4, 6, 8]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "renders silence for unsupported playback rate %s",
    (playbackRate) => {
      const engine = new PlaylistEngine();
      const left = new Float32Array(2);
      const right = new Float32Array(2);
      const region = createRegion("rate", "rate-source", 0, true);
      region.playbackRate = playbackRate;

      engine.render(left, right, 0, 2, [region], () => createBuffer(1));

      expect([...left]).toEqual([0, 0]);
      expect([...right]).toEqual([0, 0]);
    },
  );
});
