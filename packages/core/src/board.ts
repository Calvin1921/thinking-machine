// packages/core/src/board.ts
import { readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, existsSync } from "node:fs";
import { Board, migrate, CURRENT_VERSION, SEED_FACETS } from "./schema.js";
import { tmpPath, lockPath } from "./paths.js";

export function newBoard(title: string, rootType: "objective" | "cause" | "decision" | "concept"): Board {
  const facets = Object.fromEntries(SEED_FACETS.map((k) => [k, [] as string[]]));
  return {
    version: CURRENT_VERSION, id: "board", title, rootId: "root",
    nodes: [{ id: "root", label: title, kind: "root", rootType, x: 0, y: 0, facets }],
    edges: [],
  };
}

export function loadBoard(file: string): Board {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return migrate(raw);
}

/** Atomic write: write temp, then rename over the target. */
export function saveBoard(file: string, board: Board): void {
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
    catch { const until = Date.now() + 20; while (Date.now() < until) { /* spin */ } }
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
