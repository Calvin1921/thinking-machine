// packages/core/src/library.ts
// fs-backed cache of verified subtrees, keyed by a normalized topic slug. Single-board
// scope in Phase 2 (cross-board reuse is Phase 3). Lives in the `.` barrel, never in
// `./schema` (the browser must not pull fs in).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { slug } from "./boards.js";

export function cacheKey(topic: string): string {
  return slug(topic);
}

function entryPath(libDir: string, topic: string): string {
  return join(libDir, `${cacheKey(topic)}.json`);
}

/** Write a verified subtree payload under the topic's key (creates libDir). */
export function cacheSubtree(libDir: string, topic: string, payload: unknown): void {
  mkdirSync(libDir, { recursive: true });
  writeFileSync(entryPath(libDir, topic), JSON.stringify({ topic, payload }, null, 2));
}

/** Read the cached payload for a topic, or null on a miss / unreadable entry. */
export function lookupCache(libDir: string, topic: string): unknown | null {
  const file = entryPath(libDir, topic);
  if (!existsSync(file)) return null;
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { payload: unknown }).payload;
  } catch {
    return null;
  }
}
