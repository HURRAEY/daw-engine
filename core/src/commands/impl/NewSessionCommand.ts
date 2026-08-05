import { UndoableCommand } from "../Command";
import { AudioEngine } from "../../audio/AudioEngine";
import { Session, SessionSnapshot } from "../../domain/Session";
import { createFromTemplate } from "../../storage/SessionTemplate";
import { TrackId, RegionId } from "../../domain/types";
import { TrackType } from "../../domain/Track";
import { SendBusId } from "../../domain/SendBus";

import { logger } from "../../utils/Logger";
/**
 * NewSessionCommand -- creates a new session, optionally from a template.
 *
 * Undo restores the previous session state.
 */
export class NewSessionCommand implements UndoableCommand {
  private _snapshotBeforeNew?: SessionSnapshot;
  private readonly name?: string;
  private readonly templateId?: string;

  constructor(name?: string, templateId?: string) {
    this.name = name;
    this.templateId = templateId;
  }

  public async execute(): Promise<void> {
    const engine = AudioEngine.getInstance();
    this._snapshotBeforeNew = engine.session.toJSON();

    // Build the new session
    let newSession: Session;
    if (this.templateId) {
      newSession = createFromTemplate(this.templateId);
      if (this.name) {
        newSession.name = this.name;
      }
    } else {
      newSession = new Session(this.name ?? "Untitled Session");
    }

    // Apply the new session's snapshot onto the current engine session
    await this.applySnapshot(newSession.toJSON(), engine);
    logger.debug(
      "NewSessionCommand",
      `New session created: ${engine.session.name}`,
    );
  }

  public async undo(): Promise<void> {
    if (!this._snapshotBeforeNew) return;
    const engine = AudioEngine.getInstance();
    await this.applySnapshot(this._snapshotBeforeNew, engine);
    logger.debug("NewSessionCommand", `Undo: restored previous session`);
  }

  public async redo(): Promise<void> {
    await this.execute();
  }

  private async applySnapshot(
    snapshot: SessionSnapshot,
    engine: AudioEngine,
  ): Promise<void> {
    const session = engine.session;

    // Clear existing tracks
    const existingTrackIds = session.tracks.map((t) => t.id);
    for (const id of existingTrackIds) {
      session.removeTrack(id as TrackId);
    }

    // Clear existing send buses
    const existingSendBusIds = session.sendBuses.map((sb) => sb.id);
    for (const id of existingSendBusIds) {
      session.removeSendBus(id as SendBusId);
    }

    // Restore transport state
    session.name = snapshot.name;
    session.tempo = snapshot.tempo;
    session.timeSignature = snapshot.timeSignature;
    session.tempoChanged.emit(snapshot.tempo);

    // Restore tracks and regions
    for (const trackData of snapshot.tracks) {
      const track = session.addTrack(
        trackData.name,
        trackData.type as TrackType,
        trackData.id as TrackId,
      );
      track.armed = trackData.armed;
      track.mute = trackData.mute;
      track.solo = trackData.solo;
      if (trackData.color) track.color = trackData.color;
      if (trackData.recordMode !== undefined) {
        track.setRecordMode(trackData.recordMode);
      }

      for (const regionData of trackData.regions) {
        const { Region } = await import("../../domain/Region");
        const region = new Region(
          regionData.id as RegionId,
          regionData.sourceId,
          regionData.start,
          regionData.length,
          regionData.sourceStart,
          regionData.name,
          regionData.layer,
        );
        region.gain = regionData.gain;
        region.muted = regionData.muted;
        region.opaque = regionData.opaque ?? true;
        region.fadeIn = regionData.fadeIn;
        region.fadeOut = regionData.fadeOut;
        region.playbackRate = regionData.playbackRate;
        region.timeDomain = regionData.timeDomain;
        if (regionData.locked) region.locked = regionData.locked;
        track.playlist.addRegion(region);
      }
    }

    // Restore send buses
    for (const sbData of snapshot.sendBuses) {
      session.addSendBus(
        sbData.sourceTrackId as TrackId,
        sbData.destId,
        sbData.level,
        sbData.preFader,
        sbData.id as SendBusId,
      );
    }
  }
}
