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
   ENTRY     fog (no question yet): Locate → signals → candidate questions → pick → center
   PURPOSE   holistic view + offload cognition → clarity, priority, focus
   MOTION    flywheel: Locate → Frame → Decompose → Analyze → Prioritize → Advance, recursing
   SHAPE     widen (map territory, cheap) ⟂ deepen (gain expertise, on a chosen center)
   INTEGRITY same label twice → force [link / rename / make-facet] → DAG, never dupe
   CONTENT   hybrid C′: factual → verify vs sources; subjective → SHOW THE TRADEOFF (competing
             takes), not a single verdict. Verify is ASYNC + non-blocking; TTL + re-verify.
   DIVISION  machine does the OBJECTIVE work; human supplies the SUBJECTIVE judgment. Fake
             neither (§2.5). This is the root principle — it resolves the fog & trust cracks.
```

### 2.0 Locate (the fog entry — front-end of the flywheel)

The flywheel below starts at a *center*. But often the user has no question — only fog
("review this", "something's off", "I don't know what to ask"). Without a front-end the
machine has nowhere to begin. **Locate** converts fog into a sharp center before FRAME runs:

```
   FOG → 1. LOCATE SIGNALS   where does it itch? (don't name the problem yet)
         2. QUESTION BURST   turn each itch into a candidate question (cheap, many)
         3. SELECT  by CHARGE (how much it matters) × TRACTABILITY (answerable now)
         → ONE sharp question becomes the center → enter FRAME
```

Iron rule (from the `/unfog` method): converge to **one** center, never hand back a menu or
"go reflect". If signals are too thin to select, the next move is a probe, not more reflection.
Locate runs DRAFT-only (no verification — it's orientation, not answers).

**Locate is interactive, not auto-run** (§2.5): the machine cannot read the user's unease, so it
*proposes* candidate signals/questions and the **user reacts** — picks which itches, owns the
CHARGE rating (how much each matters to them). The machine owns TRACTABILITY and the structure;
the human owns which one matters. Auto-selecting the center would be the machine faking a
subjective judgment it doesn't have access to.

### 2.1 The flywheel (motion)

Each node is a "center." One turn of the wheel:

```
   0. LOCATE     fog → sharp center      →  (only when no question exists; §2.0)
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

### 2.4 Content provenance — Option C′ (hybrid, taste-aware, non-blocking)

The promise "guide a beginner through *anything*, with trustworthy options" rules out pure
live-LLM (unvetted — a beginner can't tell confident-wrong from right) and pure curated-KB
(can't cover "anything"). We chose hybrid C, then a review (2026-06-24) found four defects that
forced the **C′** amendment. The original C and the defects:

> **C (original):** on DEEPEN → DRAFT → VERIFY vs sources → CACHE → RENDER; cache "compounds
> into a KB". **Defects found:** (1) "verify vs sources" is meaningless for *taste/judgment*
> topics (typography, art direction) — the judge is just another LLM opinion wearing a
> `verified` badge; (2) cached `verified` content **rots** into trusted-wrong, the worst
> failure mode for a beginner; (3) "compounds into a KB" assumes *many visitors* — for a
> **solo** tool you are usually the only visitor, so you pay first-visit cost forever with
> little compounding payoff; (4) blocking verification latency **kills the flywheel's
> momentum**, which is the actual product.

**C′ — the amended rule.** Split content by *kind*, verify only what's verifiable, and never
let verification block flow:

```
   on DEEPEN(node):
     1. CLASSIFY   is this node FACTUAL (checkable) or SUBJECTIVE (taste/judgment)?
     2. DRAFT      Claude proposes children + options + "pick this if X" rationale
     3. RENDER     commit to board IMMEDIATELY as `drafted` — flow never blocks
     4. VERIFY     ASYNC, in the background:
                     FACTUAL    → retrieve sources + judge → upgrade to `verified` (+sources)
                     SUBJECTIVE → label `informed-opinion` (NOT "verified"); skip fake-verify
     5. CACHE      store with a `verifiedAt` timestamp + TTL; serve from cache on revisit,
                   but re-verify (or mark `stale`) once past TTL
```

**What changed vs C, and why:**

- **Factual vs subjective split** (defect 1): only checkable claims earn `verified`. For
  *subjective* nodes a single "informed-opinion" verdict still reads as authority to a beginner,
  so the substantive fix is to **show the tradeoff** — 2–3 competing credible takes with "pick
  this if X" — making the judgment-call nature visible. The user (not the badge) decides.
- **TTL + re-verify** (defect 2): `verifiedAt` + a TTL turns silent rot into an explicit
  `stale` state. Trusted-wrong becomes visibly-aging.
- **Async, render-first** (defect 4): the board commits `drafted` instantly and verification
  *annotates/confirms* as it returns (SSE) — it must **not silently rewrite** content the user
  has already read or acted on (that would be a new trust break). A material correction surfaces
  as a visible diff/flag ("this changed since you saw it"), never a silent swap.
- **TTL is per-claim volatility, not per-kind** (defect 2, refined): "what is HTTP" never goes
  stale; "current pricing" does in weeks. TTL is keyed to a volatility hint on the claim, not a
  blanket per-`contentKind` value.
- **Compounding is a bonus, not the thesis** (defect 3): the cache still helps on *revisits*
  and shared/recurring topics, but for a solo tool the primary win is the non-blocking draft +
  honest provenance, not corpus growth. We no longer claim C′ "becomes a curated KB for free".

Net: WIDEN stays DRAFT-only (orientation). DEEPEN renders instantly as `drafted`, then
self-upgrades to `verified` / `informed-opinion` / `stale` in the background, never silently
overwriting what the user already consumed.

### 2.5 Cross-cutting principle — machine=objective, human=subjective, fake neither

Two review rounds surfaced the same root cause: **the machine has no access to the user's
internal state** (taste, unease, what matters to them). Every trust/fog crack came from the
machine *guessing* a subjective judgment instead of *eliciting* it. The governing principle:

```
   MACHINE owns the OBJECTIVE / structural work        HUMAN owns the SUBJECTIVE judgment
   ────────────────────────────────────────────       ──────────────────────────────────
   decompose · retrieve · fact-check · lay out         which signal itches (charge)
   detect duplicates · classify · propose options      which option fits ME
   show competing takes + "pick this if X"             is this taste / direction right
                                                        when to stop / what to act on
   ── never fake a fact ──                             ── never fake a preference ──
```

Consequences already wired into the spec: LOCATE is interactive (§2.0); subjective DEEPEN shows
tradeoffs not verdicts (§2.4); duplicate-resolution asks the user link/rename/facet (§2.3);
PRIORITIZE/status is the user's call. The machine's job is to make the subjective junctures
*cheap to decide*, not to decide them.

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

- `Node.provenance?`: `"drafted" | "verified" | "informed-opinion" | "stale"` — drives a canvas
  badge so the user sees the trust level (beginner-safety goal). `verified` is reserved for
  *factual* content that passed source-check; *subjective* content tops out at
  `informed-opinion` (never fake-`verified`); past-TTL content downgrades to `stale`.
- `Node.contentKind?`: `"factual" | "subjective"` — set by the CLASSIFY step; decides whether
  background verification runs at all.
- `Node.verifiedAt?`: ISO timestamp; with a per-`contentKind` TTL drives the `stale` downgrade.
- `Node.sources?`: `string[]` — citations attached to `verified` content.
- `Node.rationale?` / facet item rationale — the "pick this if X". (v1 may inline into the
  facet string; a structured field is a later refinement — flagged, not built now.)
- Cache/library: a `library/` of subtrees keyed by a normalized topic slug, separate from any
  single `board.json`. Read on DEEPEN before drafting; entries past TTL trigger re-verify.

### 3.2 New ops / verbs

- `locate <fog...>` — fog entry (§2.0): signals → candidate questions → pick → seed a center.
  DRAFT-only. May live in the skill rather than core in v1 (decide in plan).
- `widen <id>` — shallow breadth (draft-only). May be `decompose` with a `--shallow` flag
  rather than a new verb (decide in plan).
- `deepen <id>` — drill one center: cache-lookup → CLASSIFY → draft → render `drafted` now →
  background verify → upgrade provenance in place. Verification is async + optional.
- `verify <id>` — explicit (re)verification trigger for a node (also fired by TTL/`stale`).
- duplicate-resolution: `commitProposal` gains collision detection against existing node
  labels and returns conflicts for the caller (CLI/MCP/skill) to resolve via
  `[link | rename | facet]` instead of blindly adding nodes.

### 3.3 Skill changes

`skill/thinking-machine/SKILL.md` teaches the **Guide** method: (fog?) LOCATE → open WIDE
shallow → present the territory → user picks a center → DEEPEN (classify → draft → render →
async verify) → resolve any duplicate → prioritize (status) → advance. Encodes the "vibes →
specifiable decisions" reframe and the "pick this if X" option style from the website test.

## 4. States (per quality standard — every surface gets empty/loading/error)

- **Fog / empty input** — LOCATE runs; if signals too thin to pick one center, surface a probe,
  never a menu or "go reflect" (Iron rule, §2.0).
- **DEEPEN in progress** — content renders `drafted` immediately; a quiet "verifying…" badge
  upgrades in place via SSE. Canvas never blocks on verification.
- **Verification failed / sources thin** — node stays `drafted` (badge = "unverified"), never
  silently presented as fact.
- **Subjective content** — labeled `informed-opinion`, not `verified`. Honest about what it is.
- **Stale (past TTL)** — badge downgrades to `stale`; a `verify` re-run refreshes it. Prevents
  trusted-wrong (defect 2).
- **Cache hit** — served instantly from `library/`; if past TTL, served but flagged `stale` +
  re-verify queued.
- **Duplicate detected** — the `[link / rename / facet]` prompt is the resolution UI, not an error.
- **Atom reached** — node marked leaf; no widen/deepen offered, only act.

## 5. Scope / decomposition (this is several subsystems — build in order)

This spec defines the whole model but is **too large for one implementation plan**. Sequence:

1. **Phase 1 — LOCATE + guided motion + widen/deepen + duplicate-resolution** (on existing core;
   DRAFT-only, no verification). Ships fog-entry + holistic-map + steer + recurse + the integrity
   prompt. Smallest end-to-end slice that delivers the cognitive-offload value. Provenance field
   exists and renders, but everything is `drafted` until Phase 2.
2. **Phase 2 — C′ verification: classify + async source-check + TTL/stale + cache** (the trust
   layer). Reuses deep-research/judge machinery. Render-first / non-blocking; depends on Phase 1's
   deepen hook. Note: compounding is a bonus here, not the justification (solo-user economics).
3. **Phase 3 — Provenance UI polish + "pick this if X" rationale rendering + cross-board library
   reuse.**

Phase 1 is the subject of the first implementation plan.

## 6. Open questions (resolve during Phase 1 planning)

- `widen`/`locate` as new verbs vs flags/skill-only behavior.
- Where rationale lives in v1 (inline facet string vs structured field).
- Library key normalization (how aggressively to dedupe "Hosting" vs "Web Hosting") — and how
  to handle **context-dependence** (Hosting for a static blog vs a video platform differ; a
  single cached subtree may not serve both).
- TTL values per `contentKind`, and verification depth budget (sources / judge passes) before
  marking `verified`.
- CLASSIFY heuristic: how reliably can factual-vs-subjective be auto-detected? Working answer:
  classify **per option/claim, not per node** — a mixed "hosting" node verifies its factual
  options and shows its taste options as a tradeoff. Open: cost/latency of per-claim classify.
- Render-first correction UX: how to surface "this changed since you saw it" without nagging
  (diff badge vs inline marker vs change log).
