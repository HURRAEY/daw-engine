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
});
