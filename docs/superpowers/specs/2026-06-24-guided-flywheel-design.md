# Guided Flywheel + Verified Content — Design

> Status: design approved in brainstorming (2026-06-24). Captures the *guided* layer on top
> of the existing decompose/facet/DAG engine. Grounded in the current schema/verbs in
> `packages/core` and `packages/cli`. Companion to `docs/REPRESENTATION.md` (which governs
> *layout*); this doc governs *motion + content provenance*.

## 1. Purpose

Let someone view a topic **holistically** and **offload the cognitive load** of holding its
structure in their head — so they end with clear direction, ranked priorities, and fewer
distractions to move forward. The target user is a **non-expert who doesn't yet know what to
ask** (e.g. "I want a fancy website" → doesn't know to specify typography, motion, art
direction). The system plays the expert that guides them through, disclosing what's relevant
just-in-time instead of requiring years of prior knowledge.

This is the **Guide** posture (opinionated, options-at-each-node) layered on TM's existing
**Explore** posture (free decomposition). Same board, same engine — a verb layer on top.

## 2. The model (what we agreed)

```
   PURPOSE   holistic view + offload cognition → clarity, priority, focus
   MOTION    flywheel: Frame → Decompose → Analyze → Prioritize → Advance, recursing
   SHAPE     widen (map territory, cheap) ⟂ deepen (gain expertise, on a chosen center)
   INTEGRITY same label twice → force [link / rename / make-facet] → DAG, never dupe
   CONTENT   hybrid: LLM draft → verify vs sources → cache → corpus compounds into a KB
```

### 2.1 The flywheel (motion)

Each node is a "center." One turn of the wheel:

```
   1. FRAME      what is it / why care   →  node + `definition` facet
   2. DECOMPOSE  break into primitives   →  child nodes (DAG)        [exists: decompose]
   3. ANALYZE    lenses on the node      →  facets                   [exists: facet]
   4. PRIORITIZE what matters / ignore   →  status + collapse        [exists: status]
   5. ADVANCE    pick next center        →  promote / select → recurse [exists: promote]
   STOP          an ATOM you can act on  →  leaf node                [exists: kind:"atom"]
```

It is a *flywheel*, not a loop: each turn externalizes structure onto the board, freeing
working memory (~4 chunks, Cowan 2001 — per `REPRESENTATION.md`), so the next turn starts from
less fog. Momentum = shrinking unknowns.

### 2.2 Widen vs Deepen (the two moves)

Not two modes — two **moves** available on every node. Priority decides which.

```
   WIDEN  (horizontal)   enumerate peers, 1 level, shallow   →  "what am I missing?"
                         = the holistic map. CHEAP.
   DEEPEN (vertical)     drill ONE center toward atoms        →  "how do I do this?"
                         = expertise on a spine. COSTLY (triggers verification, §2.4).
```

