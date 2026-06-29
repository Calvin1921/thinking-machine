// core.recall — the compounding-memory layer. Scans the central store and ranks nodes
// related to a topic, so a new decompose can SURFACE prior thinking instead of starting cold
// (the felt gap: 49 boards were disconnected islands). Lexical first; embeddings later.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadBoard } from "./board.js";
import { ancestorPath } from "./ops.js";
import type { Board } from "./schema.js";

export interface RecallHit {
  boardId: string;     // filename id (canonical, like listBoards)
  boardTitle: string;
  nodeId: string;
  label: string;
  path: string;        // "Root > … > node" — where this sits
  snippet: string;     // description excerpt
  score: number;
  coverage: number;    // how many DISTINCT query terms this node matched (topical overlap, not one coincidental word)
}

const STOP = new Set(
  "the a an of to for and or in on at by with is are be how what why which that this then so do does your you it its as from into over under than about can could will would should not no".split(" "),
);

/** Lowercase word tokens, drop stopwords/short, crude singularize so "listings"~"listing". */
function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map((t) => t.replace(/(ies|es|s)$/, ""));
}

/**
 * Rank nodes across all boards in `dir` by lexical overlap with `topic`.
 * label hit = 3, description hit = 1, plus a small board-level bonus when the topic
 * matches the board's title/domainHint (lifts a whole relevant board). A node must clear
 * a content threshold on its OWN text (not just its board) to appear.
 */
export function recall(
  dir: string,
  topic: string,
  opts: { limit?: number; excludeBoardId?: string } = {},
): RecallHit[] {
  const limit = opts.limit ?? 8;
  if (!tokens(topic).length || !existsSync(dir)) return [];

  // Load the store once, then compute document-frequency so corpus-common tokens
  // ("time", "build", "business") can't drive a match — only rarer, meaningful terms
  // ("slop", "pricing", "wedge") do. This is what keeps an arbitrary prose prompt from
  // matching on a coincidental common word.
  const loaded: { id: string; board: Board }[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const id = file.replace(/\.json$/, "");
    try { loaded.push({ id, board: loadBoard(join(dir, file)) }); } catch { /* skip bad file */ }
  }
  const df = new Map<string, number>(); // token → how many boards contain it
  for (const { board } of loaded) {
    const present = new Set<string>();
    for (const n of board.nodes) { for (const t of tokens(n.label)) present.add(t); for (const t of tokens(n.description ?? "")) present.add(t); }
    for (const t of tokens(`${board.title} ${board.domainHint ?? ""}`)) present.add(t);
    for (const t of present) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const commonMax = Math.max(4, Math.ceil(loaded.length * 0.3)); // a token in >30% of boards is too common to be a signal
  const qset = new Set(tokens(topic).filter((t) => (df.get(t) ?? 0) <= commonMax));
  if (!qset.size) return []; // the prompt was all common/stopword terms → no signal

  const hits: RecallHit[] = [];
  for (const { id, board } of loaded) {
    if (id === opts.excludeBoardId) continue;
    const titleTokens = new Set(tokens(`${board.title} ${board.domainHint ?? ""}`));
    let boardBonus = 0;
    for (const t of qset) if (titleTokens.has(t)) boardBonus += 0.5;

    for (const n of board.nodes) {
      const lab = new Set(tokens(n.label));
      const desc = new Set(tokens(n.description ?? ""));
      let content = 0, coverage = 0;
      for (const t of qset) {
        const w = lab.has(t) ? 3 : desc.has(t) ? 1 : 0;
        content += w;
        if (w) coverage += 1;
      }
      if (content < 1) continue; // the node's OWN text must match (board bonus alone never surfaces it)
      const pathLabels = ancestorPath(board, n.id).map((pid) => board.nodes.find((x) => x.id === pid)?.label ?? pid);
      hits.push({
        boardId: id,
        boardTitle: board.title,
        nodeId: n.id,
        label: n.label,
        path: pathLabels.join(" > "),
        snippet: (n.description ?? "").slice(0, 140),
        score: Math.round((content + boardBonus) * 10) / 10,
        coverage,
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Render recall hits as compact context lines for a GrowContext / a judge prompt. */
export function recallContext(hits: RecallHit[]): string[] {
  return hits.map((h) => `[${h.boardTitle}] ${h.path}${h.snippet ? ` — ${h.snippet}` : ""}`);
}
