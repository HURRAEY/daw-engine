import { describe, expect, it } from "vitest";

import type { UndoableCommand } from "./Command";
import { UndoTransaction } from "./UndoTransaction";

function createCommand(name: string, calls: string[]): UndoableCommand {
  return {
    execute: async () => {
      calls.push(`${name}:execute`);
    },
    undo: async () => {
      calls.push(`${name}:undo`);
    },
    redo: async () => {
      calls.push(`${name}:redo`);
    },
  };
}

describe("UndoTransaction", () => {
  it("Undo는 역순, Redo는 정순으로 실행한다", async () => {
    const calls: string[] = [];
    const transaction = new UndoTransaction("리전 이동");
    transaction.addCommand(createCommand("region", calls));
    transaction.addCommand(createCommand("playlist", calls));

    await transaction.undo();
    await transaction.redo();

    expect(calls).toEqual([
      "playlist:undo",
      "region:undo",
      "region:redo",
      "playlist:redo",
    ]);
  });
});
