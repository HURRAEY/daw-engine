import { describe, expect, it } from "vitest";

import { CommandHistory } from "../CommandHistory";
import { CrossfadeType, FadeCurve } from "../../domain/Crossfade";
import { Region } from "../../domain/Region";
import { Session } from "../../domain/Session";
import { Track, TrackType } from "../../domain/Track";
import { moveRegionAndCreateTransaction } from "./moveRegionAndCreateTransaction";

function createTrack(session: Session, id: string): Track {
  return session.addTrack(id, TrackType.AUDIO, id);
}

function addRegion(
  track: Track,
  id: string,
  start: number,
  length: number = 100,
): Region {
  const region = new Region(id, `${id}-source`, start, length, 0, id);
  track.playlist.addRegion(region);
  return region;
}

describe("moveRegionAndCreateTransaction", () => {
  it("Undo에서 이동 리전의 기존 Fade를 복원한다", async () => {
    const session = new Session("test");
    const track = createTrack(session, "track");
    addRegion(track, "earlier", 0);
    const movedRegion = addRegion(track, "moved", 200);
    movedRegion.fadeIn = 7;

    const transaction = moveRegionAndCreateTransaction({
      session,
      trackId: track.id,
      regionId: movedRegion.id,
      newStart: 50,
    });
    expect(movedRegion.fadeIn).toBe(50);

    await transaction.undo();

    expect(movedRegion.start).toBe(200);
    expect(movedRegion.fadeIn).toBe(7);
  });

  it("Undo에서 Crossfade의 ID와 설정을 복원한다", async () => {
    const session = new Session("test");
    const track = createTrack(session, "track");
    addRegion(track, "earlier", 0);
    const movedRegion = addRegion(track, "moved", 50);
    const crossfade = track.playlist.getCrossfades()[0];
    crossfade.setPosition(60);
    crossfade.setLength(25);
    crossfade.setType(CrossfadeType.CUSTOM);
    crossfade.setCurves(FadeCurve.S_CURVE, FadeCurve.LINEAR);
    crossfade.setActive(false);

    const transaction = moveRegionAndCreateTransaction({
      session,
      trackId: track.id,
      regionId: movedRegion.id,
      newStart: 200,
    });
    expect(track.playlist.getCrossfades()).toHaveLength(0);

    await transaction.undo();

    const restored = track.playlist.getCrossfade(crossfade.id);
    expect(restored).toBeDefined();
    expect(restored?.position).toBe(60);
    expect(restored?.length).toBe(25);
    expect(restored?.type).toBe(CrossfadeType.CUSTOM);
    expect(restored?.fadeInCurve).toBe(FadeCurve.S_CURVE);
    expect(restored?.fadeOutCurve).toBe(FadeCurve.LINEAR);
    expect(restored?.active).toBe(false);
  });

  it("Redo는 현재 Ripple 설정과 관계없이 저장된 이동 결과를 적용한다", async () => {
    const session = new Session("test");
    const track = createTrack(session, "track");
    const movedRegion = addRegion(track, "moved", 0);
    const laterRegion = addRegion(track, "later", 300);

    const transaction = moveRegionAndCreateTransaction({
      session,
      trackId: track.id,
      regionId: movedRegion.id,
      newStart: 100,
    });
    const history = new CommandHistory();
    await history.record(transaction, transaction.name);
    await history.undo();
    session.rippleEdit = true;

    await history.redo();

    expect(movedRegion.start).toBe(100);
    expect(laterRegion.start).toBe(300);
  });

  it("트랙 간 이동을 같은 Region 객체로 Undo와 Redo한다", async () => {
    const session = new Session("test");
    const sourceTrack = createTrack(session, "source");
    const targetTrack = createTrack(session, "target");
    const movedRegion = addRegion(sourceTrack, "moved", 0);

    const transaction = moveRegionAndCreateTransaction({
      session,
      trackId: sourceTrack.id,
      targetTrackId: targetTrack.id,
      regionId: movedRegion.id,
      newStart: 120,
    });

    expect(targetTrack.playlist.getRegion(movedRegion.id)).toBe(movedRegion);

    await transaction.undo();
    expect(sourceTrack.playlist.getRegion(movedRegion.id)).toBe(movedRegion);
    expect(movedRegion.start).toBe(0);

    await transaction.redo();
    expect(targetTrack.playlist.getRegion(movedRegion.id)).toBe(movedRegion);
    expect(movedRegion.start).toBe(120);
  });
});
