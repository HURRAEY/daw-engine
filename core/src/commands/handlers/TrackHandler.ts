import {
  CommandHandler,
  CommandHandlerPayload,
  CommandResult,
  requireString,
  requireNumber,
  requireBoolean,
  optionalString,
} from "./CommandHandler";
import { AudioEngine } from "../../audio/AudioEngine";
import { CommandHistory } from "../CommandHistory";
import { CommandType } from "../types";
import { AddTrackCommand } from "../impl/AddTrackCommand";
import { RemoveTrackCommand } from "../impl/RemoveTrackCommand";
import { SetTrackVolumeCommand } from "../impl/SetTrackVolumeCommand";
import { SetTrackPanCommand } from "../impl/SetTrackPanCommand";
import { SetTrackMuteCommand } from "../impl/SetTrackMuteCommand";
import { SetTrackSoloCommand } from "../impl/SetTrackSoloCommand";
import { SetPluginParameterCommand } from "../impl/SetPluginParameterCommand";
import { ReorderTrackCommand } from "../impl/ReorderTrackCommand";
import { FreezeTrackCommand } from "../impl/FreezeTrackCommand";
import { AddAuxTrackCommand } from "../impl/AddAuxTrackCommand";
import { AddBusTrackCommand } from "../impl/AddBusTrackCommand";
import { MonitorMode } from "../../domain/MonitorMode";
import { RecordMode } from "../../domain/RecordMode";
import { SetTrackRecordModeCommand } from "../impl/SetTrackRecordModeCommand";

/**
 * Track Command Handler
 *
 * 트랙 추가/제거, Volume/Pan/Mute/Solo 등 처리
 */
export class TrackHandler implements CommandHandler {
  private readonly supportedCommands = new Set<string>([
    CommandType.ADD_TRACK,
    CommandType.ADD_AUX_TRACK,
    CommandType.ADD_BUS_TRACK,
    CommandType.REMOVE_TRACK,
    CommandType.SET_VOLUME,
    CommandType.SET_PAN,
    CommandType.MUTE_TRACK,
    CommandType.SOLO_TRACK,
    CommandType.SET_PLUGIN_PARAMETER,
    CommandType.ARM_TRACK,
    CommandType.SET_TRACK_MONITOR,
    CommandType.SET_TRACK_COLOR,
    CommandType.REORDER_TRACK,
    CommandType.BOUNCE_TRACK,
    CommandType.FREEZE_TRACK,
    CommandType.UNFREEZE_TRACK,
    // Phase 15: Track Enhancements
    CommandType.SET_TRACK_PAN_WIDTH,
    CommandType.SET_TRACK_MONITOR_MODE,
    CommandType.SET_TRACK_TRIM_GAIN,
    CommandType.SET_TRACK_SOLO_ISOLATE,
    CommandType.SET_TRACK_SOLO_SAFE,
    CommandType.SET_TRACK_COMMENT,
    CommandType.SET_TRACK_RECORD_MODE,
  ]);

  canHandle(commandType: string): boolean {
    return this.supportedCommands.has(commandType);
  }

  async execute(
    commandType: string,
    payload: CommandHandlerPayload | undefined,
    audioEngine: AudioEngine,
    history: CommandHistory,
  ): Promise<CommandResult> {
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }

    switch (commandType) {
      case CommandType.ADD_TRACK: {
        const name = requireString(payload, "name");
        const cmd = new AddTrackCommand(name);
        await history.execute(cmd);
        return {
          success: true,
          message: `Track "${name}" added (ID: ${cmd.id})`,
        };
      }

      case CommandType.ADD_AUX_TRACK: {
        const name = requireString(payload, "name");
        const auxCmd = new AddAuxTrackCommand(name);
        await history.execute(auxCmd);
        return {
          success: true,
          message: `Aux track "${name}" added (ID: ${auxCmd.id})`,
        };
      }

      case CommandType.ADD_BUS_TRACK: {
        const name = requireString(payload, "name");
        const busCmd = new AddBusTrackCommand(name);
        await history.execute(busCmd);
        return {
          success: true,
          message: `Bus track "${name}" added (ID: ${busCmd.id})`,
        };
      }

      case CommandType.REMOVE_TRACK: {
        const cmd = new RemoveTrackCommand(requireString(payload, "trackId"));
        await history.execute(cmd);
        return { success: true, message: "Track removed" };
      }

      case CommandType.SET_VOLUME: {
        const volume = requireNumber(payload, "volume");
        const cmd = new SetTrackVolumeCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          volume,
        );
        await history.execute(cmd);
        return { success: true, message: `Volume set to ${volume}dB` };
      }

