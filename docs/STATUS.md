# Status — North Star vs. Current Code

Comparing `NORTH_STAR.md` against the running engine (`packages/core`, `cli`, `mcp`, `apps/web`) as of 2026-07-01. Verdict per capability, then a dependency-ordered build sequence.

> **Status update (2026-08-05):** Phase 1 shipped with the commit-or-gap `JudgeResult` union, `gap`/`resolution` node fields with migration, `tm gap` / `tm resolve` verbs, MCP tools, frontier rendering in the canvas, and validate-before-write on every board mutation. Scorecard rows #3 and #4 are now **built**; #2 is **partial** (gap questions surface and resolutions are recorded; the automated ask→fold-answer→re-decompose loop is still open). Phase 0 and Phases 2–4 remain as written below.

## Scorecard

| # | North-star capability | Today | Gap |
|---|---|---|---|
| 1 | **Full map** (enough info → draw start→goal, all paths) | ✅ **Built** | `decompose`/`grow` produce depth-2–3 MECE trees + crux. This is the strong half. |
| 2 | **Interview** (fixable gaps → ask sharp Qs, then map) | ❌ **Missing in engine** | Exists only as prose in `SKILL.md` Guide mode. No tool detects missing info or emits a question. |
| 3 | **Partial map + named gaps** (draw to the frontier, flag what's missing) | ❌ **Missing** | No `confidence`, no gap marker, no frontier concept. Judge always commits children. |
| 4 | **Never draw an unsupported path** (gap-first = the moat) | ❌ **Missing** | Judge has no "commit OR name-what's-missing" branch. Designed in the original spec, never built. |
| 5 | **Every step testable** (grounding: metric/probe/pass-fail) | 🟡 **Weak** | "Probe" is free-text in `description` + a 5-value `status` enum. No probe object, no criterion/threshold field, no link between status and a test. |
| 6 | **Cause → effect / root cause** | ❌ **Missing** | `rootType:"cause"` exists but no why-chain logic; only a free-text edge `label`. |
| 7 | **Form follows meaning** (pick the diagram form from content) | 🟡 **Renderer yes, auto-select no** | 6 real layout algorithms exist (tree/funnel/grid/timeline/radial/concentric) but form is set **manually** (`tm_set_layout`). No Mermaid/ASCII output. |
| 8 | **Trust layer** (provenance drafted→verified→refuted…) | 🟡 **Built, dormant** | Full schema + `verify`/`refresh-stale`. But "Phase 1 only ever sets drafted" — never auto-populated, used on ~2% of nodes. |

**One-line diagnosis:** the engine can *open* structure beautifully and cannot yet *be honest about what it doesn't know* — which is the entire north star.

---

## The builds (dependency-ordered)

### Phase 0 — Activate the dormant trust layer (tiny, do first)
**Gap:** provenance exists but is never set (#8).
**Build:** in `judge.ts`, have the decomposition output tag each node `contentKind` (factual|subjective) and set `provenance` at commit — `drafted` for factual-unchecked, `informed-opinion` for subjective. Wire `growSubtree`/`runGrowFlow` (`ops.ts`) to write it.
**Why first:** near-free, turns the 2% into ~100%, and makes the trust layer visible in every demo. No new concepts.

### Phase 1 — Gap-aware decompose (THE MOAT — builds #2, #3, #4 at once)
**Gap:** the judge always commits children; it can't say "I don't have enough to map this."
**Build:**
- **Schema** (`schema.ts`): add a node concept for a gap — either a new `kind:"gap"` or a `gap?: { kind: "intent"|"structure"|"reality"; question: string }` field. Add optional `confidence?: number` on Node.
- **Judge** (`judge.ts`): change the output contract so that for any node the model returns **EITHER** `{commit: children[]}` **OR** `{gap: {kind, question}}`. Add a heuristic: *"if the goal is ambiguous or a required fact is missing, do not invent children — emit a gap with the one question that would unblock the most."*
- **Interview loop** (CLI `grow-auto`, MCP): when gaps come back, surface the questions to the user; on answer, re-run decompose with the answer folded into context.
- **Render** (`apps/web` + a text renderer): draw gap nodes as frontier flags (distinct style) at the edge of the drawn map.
**Delivers:** interview (#2), partial map to the frontier (#3), and the never-draw-an-unsupported-path rule (#4) — the honesty guarantee. This is the single highest-leverage build and the differentiator.

### Phase 2 — Grounding objects (build #5)
**Gap:** a "testable step" is only prose today.
**Build:** promote the probe to a typed field on Node — `probe?: { test: string; metric?: string; threshold?: string; by?: date }` — and link `status` transitions to it (`running`→`passed` requires the probe met its threshold). The judge already writes probes as text (heuristic 0/4); now parse them into the object.
**Delivers:** "every step comes with how you'll know it worked" — makes TM a reasoning tool, not a mind-map.

### Phase 3 — Form follows meaning (build #7)
**Gap:** the 6 forms exist but a human picks them.
**Build:**
- **Judge** emits a recommended `layout` per (sub)tree based on the relationship shape (sequence→funnel/timeline, options×criteria→grid, hierarchy→tree, etc.); auto-apply on commit, keep manual override + `altFraming` as-is.
- **Add a text serializer** in `core`: board/subtree → **Mermaid** and **ASCII**. This gives CLI + portable + agent-callable diagram output (and is what "draw a diagram like you did in the file" literally needs).
**Delivers:** context-aware visualization + portable rendering.

### Phase 4 — Causal reasoning (build #6)
**Gap:** no root-cause capability.
**Build:** add edge type `cause` (currently only `decomposition|dependency`), and for `rootType:"cause"` boards add a why-chain mode in `judge.ts` that drills *down* a causal chain (5-whys) and tags nodes `symptom | mechanism | root`.
**Delivers:** "understand the cause and effect" — the one rootType that's declared but unimplemented.

---

## Non-goals (do NOT build)

- **Internal reasoning search / MCTS / self-consistency** — already solved *inside* the models (o3, R1). Reimplementing it is strictly worse. Let the judge LLM do the thinking; TM structures and grounds it.
- **Autonomous multi-agent debate infra** — productized as AutoGen/CrewAI/LangGraph. Borrow if needed for the "all lenses" pass; don't build.
- **A prettier web canvas as the headline** — a shipping competitor (Nodalist) already wins the canvas. TM's defensible edge is **MCP-native + cross-board memory + the honesty layer**, none of which are a canvas.

## Sequence at a glance

```
Phase 0  activate provenance        ░ tiny   → trust layer visible
Phase 1  gap-aware decompose        ███ big  → THE MOAT (interview + frontier + honesty)
Phase 2  grounding objects          ██ med   → testable steps
Phase 3  form-follows-meaning + txt ██ med   → context-aware + portable diagrams
Phase 4  causal / why-chains        ██ med   → root-cause capability
```

Phase 1 is the one that turns TM from "a decomposition tree builder" into "the honest map that knows what it doesn't know." Everything else compounds on it.

---

## Engineering principles for this build

Authority: the project's quality canon (priority resolver → correctness > polish; boring over clever; validate at boundaries; dependency direction; ports & adapters). These are the rules that keep the *new* code as clean as the seams already in `core`. What the existing code does right and must be preserved:

- **Core is pure; effects live at the boundary.** `core` never touches the clock, filesystem, or network — the LLM call is a port (`Judge`) with `claudeCliJudge` as the only adapter, and time is injected. **Rule:** the *decision* "should I ask a question / is this a gap?" is the judge LLM's; the *interview loop* (prompting the user, re-running) is IO and belongs in the CLI/MCP adapter, never in `core`. Same for the Mermaid/ASCII serializer: a pure `board → string` in `core`, called by every surface — one implementation, no duplication.

- **Treat the LLM as untrusted input — parse strictly at the boundary.** Extraction may be tolerant (strip fences, grep out the JSON), but the result must then pass a **strict zod schema** before it can mutate a board. A malformed or hallucinated proposal should fail loud, not commit silently (canon: "parse/validate data where it enters; trust it inside"). *(Shipped in PR #12: `parseReply` extracts, `parseJudgeResult` in `core` strict-validates.)*

- **Make illegal states unrepresentable — use a discriminated union for commit-or-gap.** Phase 1's output is *either* children *or* a gap — never both, never neither. Model it as a tagged union, not two optional fields:
  ```ts
  type JudgeResult =
    | { kind: "commit"; children: NodeProposal[] }
    | { kind: "gap"; gap: { kind: "intent" | "structure" | "reality"; question: string } }
  ```
  This is the clean-code core of the moat: the type system enforces the honesty rule (you *cannot* commit an unsupported path).

- **Every schema change is additive + versioned + migrated.** There are 74 live boards. New fields (`gap`, `probe`, `confidence`, the `cause` edge) are **optional**, the `version` bumps, and `migrate()` (`schema.ts`) handles old→new — exactly how `facets → description` was already folded. Never a breaking change to the on-disk format.

- **One concept, one home (no duplication).** The probe currently lives in *two* places — prose in `description` and the `status` enum. Phase 2 consolidates it into a single typed `probe` object as the source of truth; `status` *derives* from it (canon: "single source of truth; derive, don't duplicate"). Don't leave the prose copy as a shadow.

- **YAGNI, enforced by the data.** The corpus shows dead fields (`contentKind` 8 nodes, `rationale` 5) — schema added faster than it was used. **Rule for this build:** add a field *only* if (a) the judge auto-populates it and (b) something renders/consumes it. `gap` and `probe` pass; resist speculative fields. This is "evolvability over speculation" applied literally.

- **Keep logic out of the renderer.** Layout/diagram *selection* (form-follows-meaning) is a judgment → it belongs to the judge/`core`, emitted as data. The web app and the text serializer only *render* the chosen form. UI renders; it does not decide (canon: "logic out of UI").

## Definition of done (per the canon's gates)

- `tsc --noEmit` passes as a standalone check across all packages; **no `any`/`as` escapes**, no magic strings for the new enums (they're zod enums already — reuse them).
- **Tests with real systems, no mocks:** unit-test the pure `ops.ts`/serializer functions directly; test the judge **contract** with golden fixtures (recorded real LLM outputs → assert parse + strict-validate + commit); use `mkdtemp` board stores (the pattern already in the MCP tests), not mocked filesystems.
- The critical path runs end-to-end before "done": for Phase 1 that's *vague input → judge emits a gap → interview answers it → map extends* on a real board via the real CLI.
- Each phase ships behind its own small PR with its migration, matching the repo's existing one-feature-per-branch flow.
