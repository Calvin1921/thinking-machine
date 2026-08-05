# Evaluation — Proving Each Capability Works

TM's own rule is *every step is testable — a metric, a probe, a pass/fail, not vibes.* This doc applies that rule to the build. For each capability: the **expected behavior** (observable), the **eval set** (how you check), the **metric**, and the **pass bar**.

## The one principle that shapes all of it

The judge is an LLM, so its output is **a distribution, not a fixed value.** A single run is noise. So:

```
  DETERMINISTIC layer  (plumbing)          BEHAVIORAL layer  (judge quality)
  ──────────────────────────────          ─────────────────────────────────
  schema validates, migrate,              does the judge DO the right thing?
  commit writes right structure,          run a LABELED SET through the real
  probe→status, serializer output         LLM, k times each, score a PASS RATE
  ──────────────────────────────          ─────────────────────────────────
  cheap · runs every commit · CI          costs LLM calls · pre-release · gated
  golden fixtures (recorded outputs)      live eval harness → scorecard
```

Rule: **run each eval item k≥5 times and report the pass rate** (e.g. "gap detected in 5/5"). A capability "works" when its pass rate clears the bar, not when it passed once.

---

## Per-capability evaluation

### Phase 0 — Provenance auto-set
- **Expected:** every committed node carries `provenance`; factual→`drafted`, subjective→`informed-opinion`. Coverage jumps from ~2% to ~100%.
- **Eval:** deterministic — after `grow`, assert all new nodes have provenance set. Behavioral — a 20-node labeled set (known factual/subjective) checks classification.
- **Metric / bar:** coverage = **100%** (hard gate); contentKind accuracy **≥ 85%**.

### Phase 1 — Gap-aware decompose  (THE MOAT — the proof that matters most)
- **Expected behaviors:**
  1. Clear, complete input → **commits** (no false gap).
  2. Goal-ambiguous input → emits `gap.kind = "intent"` with a question that, if answered, disambiguates.
  3. Missing-fact input → emits `gap.kind = "reality"`.
  4. **Never fabricates children when the info isn't there** — the honesty rule.
- **Eval set:** **5 missing-intent + 5 missing-structure + 5 no-gap controls (15 items)**, extended with 5 missing-reality items = 20 labeled items, run k times each.
- **Metrics / bars:**
  | Metric | What it catches | Bar |
  |---|---|---|
  | **False-commit rate on gap items** | fabricating an unsupported path — the moat violation | **0%** (hard gate) |
  | False-gap rate on controls | crying "gap" when it's clear | ≤ 10% |
  | Gap-kind accuracy (intent/structure/reality) | naming the right missing thing | ≥ 80% |
  | Question usefulness ("if answered, could you now map it?") — judge- or human-scored | asking the *right* question | ≥ 80% |
- **The headline proof:** false-commit rate = 0. If TM ever draws a confident path over missing information, the moat is broken — this is the single number to defend.

### Phase 2 — Grounding objects (probe)
- **Expected:** decision-root exits produce a **typed probe** (`test` + `metric`/`threshold` + `by` date), not prose; `status` can't go `running→passed` unless the probe's threshold is met.
- **Eval:** deterministic — probe parse rate; status-transition guard rejects a pass with no met threshold. Behavioral — 15 decision roots, is each probe *cheap, real, numeric, dated*?
- **Metric / bar:** probe parse success **≥ 90%**; probe completeness (all four fields) **≥ 80%**; status guard **100%** deterministic.

### Phase 3 — Form-follows-meaning + serializer
- **Expected:** judge picks the layout matching content shape (sequence→funnel/timeline, options×criteria→grid, hierarchy→tree, cause→why-chain); serializer emits valid Mermaid/ASCII.
- **Eval:** deterministic — serializer output parses as valid Mermaid + golden snapshots; round-trips node/edge count. Behavioral — 20 labeled `(content → correct form)` pairs.
- **Metric / bar:** serializer validity **100%**; form-match accuracy **≥ 75%** (with manual override always available, so a miss is cheap).

### Phase 4 — Causal / why-chains
- **Expected:** a `cause`-root board drills *down* a why-chain, tags nodes `symptom | mechanism | root`, and terminates at a genuine root cause.
- **Eval:** 10 labeled root-cause scenarios (known true root). Does the chain reach it? Does it avoid labeling a symptom as the root?
- **Metric / bar:** root-cause hit rate **≥ 70%**; chain depth **≥ 3**; symptom-as-root errors **= 0** (hard gate).

---

## Two cross-cutting guarantees

- **End-to-end acceptance (the north-star success test):** a vague input yields exactly one of — a trustworthy map, the *one* right question, or a partial map + named gap — and always a clear testable next step, never a confident guess. Scripted through the real CLI on 5 held-out prompts; **must pass all 5.**
- **Migration safety (regression):** **every existing board still loads** after every schema change (run `loadBoard` over the whole store — 74 boards at time of writing). Hard gate — never break the on-disk format.

---

## How to run it (the harness)

1. **CI, every commit — deterministic only.** Unit-test pure `core` fns; validate against **golden fixtures** (recorded real judge outputs) so plumbing regressions are caught without paying for LLM calls. Fast, free, blocking.
2. **`tmind eval` (new) — pre-release, behavioral.** Runs each labeled set through the *real* judge k times, prints a scorecard (metric → rate → bar → pass/fail). Costs LLM calls; run before a release or after any prompt change (prompt edits are the highest-risk change — they silently move the whole distribution).
3. **Gate on the bars.** A release ships only if every hard gate = pass and every soft metric clears its bar. Track the scorecard over time — a prompt tweak that lifts gap-kind accuracy but raises false-commit rate is a *regression*, and only the numbers will tell you.

**Fixtures will live in `packages/core/eval/`** (labeled sets as JSON + recorded outputs), colocated with the engine they test. The labeled sets are themselves an asset — they encode what "good thinking" means for TM, and they're what stop a prompt change from quietly breaking the moat.
