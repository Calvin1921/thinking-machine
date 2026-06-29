// The Judge port: judgment behind an interface, so a Claude Code session and a headless
// adapter are interchangeable drivers of the SAME flow. Core stays pure — it defines the
// port, the portable prompt, and the orchestration; concrete adapters (which do IO) live
// in the surfaces. Validated 2026-06-29: the headless judge matched/beat in-session.
import type { Board } from "./schema.js";
import { ancestorPath, growSubtree, type GrowInput } from "./ops.js";

/** Everything a judge needs to propose a decomposition for one node — gathered from the board. */
export interface GrowContext {
  label: string;
  rootType?: string;        // objective | cause | decision | concept (root's type)
  ancestorPath: string[];   // labels, root → this node
  domainHint?: string;      // the board's project/area
  recall: string[];         // related prior thinking (empty until core.recall lands)
}

/** A judge's output IS a grow proposal — the same shape growSubtree commits. */
export type GrowProposal = GrowInput;

/** The port. One method: given context, propose a subtree. Sync source, async by nature (LLM). */
export interface Judge {
  propose(ctx: GrowContext): Promise<GrowProposal>;
}

/** Build the GrowContext for a node from the board (pure). `recall` is injected by the
 *  caller (the surface computes it via core.recall over the store) — keeps this IO-free. */
export function growContext(board: Board, nodeId: string, recall: string[] = []): GrowContext {
  const node = board.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`unknown node: ${nodeId}`);
  const root = board.nodes.find((n) => n.id === board.rootId);
  const labelOf = (id: string) => board.nodes.find((n) => n.id === id)?.label ?? id;
  return {
    label: node.label,
    rootType: root?.rootType,
    ancestorPath: ancestorPath(board, nodeId).map(labelOf),
    domainHint: board.domainHint,
    recall,
  };
}

/**
 * THE portable judgment spec — the 5 heuristics + this node's context, as one self-contained
 * prompt. Single source of the method: the headless adapter sends this verbatim; the in-session
 * skill mirrors it. (This is the prompt the parity probe validated.)
 */
export function buildJudgePrompt(ctx: GrowContext): string {
  const path = ctx.ancestorPath.join(" > ");
  const recall = ctx.recall.length ? `\nRELATED PRIOR THINKING (reuse where it fits):\n- ${ctx.recall.join("\n- ")}` : "";
  return `You are the tmind decomposition engine. Break the ROOT node into the parts worth thinking about further, as a tree of nodes. A node = {label, kind:"branch"|"atom", description, children?}.

Apply these heuristics at EVERY level, in order:
0. Probe-or-decompose: if a node is high-charge but stuck on missing REALITY (a fact/market/user you don't have), do NOT spawn children — make it an atom whose description states a PROBE: the cheapest real test + a success threshold + a date.
1. MECE then drop the weakest: 3-6 children, mutually exclusive, collectively exhaustive for the domain; cut at least one weak option (a breakdown with nothing dropped is a list, not a decomposition).
2. Rank by charge x tractability: order children by how much each matters x how actionable it is.
3. Name the crux (the child with the highest in-degree x uncertainty: what the most others depend on AND is least resolved) inside the PARENT's description; expand it first.
4. For a decision root, the children MUST be the pipeline: options, criteria, risks, reversibility — and the decomposition MUST exit on a probe (a dated, numeric test of the crux + a tripwire "wrong if X by DATE"). (Skip if the root is not a decision.)
${ctx.rootType && ctx.rootType !== "decision" ? "5. NON-DECISION discipline: name exactly ONE overall crux for the whole tree (not one per branch). Do NOT attach a fresh crux or a probe to every node — add a probe only where heuristic 0 genuinely applies. Fewer, cleaner, non-overlapping branches beat breadth; resist drifting into a list.\n" : ""}
Give EVERY node a description that carries real signal (not a restatement of the label). Depth 2-3. 3-6 children per level. Use dependency edges only for genuine shared cross-links.

ROOT: "${ctx.label}"${ctx.rootType ? `\nROOT TYPE: ${ctx.rootType}` : ""}${path ? `\nPATH (context above this node): ${path}` : ""}${ctx.domainHint ? `\nDOMAIN: ${ctx.domainHint}` : ""}${recall}

Output ONLY a JSON object, no markdown fences, no prose before or after:
{"nodes":[{"label":"...","kind":"branch","description":"...","children":[{"label":"...","kind":"atom","description":"..."}]}],"edges":[{"fromLabel":"...","toLabel":"...","type":"dependency","label":"..."}]}`;
}

/**
 * Orchestrate one decompose: build context → judge proposes → commit the subtree.
 * Pure except for the injected (async) judge — so the same flow runs in-session or headless,
 * deterministically given a judge. Returns the next board AND the raw proposal (for dry-run).
 * (recall → collisions are future mechanical steps; the seam is here.)
 */
export async function runGrowFlow(
  board: Board,
  nodeId: string,
  judge: Judge,
  opts: { recall?: string[] } = {},
): Promise<{ board: Board; proposal: GrowProposal }> {
  const ctx = growContext(board, nodeId, opts.recall ?? []);
  const proposal = await judge.propose(ctx);
  const next = growSubtree(board, nodeId, proposal);
  return { board: next, proposal };
}
