import { describe, expect, it, vi } from "vitest";

import type { ReversibleChange, UndoableCommand } from "./Command";
import { CommandHistory } from "./CommandHistory";

function createCommand(): UndoableCommand {
  return {
    execute: vi.fn(async () => undefined),
    undo: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined),
  };
}

describe("CommandHistory", () => {
  it("이미 실행된 변경은 execute 함수 없이 기록한다", async () => {
    const history = new CommandHistory();
    const change: ReversibleChange = {
      undo: vi.fn(async () => undefined),
      redo: vi.fn(async () => undefined),
    };

    await history.record(change, "리전 이동");

    expect(history.nextUndoLabel).toBe("리전 이동");
  });

  it("Undo가 실패하면 항목을 Undo 스택에 유지한다", async () => {
    const history = new CommandHistory();
    const command = createCommand();
    vi.mocked(command.undo).mockRejectedValueOnce(new Error("복원 실패"));
    await history.record(command, "리전 이동");

    await expect(history.undo()).rejects.toThrow("복원 실패");

    expect(history.undoDepth).toBe(1);
    expect(history.redoDepth).toBe(0);
  });

  it("Redo가 실패하면 항목을 Redo 스택에 유지한다", async () => {
    const history = new CommandHistory();
    const command = createCommand();
    await history.record(command, "리전 이동");
    await history.undo();
    vi.mocked(command.redo).mockRejectedValueOnce(new Error("재적용 실패"));

    await expect(history.redo()).rejects.toThrow("재적용 실패");

    expect(history.undoDepth).toBe(0);
    expect(history.redoDepth).toBe(1);
  });

  it("동시에 요청한 Undo를 순서대로 실행한다", async () => {
    const history = new CommandHistory();
    const executionOrder: string[] = [];
    let releaseFirstUndo: (() => void) | undefined;
    const firstUndoBlocked = new Promise<void>((resolve) => {
      releaseFirstUndo = resolve;
    });

    const firstCommand = createCommand();
    firstCommand.undo = vi.fn(async () => {
      executionOrder.push("first");
    });
    const secondCommand = createCommand();
    secondCommand.undo = vi.fn(async () => {
      executionOrder.push("second-start");
      await firstUndoBlocked;
      executionOrder.push("second-end");
    });

    await history.record(firstCommand, "첫 번째");
    await history.record(secondCommand, "두 번째");

    const secondUndo = history.undo();
    const firstUndo = history.undo();
    await Promise.resolve();

    expect(executionOrder).toEqual(["second-start"]);

    releaseFirstUndo?.();
    await Promise.all([secondUndo, firstUndo]);

    expect(executionOrder).toEqual(["second-start", "second-end", "first"]);
  });
});
