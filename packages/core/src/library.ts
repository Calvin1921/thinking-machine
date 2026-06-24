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

/** Write a verified subtree payload (and its originating context) under the topic's key. */
export function cacheSubtree(libDir: string, topic: string, payload: unknown, context?: string): void {
  mkdirSync(libDir, { recursive: true });
  writeFileSync(entryPath(libDir, topic), JSON.stringify({ topic, context, payload }, null, 2));
}

/** Read the cached payload for a topic, or null on a miss / unreadable entry. */
export function lookupCache(libDir: string, topic: string): unknown | null {
  const entry = lookupCacheEntry(libDir, topic);
  return entry ? entry.payload : null;
}

/** Read the full cache entry (context + payload) for a topic, or null on miss/unreadable. */
export function lookupCacheEntry(libDir: string, topic: string): { context?: string; payload: unknown } | null {
  const file = entryPath(libDir, topic);
  if (!existsSync(file)) return null;
  try {
    const { context, payload } = JSON.parse(readFileSync(file, "utf8")) as { context?: string; payload: unknown };
    return { context, payload };
  } catch {
    return null;
  }
}
