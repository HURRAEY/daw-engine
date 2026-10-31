import {
  CommandHandler,
  CommandHandlerPayload,
  CommandResult,
  getTrackOrThrow,
} from "./CommandHandler";
import { AudioEngine } from "../../audio/AudioEngine";
import { CommandHistory } from "../CommandHistory";
import { CommandType } from "../types";
import { PresetManager } from "../../plugins/PluginPreset";
import { PluginInsert } from "../../processing/PluginInsert";

/**
 * Handles MIDI input device selection, plugin presets, and mixer scene commands.
 */
export class MixerSceneHandler implements CommandHandler {
  private readonly supportedCommands = new Set<string>([
    CommandType.SET_MIDI_INPUT_DEVICE,
    CommandType.APPLY_PLUGIN_PRESET,
    CommandType.SAVE_PLUGIN_PRESET,
    CommandType.SAVE_MIXER_SCENE,
    CommandType.RECALL_MIXER_SCENE,
    CommandType.DELETE_MIXER_SCENE,
    CommandType.RENAME_MIXER_SCENE,
  ]);

  canHandle(commandType: string): boolean {
    return this.supportedCommands.has(commandType);
  }

  async execute(
    commandType: string,
    payload: CommandHandlerPayload | undefined,
    audioEngine: AudioEngine,
    _history: CommandHistory,
  ): Promise<CommandResult> {
    if (!payload) {
      return { success: false, message: `${commandType} requires a payload` };
    }

    switch (commandType) {
      // ─── MIDI Input Device ────────────────────────────────────────
      case CommandType.SET_MIDI_INPUT_DEVICE: {
        const inputId = payload.inputId as string | null;
        audioEngine.setMidiInputDevice(inputId);
        return {
          success: true,
          message: inputId
            ? `MIDI input device set: ${inputId}`
            : "MIDI input device disconnected",
        };
      }

      // ─── Plugin Presets ───────────────────────────────────────────
      case CommandType.APPLY_PLUGIN_PRESET: {
        const track = getTrackOrThrow(audioEngine, payload.trackId as string);
        const proc = track.route.processors.find(
          (p) => p.id === (payload!.processorId as string),
        );
        if (!proc || !(proc instanceof PluginInsert)) {
          return {
            success: false,
            message: `Processor ${payload!.processorId} not found or has no plugin`,
          };
        }

        const presetMgr = PresetManager.getInstance();
        const params = presetMgr.getPresetParameters(
          payload!.presetId as string,
        );
        if (!params) {
          return {
            success: false,
            message: `Preset ${payload!.presetId} not found`,
          };
        }

        for (const [paramId, value] of params) {
          proc.plugin.setParameter(paramId, value);
        }
        return {
          success: true,
          message: `Preset applied: ${payload.presetId}`,
        };
      }

      case CommandType.SAVE_PLUGIN_PRESET: {
        const track = getTrackOrThrow(audioEngine, payload.trackId as string);
        const proc = track.route.processors.find(
          (p) => p.id === (payload!.processorId as string),
        );
        if (!proc || !(proc instanceof PluginInsert)) {
          return {
            success: false,
            message: `Processor ${payload!.processorId} not found or has no plugin`,
          };
        }

        const currentParams = new Map<string, number>();
        for (const param of proc.plugin.getParameters()) {
          currentParams.set(param.id, param.value);
        }

        const presetMgr = PresetManager.getInstance();
        const presetId = presetMgr.savePreset(
          payload.name as string,
          payload.pluginId as string,
          currentParams,
        );
        return {
          success: true,
          message: `Preset saved: ${payload.name}`,
          data: { presetId },
        };
      }

      // ─── Mixer Scenes ─────────────────────────────────────────────
      case CommandType.SAVE_MIXER_SCENE: {
        const sceneId = audioEngine.session.mixerSceneManager.saveScene(
          payload.name as string,
          audioEngine.session,
        );
        return {
          success: true,
          message: `Mixer scene saved: ${payload.name}`,
          data: { sceneId },
        };
      }

      case CommandType.RECALL_MIXER_SCENE: {
        const recalled = audioEngine.session.mixerSceneManager.recallScene(
          payload.sceneId as string,
          audioEngine.session,
        );
        if (!recalled) {
          return {
            success: false,
            message: `Mixer scene not found: ${payload.sceneId}`,
          };
        }
        return {
          success: true,
          message: `Mixer scene recalled: ${payload.sceneId}`,
        };
      }

      case CommandType.DELETE_MIXER_SCENE: {
        const deleted = audioEngine.session.mixerSceneManager.deleteScene(
          payload.sceneId as string,
        );
        if (!deleted) {
          return {
            success: false,
            message: `Mixer scene not found: ${payload.sceneId}`,
          };
        }
        return {
          success: true,
          message: `Mixer scene deleted: ${payload.sceneId}`,
        };
      }

      case CommandType.RENAME_MIXER_SCENE: {
        const renamed = audioEngine.session.mixerSceneManager.renameScene(
          payload.sceneId as string,
          payload.name as string,
        );
        if (!renamed) {
          return {
            success: false,
            message: `Mixer scene not found: ${payload.sceneId}`,
          };
        }
        return {
          success: true,
          message: `Mixer scene renamed to "${payload.name}"`,
        };
      }

      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
}
