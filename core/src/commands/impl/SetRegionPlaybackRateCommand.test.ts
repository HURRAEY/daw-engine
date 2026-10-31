import { describe, expect, it } from "vitest";

import type { AudioEngine } from "../../audio/AudioEngine";
import type { Session } from "../../domain/Session";
import { CommandType, SetRegionPlaybackRateCommandSchema } from "../types";
import { SetRegionPlaybackRateCommand } from "./SetRegionPlaybackRateCommand";

const session = {} as Session;
const audioEngine = {} as AudioEngine;

describe("SetRegionPlaybackRateCommand validation", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects unsupported playback rate %s before command creation",
    (playbackRate) => {
      expect(
        () =>
          new SetRegionPlaybackRateCommand(
            session,
            audioEngine,
            "track",
            "region",
            playbackRate,
          ),
      ).toThrow(
        new RangeError("Playback rate must be a finite positive number"),
      );
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects unsupported playback rate %s at the command schema boundary",
    (playbackRate) => {
      const result = SetRegionPlaybackRateCommandSchema.safeParse({
        type: CommandType.SET_REGION_PLAYBACK_RATE,
        payload: {
          trackId: "track",
          regionId: "region",
          playbackRate,
        },
      });

      expect(result.success).toBe(false);
    },
  );

  it("accepts a finite positive playback rate", () => {
    expect(
      () =>
        new SetRegionPlaybackRateCommand(
          session,
          audioEngine,
          "track",
          "region",
          0.5,
        ),
    ).not.toThrow();
  });
});
