// packages/core/src/boards.ts
// fs-backed, server-only board-directory operations. Stays in the `.` barrel,
// NEVER in `./schema` (the browser must not pull fs in).
import { readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Board } from "./schema.js";
import { loadBoard, saveBoard, newBoard } from "./board.js";

export interface BoardSummary {
  id: string;
  title: string;
  rootType?: string;
  nodeCount: number;
  updatedAt: number; // fs mtime in ms
}

export function boardPath(dir: string, id: string): string {
  return join(dir, `${id}.json`);
}

/** A URL-safe slug of a title (no Date.now/Math.random — uniqueness handled by caller). */
export function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "board"
  );
}

function rootTypeOf(board: Board): string | undefined {
  return board.nodes.find((n) => n.id === board.rootId)?.rootType;
}

/**
 * List every `*.json` board in `dir`, newest first. Missing dir -> []. Files that
 * fail to load/parse are skipped (a single bad file must not break the whole list).
 */
export function listBoards(dir: string): BoardSummary[] {
  if (!existsSync(dir)) return [];
  const summaries: BoardSummary[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const full = join(dir, file);
    try {
      const board = loadBoard(full);
      summaries.push({
        // The FILENAME is the canonical id — it's what boardPath()/routing resolve.
        // board.id is unreliable (e.g. "board" for CLI-init'd boards) so must NOT be used here.
        id: file.replace(/\.json$/, ""),
        title: board.title,
        rootType: rootTypeOf(board),
        nodeCount: board.nodes.length,
        updatedAt: statSync(full).mtimeMs,
      });
    } catch {
      // skip unparseable/partial files
    }
  }
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Create a new board in `dir`. The id is a slug of the title, made unique within
 * the directory by appending -2, -3… on collision. Returns the new id.
 */
export function createBoard(
  dir: string,
  title: string,
  rootType: "objective" | "cause" | "decision" | "concept",
): string {
  mkdirSync(dir, { recursive: true });
  const base = slug(title);
  let id = base;
  for (let n = 2; existsSync(boardPath(dir, id)); n++) id = `${base}-${n}`;
  saveBoard(boardPath(dir, id), newBoard(title, rootType, id));
  return id;
}
