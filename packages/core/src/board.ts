// packages/core/src/board.ts
import { readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, existsSync } from "node:fs";
import { Board, BoardSchema, migrate, CURRENT_VERSION } from "./schema.js";
import { tmpPath, lockPath } from "./paths.js";

export function newBoard(
  title: string,
  rootType: "objective" | "cause" | "decision" | "concept",
  id = "board",
): Board {
  return {
    version: CURRENT_VERSION, id, title, rootId: "root",
    nodes: [{ id: "root", label: title, kind: "root", rootType, x: 0, y: 0 }],
    edges: [],
  };
}

export function loadBoard(file: string): Board {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return migrate(raw);
}

/** Atomic write: validate, write temp, then rename over the target. Validation here means
 *  a malformed in-memory board (e.g. an unvalidated LLM proposal) fails loud instead of
 *  bricking the file for every future loadBoard(). */
export function saveBoard(file: string, board: Board): void {
  BoardSchema.parse(board);
  const tmp = tmpPath(file);
  writeFileSync(tmp, JSON.stringify(board, null, 2));
  renameSync(tmp, file);
}

/** Acquire an exclusive lockfile, run fn, release. Retries with backoff. */
export function withLock<T>(file: string, fn: () => T, retries = 50): T {
  const lock = lockPath(file);
  let fd: number | undefined;
  for (let i = 0; i < retries; i++) {
    try { fd = openSync(lock, "wx"); break; }
    // Block 20ms without spinning the CPU; Atomics.wait needs no clock (Date.now() breaks replay).
    catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20); }
  }
  if (fd === undefined) throw new Error(`Could not acquire lock on ${file}`);
  try { return fn(); }
  finally { closeSync(fd); if (existsSync(lock)) unlinkSync(lock); }
}

/** Read-modify-write a board under lock. The single write path for all mutations. */
export function mutate(file: string, fn: (board: Board) => Board): Board {
  return withLock(file, () => {
    const next = fn(loadBoard(file));
    saveBoard(file, next);
    return next;
  });
}