      case CommandType.SET_PAN: {
        const pan = requireNumber(payload, "pan");
        const cmd = new SetTrackPanCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          pan,
        );
        await history.execute(cmd);
        return { success: true, message: `Pan set to ${pan}` };
      }

      case CommandType.MUTE_TRACK: {
        const mute = requireBoolean(payload, "mute");
        const cmd = new SetTrackMuteCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          mute,
        );
        await history.execute(cmd);
        return { success: true, message: `Track mute set to ${mute}` };
      }

      case CommandType.SOLO_TRACK: {
        const solo = requireBoolean(payload, "solo");
        const cmd = new SetTrackSoloCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          solo,
        );
        await history.execute(cmd);
        return { success: true, message: `Track solo set to ${solo}` };
      }

      case CommandType.SET_PLUGIN_PARAMETER: {
        const value = requireNumber(payload, "value");
        const cmd = new SetPluginParameterCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          requireString(payload, "processorId"),
          requireString(payload, "parameterId"),
          value,
        );
        await history.execute(cmd);
        return { success: true, message: `Plugin parameter set to ${value}` };
      }

      case CommandType.ARM_TRACK: {
        const trackId = requireString(payload, "trackId");
        const armed = requireBoolean(payload, "armed");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setArmed(armed);
        return {
          success: true,
          message: `Track ${armed ? "armed" : "disarmed"} for recording`,
        };
      }

      case CommandType.SET_TRACK_MONITOR: {
        const trackId = requireString(payload, "trackId");
        const monitor = requireBoolean(payload, "monitor");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setMonitor(monitor);
        return {
          success: true,
          message: `Track monitoring ${monitor ? "enabled" : "disabled"}`,
        };
      }

      case CommandType.SET_TRACK_COLOR: {
        const trackId = requireString(payload, "trackId");
        const color = requireString(payload, "color");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setColor(color);
        return { success: true, message: `Track color set to ${color}` };
      }

      case CommandType.REORDER_TRACK: {
        const newIndex = requireNumber(payload, "newIndex");
        const cmd = new ReorderTrackCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          newIndex,
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Track reordered to index ${newIndex}`,
        };
      }

      case CommandType.BOUNCE_TRACK: {
        const trackId = requireString(payload, "trackId");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        // Bounce track: render all regions to a single audio buffer, replace regions
        const regions = track.playlist.getRegions();
        if (regions.length === 0) {
          return { success: false, message: "No regions to bounce" };
        }
        const regionIds = regions.map((r) => r.id);
        try {
          const buffer = await audioEngine.renderRegionsToBuffer(
            trackId,
            regionIds,
          );
          return {
            success: true,
            message: `Track bounced: ${buffer.duration.toFixed(2)}s`,
            data: {
              duration: buffer.duration,
              channels: buffer.numberOfChannels,
            },
          };
        } catch (error) {
          return {
            success: false,
            message: `Bounce failed: ${(error as Error).message}`,
          };
        }
      }

      case CommandType.FREEZE_TRACK: {
        const cmd = new FreezeTrackCommand(
          audioEngine.session,
          audioEngine,
          requireString(payload, "trackId"),
        );
        await history.execute(cmd);
        return { success: true, message: `Track frozen` };
      }

      case CommandType.UNFREEZE_TRACK: {
        const unfreezeTrackId = requireString(payload, "trackId");
        const unfreezeTrack = audioEngine.session.getTrack(unfreezeTrackId);
        if (!unfreezeTrack) {
          return {
            success: false,
            message: `Track not found: ${unfreezeTrackId}`,
          };
        }
        if (!unfreezeTrack.frozen) {
          return { success: false, message: "Track is not frozen" };
        }
        // Undo the last freeze by executing history.undo()
        // In practice, the UI would call undo, but for explicit UNFREEZE
        // we trigger undo on the history
        await history.undo();
        return { success: true, message: "Track unfrozen" };
      }

      // ─── Phase 15: Track Enhancements ────────────────────────────
      case CommandType.SET_TRACK_PAN_WIDTH: {
        const trackId = requireString(payload, "trackId");
        const width = requireNumber(payload, "width");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.route.panner.setWidth(width);
        return { success: true, message: `Pan width set to ${width}` };
      }

      case CommandType.SET_TRACK_MONITOR_MODE: {
        const trackId = requireString(payload, "trackId");
        const mode = requireString(payload, "mode") as MonitorMode;
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setMonitorMode(mode);
        return { success: true, message: `Monitor mode set to ${mode}` };
      }

      case CommandType.SET_TRACK_TRIM_GAIN: {
        const trackId = requireString(payload, "trackId");
        const trimGainDb = requireNumber(payload, "trimGainDb");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setTrimGain(trimGainDb);
        return { success: true, message: `Trim gain set to ${trimGainDb}dB` };
      }

      case CommandType.SET_TRACK_SOLO_ISOLATE: {
        const trackId = requireString(payload, "trackId");
        const isolate = requireBoolean(payload, "isolate");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setSoloIsolate(isolate);
        return {
          success: true,
          message: `Solo isolate ${isolate ? "enabled" : "disabled"}`,
        };
      }

      case CommandType.SET_TRACK_SOLO_SAFE: {
        const trackId = requireString(payload, "trackId");
        const safe = requireBoolean(payload, "safe");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setSoloSafe(safe);
        return {
          success: true,
          message: `Solo safe ${safe ? "enabled" : "disabled"}`,
        };
      }

      case CommandType.SET_TRACK_COMMENT: {
        const trackId = requireString(payload, "trackId");
        const comment = requireString(payload, "comment");
        const track = audioEngine.session.getTrack(trackId);
        if (!track) {
          return { success: false, message: `Track not found: ${trackId}` };
        }
        track.setComment(comment);
        return { success: true, message: "Track comment updated" };
      }

      case CommandType.SET_TRACK_RECORD_MODE: {
        const mode = requireString(payload, "mode") as RecordMode;
        const command = new SetTrackRecordModeCommand(
          audioEngine.session,
          requireString(payload, "trackId"),
          mode,
        );
        await history.execute(command);
        return { success: true, message: `Track record mode set to ${mode}` };
      }

      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
}
