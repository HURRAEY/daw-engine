import { AudioEngine } from "../audio/AudioEngine";
import { AudioCommandSchema } from "./types";
import { z } from "zod";
import { CommandHistory } from "./CommandHistory";
import {
  CommandHandler,
  CommandHandlerPayload,
  CommandResult,
} from "./handlers/CommandHandler";
import { TransportHandler } from "./handlers/TransportHandler";
import { TrackHandler } from "./handlers/TrackHandler";
import { RegionHandler } from "./handlers/RegionHandler";
import { RangeHandler } from "./handlers/RangeHandler";
import { AutomationHandler } from "./handlers/AutomationHandler";
import { ExportHandler } from "./handlers/ExportHandler";
import { IOHandler } from "./handlers/IOHandler";
import { HistoryHandler } from "./handlers/HistoryHandler";
import { SendBusHandler } from "./handlers/SendBusHandler";
import { SessionHandler } from "./handlers/SessionHandler";
import { MarkerHandler } from "./handlers/MarkerHandler";
import { MidiHandler } from "./handlers/MidiHandler";
import { MixerSceneHandler } from "./handlers/MixerSceneHandler";
import { TrackGroupHandler } from "./handlers/TrackGroupHandler";
import { Signal } from "../lib/Signal";

/**
 * Command Executor (Refactored)
 *
 * 리팩토링된 Command Executor.
 * 각 카테고리별로 Handler에게 위임하여 코드를 간결하게 유지합니다.
 *
 * Before: 628 라인 (단일 파일)
 * After: ~100 라인 (메인) + 8개 핸들러 (각 50-150 라인)
 */
export class CommandExecutor {
  private static instance: CommandExecutor;
  private audioEngine: AudioEngine;
  private _history: CommandHistory;
  private handlers: CommandHandler[];

  public readonly commandExecuted = new Signal<{
    type: string;
    payload?: CommandHandlerPayload;
  }>();

  private constructor() {
    this.audioEngine = AudioEngine.getInstance();
    this._history = new CommandHistory();

    // Register all handlers
    this.handlers = [
      new TransportHandler(),
      new TrackHandler(),
      new RegionHandler(),
      new RangeHandler(),
      new AutomationHandler(),
      new ExportHandler(),
      new IOHandler(),
      new SendBusHandler(),
      new SessionHandler(),
      new MarkerHandler(),
      new MidiHandler(),
      new MixerSceneHandler(),
      new TrackGroupHandler(),
      new HistoryHandler(),
    ];
  }

  public registerHandler(handler: CommandHandler): void {
    this.handlers.push(handler);
  }

  public static getInstance(): CommandExecutor {
    if (!CommandExecutor.instance) {
      CommandExecutor.instance = new CommandExecutor();
    }
    return CommandExecutor.instance;
  }

  public get history(): CommandHistory {
    return this._history;
  }

  /**
   * Command 실행
   *
   * 1. Zod로 검증
   * 2. AudioEngine 초기화
   * 3. 적절한 Handler 찾기
   * 4. Handler에게 위임
   */
  public async execute(
    commandJson: unknown,
    history: CommandHistory = this._history,
  ): Promise<CommandResult> {
    try {
      // 1. Validate the command against the schema
      const command = AudioCommandSchema.parse(commandJson);

      // 2. Initialize engine if needed (lazy init)
      await this.audioEngine.initialize();

      // 3. Find appropriate handler
      const handler = this.handlers.find((h) => h.canHandle(command.type));

      if (!handler) {
        return {
          success: false,
          message: `No handler found for command type: ${command.type}`,
        };
      }

      // 4. Delegate to handler
      const payload: CommandHandlerPayload | undefined =
        "payload" in command
          ? (command.payload as CommandHandlerPayload)
          : undefined;

      const result = await handler.execute(
        command.type,
        payload,
        this.audioEngine,
        history,
      );

      if (result.success) {
        this.commandExecuted.emit({ type: command.type, payload });
      }

      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          message: `Invalid command format: ${error.issues.map((e: z.ZodIssue) => e.message).join(", ")}`,
        };
      }
      return {
        success: false,
        message: `Execution failed: ${(error as Error).message}`,
      };
    }
  }
}
