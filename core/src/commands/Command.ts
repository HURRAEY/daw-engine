export interface Command {
  execute(): Promise<void>;
}

export interface ReversibleChange {
  undo(): Promise<void>;
  redo(): Promise<void>;
}

export interface UndoableCommand extends Command, ReversibleChange {}
