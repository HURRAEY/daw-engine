import {
  CommandHandler,
  CommandHandlerPayload,
  CommandResult,
} from "./CommandHandler";
import { AudioEngine } from "../../audio/AudioEngine";
import { CommandHistory } from "../CommandHistory";
import { CommandType } from "../types";
import { AddMarkerCommand } from "../impl/AddMarkerCommand";
import { RemoveMarkerCommand } from "../impl/RemoveMarkerCommand";
import { MoveMarkerCommand } from "../impl/MoveMarkerCommand";
import { RenameMarkerCommand } from "../impl/RenameMarkerCommand";
import { SetMarkerLockedCommand } from "../impl/SetMarkerLockedCommand";

/**
 * Marker Command Handler
 */
export class MarkerHandler implements CommandHandler {
  private readonly supportedCommands = new Set<string>([
    CommandType.ADD_MARKER,
    CommandType.REMOVE_MARKER,
    CommandType.MOVE_MARKER,
    CommandType.LIST_MARKERS,
    CommandType.GOTO_NEXT_MARKER,
    CommandType.GOTO_PREV_MARKER,
    CommandType.RENAME_MARKER,
    CommandType.SET_MARKER_LOCKED,
  ]);
  private readonly commandsWithoutPayload = new Set<string>([
    CommandType.LIST_MARKERS,
    CommandType.GOTO_NEXT_MARKER,
    CommandType.GOTO_PREV_MARKER,
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
    if (!payload && !this.commandsWithoutPayload.has(commandType)) {
      return { success: false, message: `${commandType} requires a payload` };
    }
    const markerPayload = payload ?? {};

    switch (commandType) {
      case CommandType.ADD_MARKER: {
        const cmd = new AddMarkerCommand(
          markerPayload.name as string,
          markerPayload.position as number,
          markerPayload.color as string | undefined,
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Added marker "${markerPayload.name}" at frame ${markerPayload.position}`,
          data: { markerId: cmd.id },
        };
      }

      case CommandType.REMOVE_MARKER: {
        const cmd = new RemoveMarkerCommand(markerPayload.markerId as string);
        await history.execute(cmd);
        return {
          success: true,
          message: `Removed marker ${markerPayload.markerId}`,
        };
      }

      case CommandType.MOVE_MARKER: {
        const cmd = new MoveMarkerCommand(
          markerPayload.markerId as string,
          markerPayload.position as number,
        );
        try {
          await history.execute(cmd);
        } catch (error) {
          return {
            success: false,
            message: (error as Error).message,
          };
        }
        return {
          success: true,
          message: `Moved marker to frame ${markerPayload.position}`,
        };
      }

      case CommandType.LIST_MARKERS: {
        const markers = audioEngine.session.markers.map((m) => ({
          id: m.id,
          name: m.name,
          position: m.position,
          time: (m.position / audioEngine.session.sampleRate).toFixed(2) + "s",
          color: m.color,
          locked: m.locked,
        }));
        return {
          success: true,
          message: `${markers.length} marker(s)`,
          data: markers,
        };
      }

      case CommandType.GOTO_NEXT_MARKER: {
        const currentFrame = audioEngine.getCurrentFrame();
        const nextMarker = audioEngine.session.getNextMarker(currentFrame);
        if (nextMarker) {
          audioEngine.seek(
            nextMarker.position / audioEngine.session.sampleRate,
          );
          return {
            success: true,
            message: `Jumped to marker "${nextMarker.name}"`,
          };
        }
        return { success: false, message: "No next marker" };
      }

      case CommandType.GOTO_PREV_MARKER: {
        const currentFrame = audioEngine.getCurrentFrame();
        const prevMarker = audioEngine.session.getPreviousMarker(currentFrame);
        if (prevMarker) {
          audioEngine.seek(
            prevMarker.position / audioEngine.session.sampleRate,
          );
          return {
            success: true,
            message: `Jumped to marker "${prevMarker.name}"`,
          };
        }
        return { success: false, message: "No previous marker" };
      }

      case CommandType.RENAME_MARKER: {
        const marker = audioEngine.session.getMarker(
          markerPayload.markerId as string,
        );
        if (!marker) {
          return {
            success: false,
            message: `Marker not found: ${markerPayload.markerId}`,
          };
        }
        const cmd = new RenameMarkerCommand(
          audioEngine.session,
          markerPayload.markerId as string,
          markerPayload.name as string,
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Marker renamed to "${markerPayload.name}"`,
        };
      }

      case CommandType.SET_MARKER_LOCKED: {
        const marker = audioEngine.session.getMarker(
          markerPayload.markerId as string,
        );
        if (!marker) {
          return {
            success: false,
            message: `Marker not found: ${markerPayload.markerId}`,
          };
        }
        const cmd = new SetMarkerLockedCommand(
          audioEngine.session,
          markerPayload.markerId as string,
          markerPayload.locked as boolean,
        );
        await history.execute(cmd);
        return {
          success: true,
          message: `Marker ${markerPayload.locked ? "locked" : "unlocked"}`,
        };
      }

      default:
        throw new Error(`Unsupported command: ${commandType}`);
    }
  }
}