**Default behavior:** open WIDE and shallow (2–3 layers) for the overview → user STEERS by
picking one center → DEEPEN on that center, collapsing siblings → POP back, pick next. The
shape drawn is a "T": wide once to map, deep on the center that matters. Vertical-first is
disallowed by default (you'd optimize a corner of an unmapped territory; also `REPRESENTATION.md`
P0-2: don't expand everything).

### 2.3 Integrity — duplicate resolution (the key interaction)

When a decompose/grow proposes a label that **already exists on the board**, the machine must
never silently place a duplicate. It forces a choice:

```
   "Design" already exists. Is this:
     [ Same → link it (DAG cross-edge) ]   [ Different → rename ]   [ Concern → facet ]
```

- **Same** → one node, multiple incoming labeled edges (TM is a DAG, not a tree). No dupe.
- **Different** → rename to disambiguate (`Visual Design` vs `Product Design System`).
- **Concern** → it's a cross-cutting quality (Design, Security, Perf, A11y) that applies to
  *many* nodes → represent as a facet/aspect, not a tree child. This honors
  `REPRESENTATION.md`'s containment-vs-connection rule (Ziemkiewicz & Kosara): enclosure for
  "is part of", edges for "relates to" — don't blur them.

Every time this fires the user learns something true about the topic. It's a feature.

### 2.4 Content provenance — Option C (hybrid verified + cached)

The promise "guide a beginner through *anything*, with trustworthy options" rules out pure
live-LLM (unvetted — a beginner can't tell confident-wrong from right) and pure curated-KB
(can't cover "anything"). Chosen path **C**:

```
   on DEEPEN(node):
     1. DRAFT     Claude proposes children + facet options (covers anything)
     2. VERIFY    retrieve sources + LLM-judge: real? current? ranked right?
                  (reuses deep-research / decide / LLM-judge machinery)
     3. CACHE     store the verified subtree in a library keyed by topic
     4. RENDER    commit to board (decompose proposal + facets)

   WIDEN(node): DRAFT only, fast & unverified — it's just the map/overview.
                Verification is paid only when the user commits to DEEPEN.
```

**Why C compounds:** the verified cache *becomes* a curated KB over time without hand-authoring
— first visitor pays generation+verification, every later visit is served instantly from the
library. Same flywheel shape, one level up (the corpus itself gains momentum). Honest cost:
first deepen on a node is slow and burns tokens; mitigated by cheap-WIDEN / expensive-DEEPEN
split. Verified options carry a **"pick this if X"** rationale, not a flat list.

## 3. Architecture — deltas on the existing engine

Existing (keep): `BoardSchema` (nodes/edges/sections), node `kind` root/branch/atom, `status`,
`facets` record, edge `type` decomposition/dependency + `label` verb, ops `decompose`
(commit proposal: children+edges+facets), `grow`, `promote`, `setFacet`, `linkNodes`,
`setNodeStatus`. CLI `tm` verbs of the same names.

```
  board.json ── single source of truth (unchanged shape; additive fields only)
   ▲
 core ── add: duplicate-detection on commit, provenance fields, cache store
   ▲          ▲             ▲
  CLI         MCP           Web sidecar (SSE canvas)
   │           │             └─ render: widen-shallow default, deepen-on-select,
   │           │                duplicate-resolution prompt, provenance badge
  skill `thinking-machine` ── add: the flywheel method + widen/deepen + Guide posture
```

### 3.1 Schema additions (additive, back-compat via existing migration in `schema.ts`)

- `Node.provenance?`: `"drafted" | "verified" | "curated"` — drives a canvas badge so the user
  can see which content is vetted (a trust signal; directly serves the beginner-safety goal).
- `Node.sources?`: `string[]` — citations attached to verified content.
- `Node.rationale?` / facet item rationale — the "pick this if X". (v1 may inline into the
  facet string; a structured field is a later refinement — flagged, not built now.)
- Cache/library: a `library/` of verified subtrees keyed by a normalized topic slug, separate
  from any single `board.json`. Read on DEEPEN before drafting.

### 3.2 New ops / verbs

- `widen <id>` — shallow breadth (draft-only, unverified). May be `decompose` with a
  `--shallow/--no-verify` flag rather than a new verb (decide in plan).
- `deepen <id>` — drill one center: cache-lookup → draft → verify → commit. The costly path.
- duplicate-resolution: `commitProposal` gains collision detection against existing node
  labels and returns conflicts for the caller (CLI/MCP/skill) to resolve via
  `[link | rename | facet]` instead of blindly adding nodes.

### 3.3 Skill changes

`skill/thinking-machine/SKILL.md` teaches the **Guide** method: open WIDE shallow → present the
territory → user picks a center → DEEPEN (draft→verify→cache) → resolve any duplicate →
prioritize (status) → advance. Encodes the "vibes → specifiable decisions" reframe and the
"pick this if X" option style demonstrated in the website test.

## 4. States (per quality standard — every surface gets empty/loading/error)

- **WIDEN/DEEPEN loading** — node shows a working indicator; canvas not blocked (verification
  is async; SSE streams children in as they commit).
- **Verification failed / sources thin** — node renders as `drafted` (badge = "unverified"),
  never silently presented as fact. Explicit, honest.
- **Cache empty (first visit)** — falls through to draft→verify; user told first deepen is slower.
- **Duplicate detected** — the `[link / rename / facet]` prompt is the resolution UI, not an error.
- **Atom reached** — node marked leaf; no widen/deepen offered, only act.

## 5. Scope / decomposition (this is several subsystems — build in order)

This spec defines the whole model but is **too large for one implementation plan**. Sequence:

1. **Phase 1 — Guided motion + widen/deepen + duplicate-resolution** (on existing core; no
   verification yet, DRAFT-only). Ships the holistic-map + steer + recurse experience and the
   integrity prompt. Smallest end-to-end slice that delivers the cognitive-offload value.
2. **Phase 2 — Option C verification + cache/library** (the trust + compounding layer). Heaviest;
   reuses deep-research/judge machinery. Depends on Phase 1's deepen hook.
3. **Phase 3 — Provenance UI + "pick this if X" rationale rendering + library reuse across boards.**

Phase 1 is the subject of the first implementation plan.

## 6. Open questions (resolve during Phase 1 planning)

- `widen` as a new verb vs a `--shallow` flag on `decompose`.
- Where rationale lives in v1 (inline facet string vs structured field).
- Library key normalization (how aggressively to dedupe "Hosting" vs "Web Hosting").
- Verification depth budget (how many sources / judge passes before marking `verified`).
