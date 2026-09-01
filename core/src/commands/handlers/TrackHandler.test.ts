import { describe, expect, it, vi } from "vitest";

import type { AudioEngine } from "../../audio/AudioEngine";
import { Session } from "../../domain/Session";
import type { CommandHistory } from "../CommandHistory";
import { CommandType } from "../types";
import { TrackHandler } from "./TrackHandler";

describe("TrackHandler persisted metadata", () => {
  it("updates track comments through the signaling setter", async () => {
    const session = new Session("session");
    const track = session.addTrack("Track", undefined, "track");
    const commentChanged = vi.fn();
    track.commentChanged.connect(commentChanged);
    const handler = new TrackHandler();

    const result = await handler.execute(
      CommandType.SET_TRACK_COMMENT,
      { trackId: track.id, comment: "Comment" },
      { session } as unknown as AudioEngine,
      {} as unknown as CommandHistory,
    );

    expect(result.success).toBe(true);
    expect(track.comment).toBe("Comment");
    expect(commentChanged).toHaveBeenCalledWith("Comment");
  });
});
