import { describe, expect, it } from "vitest";

import { CommandHistory } from "../commands/CommandHistory";
import {
  capturePlaylistEditState,
  createPlaylistEditTransaction,
} from "../commands/history/PlaylistEditHistory";
import { RecordMode } from "./RecordMode";
import { Region } from "./Region";
import { Playlist } from "./Playlist";

function createRegion(
  id: string,
  start: number,
  length: number,
  sourceStart: number = 0,
): Region {
  return new Region(id, `${id}-source`, start, length, sourceStart, id);
}

describe("Playlist.insertRecordedRegion", () => {
  it("Layered 모드는 새 리전을 최상위 불투명 Layer에 추가한다", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const existing = createRegion("existing", 0, 100);
    existing.layer = 3;
    playlist.addRegion(existing);
    const recorded = createRegion("recorded", 50, 100);

    playlist.insertRecordedRegion(recorded, RecordMode.LAYERED);

    expect(recorded.layer).toBe(4);
    expect(recorded.opaque).toBe(true);
    expect(playlist.getRegion(existing.id)).toBe(existing);
  });

  it("Sound-on-Sound 모드는 새 리전을 투명 Layer에 추가한다", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const existing = createRegion("existing", 0, 100);
    playlist.addRegion(existing);
    const recorded = createRegion("recorded", 50, 100);

    playlist.insertRecordedRegion(recorded, RecordMode.SOUND_ON_SOUND);

    expect(recorded.layer).toBe(1);
    expect(recorded.opaque).toBe(false);
    expect(playlist.getRegion(existing.id)).toBe(existing);
  });

  it("투명한 상위 Layer가 있어도 하위 Region은 재생 대상이다", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const lower = createRegion("lower", 0, 100);
    const upper = createRegion("upper", 0, 100);
    upper.layer = 1;
    upper.opaque = false;
    playlist.addRegion(lower);
    playlist.addRegion(upper);

    expect(playlist.regionIsAudibleAt(lower.id, 50)).toBe(true);
  });

  it("Non-Layered 리전이 기존 리전을 완전히 덮으면 기존 리전을 제거한다", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const existing = createRegion("existing", 25, 50);
    playlist.addRegion(existing);

    playlist.insertRecordedRegion(
      createRegion("recorded", 0, 100),
      RecordMode.NON_LAYERED,
    );

    expect(playlist.getRegion(existing.id)).toBeUndefined();
  });

  it("Non-Layered 리전이 기존 리전의 뒤를 덮으면 기존 리전의 끝을 자른다", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const existing = createRegion("existing", 0, 100);
    playlist.addRegion(existing);

    playlist.insertRecordedRegion(
      createRegion("recorded", 50, 100),
      RecordMode.NON_LAYERED,
    );

    expect(existing.start).toBe(0);
    expect(existing.length).toBe(50);
  });

  it("Non-Layered 리전이 기존 리전의 앞을 덮으면 시작과 Source 시작점을 자른다", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const existing = createRegion("existing", 50, 100, 10);
    playlist.addRegion(existing);

    playlist.insertRecordedRegion(
      createRegion("recorded", 0, 100),
      RecordMode.NON_LAYERED,
    );

    expect(existing.start).toBe(100);
    expect(existing.sourceStart).toBe(60);
    expect(existing.length).toBe(50);
  });

  it("Non-Layered 리전이 기존 리전의 가운데를 덮으면 기존 리전을 둘로 나눈다", () => {
    const playlist = new Playlist("playlist", "Playlist");
    const existing = createRegion("existing", 0, 200);
    playlist.addRegion(existing);

    playlist.insertRecordedRegion(
      createRegion("recorded", 50, 100),
      RecordMode.NON_LAYERED,
    );

    const regions = playlist.getRegions();
    const right = regions.find((region) => region.start === 150);
    expect(existing.length).toBe(50);
    expect(right?.length).toBe(50);
    expect(right?.sourceStart).toBe(150);
  });

  it("Non-Layered 편집을 Undo하면 기존 Region 객체와 구조를 복원한다", async () => {
    const playlist = new Playlist("playlist", "Playlist");
    const existing = createRegion("existing", 0, 200);
    playlist.addRegion(existing);
    const recorded = createRegion("recorded", 50, 100);
    const before = capturePlaylistEditState([playlist]);
    playlist.insertRecordedRegion(recorded, RecordMode.NON_LAYERED);
    const after = capturePlaylistEditState([playlist]);
    const transaction = createPlaylistEditTransaction(
      "RecordedRegion",
      before,
      after,
    );
    const history = new CommandHistory();
    await history.record(transaction, transaction.name);

    await history.undo();

    expect(playlist.getRegions()).toEqual([existing]);
    expect(existing.start).toBe(0);
    expect(existing.length).toBe(200);

    await history.redo();
    expect(playlist.getRegion(recorded.id)).toBe(recorded);
    expect(existing.length).toBe(50);
  });
});
