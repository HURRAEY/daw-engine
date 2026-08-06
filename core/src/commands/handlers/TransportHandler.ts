import {
  CommandHandler,
  CommandHandlerPayload,
  CommandResult,
} from "./CommandHandler";
import { AudioEngine } from "../../audio/AudioEngine";
import { CommandHistory } from "../CommandHistory";
import { CommandType } from "../types";
import { AddTempoChangeCommand } from "../impl/AddTempoChangeCommand";
import { RemoveTempoChangeCommand } from "../impl/RemoveTempoChangeCommand";
import { TrackType } from "../../domain/Track";
import {
  capturePlaylistEditState,
  createPlaylistEditTransaction,
  hasPlaylistMembershipChanged,
} from "../history/PlaylistEditHistory";

/**
 * Transport Command Handler
 *
 * 재생, 정지, 녹음, Seek 등 Transport 관련 명령 처리
 */
export class TransportHandler implements CommandHandler {
  private readonly supportedCommands = new Set<string>([
    CommandType.PLAY,
    CommandType.PAUSE,
    CommandType.STOP,
    CommandType.START_RECORDING,
    CommandType.STOP_RECORDING,
    CommandType.TOGGLE_METRONOME,
    CommandType.SEEK,
    CommandType.SET_TEMPO,
    CommandType.SET_TIME_SIGNATURE,
    CommandType.ENABLE_PUNCH,
    CommandType.SET_LOOP_RECORDING,
    CommandType.SET_PRE_ROLL,
    CommandType.SET_MONITOR_WITH_EFFECTS,
    CommandType.ADD_TEMPO_CHANGE,
    CommandType.REMOVE_TEMPO_CHANGE,
    CommandType.SET_TRANSPORT_MODE,
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
    // Commands that don't require a payload
    switch (commandType) {
      case CommandType.PLAY:
        await audioEngine.start();
        return { success: true, message: "Playback started" };

      case CommandType.PAUSE:
        audioEngine.pause();
        return { success: true, message: "Playback paused" };

      case CommandType.STOP:
        audioEngine.stop();
        return { success: true, message: "Playback stopped" };

      case CommandType.START_RECORDING:
        await audioEngine.startRecording();
        return { success: true, message: "Recording started" };

      case CommandType.STOP_RECORDING: {
        const playlists = audioEngine.session.tracks
          .filter((track) => track.armed && track.type !== TrackType.MIDI)
          .map((track) => track.playlist);
        const before = capturePlaylistEditState(playlists);
        await audioEngine.stopRecording();
        const after = capturePlaylistEditState(playlists);
        if (hasPlaylistMembershipChanged(before, after)) {
          const transaction = createPlaylistEditTransaction(
            "RecordAudio",
            before,
            after,
          );
          await history.record(transaction, transaction.name);
        }
        return { success: true, message: "Recording stopped" };
      }

      case CommandType.TOGGLE_METRONOME:
        audioEngine.session.toggleMetronome();
        return { success: true, message: "Metronome toggled" };

      default:
        break;
    }

    // Remaining commands require a payload
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }

    switch (commandType) {
      case CommandType.SEEK:
        audioEngine.seek(payload.time as number);
        return { success: true, message: `Seeked to ${payload.time}s` };

      case CommandType.SET_TEMPO:
        audioEngine.session.setTempo(payload.bpm as number);
        return { success: true, message: `Tempo set to ${payload.bpm}` };

      case CommandType.SET_TIME_SIGNATURE:
        audioEngine.session.setTimeSignature(
          payload.numerator as number,
          payload.denominator as number,
        );
        return {
          success: true,
          message: `Time signature set to ${payload.numerator}/${payload.denominator}`,
        };

      case CommandType.ENABLE_PUNCH:
        audioEngine.enablePunchRecording(payload.enabled as boolean);
        return {
          success: true,
          message: `Punch recording ${payload.enabled ? "enabled" : "disabled"}`,
        };

      case CommandType.SET_LOOP_RECORDING:
        audioEngine.session.setLoopRecording(payload.enabled as boolean);
        return {
          success: true,
          message: `Loop recording ${payload.enabled ? "enabled" : "disabled"}`,
        };

      case CommandType.SET_PRE_ROLL:
        audioEngine.session.setPreRollBars(payload.bars as number);
        return {
          success: true,
          message: `Pre-roll set to ${payload.bars} bars`,
        };

      case CommandType.SET_MONITOR_WITH_EFFECTS:
        audioEngine.setMonitorWithEffects(
          payload.trackId as string,
          payload.enabled as boolean,
        );
        return {
          success: true,
          message: `Monitor with effects ${payload.enabled ? "enabled" : "disabled"} for track ${payload.trackId}`,
        };

      case CommandType.ADD_TEMPO_CHANGE: {
        const addTempoCmd = new AddTempoChangeCommand(
          payload.frame as number,
          payload.bpm as number,
          payload.timeSigNum as number | undefined,
          payload.timeSigDen as number | undefined,
        );
        await history.execute(addTempoCmd);
        return {
          success: true,
          message: `Tempo change added: ${payload.bpm} BPM at frame ${payload.frame}`,
        };
      }

      case CommandType.REMOVE_TEMPO_CHANGE: {
        const removeTempoCmd = new RemoveTempoChangeCommand(
          payload.frame as number,
        );
        await history.execute(removeTempoCmd);
        return {
          success: true,
          message: `Tempo change removed at frame ${payload.frame}`,
        };
      }

      case CommandType.SET_TRANSPORT_MODE: {
        const mode = payload.mode as string;
        const scrubState = audioEngine.session.scrubState;
        switch (mode) {
          case "normal":
            scrubState.setNormalMode();
            break;
          case "scrub":
            scrubState.setScrubMode();
            break;
          case "shuttle":
            scrubState.setShuttleMode(1.0);
            break;
        }
        return { success: true, message: `Transport mode set to ${mode}` };
      }

      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
}
