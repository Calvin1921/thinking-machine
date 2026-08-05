# Thinking Machine — North Star

## The one sentence

**Thinking Machine takes a vague goal, borrows the expertise you're missing to reveal the paths you can't see, and draws you an honest map — as far as your information allows — that lights the next testable step and names exactly what's blocking the rest.**

---

## The problem it solves

You start with a fuzzy thought — *"something's off with my architecture," "this UI feels wrong," "I want to build this business."* It's real but vague. Between where you are and where you want to be is a middle you can't see clearly. There are many possible paths across it, but you can only see one or two — because seeing the rest needs knowledge or experience you don't have yet. So you inch forward blindly, hoping it's the right direction.

```
   YOU ARE HERE ────────── the problem space ────────────► THE GOAL
   (current state)      (the unknown middle)          (where you want to be)

        │          ?    ?    ?    ?    ?                      │
        │       many possible paths, most invisible to you    │
        └──► a torch lights the NEXT testable step ──► ──► ──►┘
                 (one grounded milestone at a time)
```

TM turns *"I don't know how to get there"* into *"here is the next thing to do, and here's how I'll know it worked."*

---

## How it works: draw only as far as the information allows

A map that fakes the whole route when half is guesswork is worse than no map — it walks you confidently the wrong way. So TM first asks **"How much of this can I actually know right now?"** and draws honestly to that edge.

```
                    ┌─────────────────────────────────┐
   your vague  ───► │  Do I have enough to map this?   │
   input            └─────────────────────────────────┘
                          │            │            │
              ENOUGH ◄────┘     GAPS   │   NOT ENOUGH, and
                                 I can  │   asking won't fix it yet
                                 ask ◄──┘            └────────┐
                          │                                   │
                          ▼                                   ▼
   ┌───────────┐   ┌──────────────┐            ┌──────────────────────────┐
   │ FULL MAP  │   │  INTERVIEW   │            │   PARTIAL MAP             │
   │ start→end │   │  ask sharp   │            │  draw to the frontier     │
   │ all paths │   │  Qs, then    │            │  + flag the missing       │
   │           │   │  map         │            │  pieces blocking the rest │
   └───────────┘   └──────────────┘            └──────────────────────────┘
```

1. **Enough info → full map.** The whole terrain: start to goal, all the paths.
2. **Fixable gaps → interview first.** TM notices what's missing, asks a few sharp questions, *then* maps.
3. **Still not enough → partial map + named gaps.** Draw to the **frontier** — the edge of what's currently knowable — and plant flags saying exactly what's missing: *"I can get you this far. To see past here, you need X."*

The three are the same product at different information levels. Lots of info → it reads like a **map**. Little info → it reads like a **torch** (one lit step + fog). One honest map that shows exactly as much as it can, and no more.

---

## The three non-negotiable rules

1. **Never draw a path you can't support.** Where TM can't, it draws a **gap marker** instead. The missing pieces aren't a failure of the map — they *are* its most valuable output. (This is the moat: *gap-awareness — know what's missing.*)

2. **Every step is testable.** Each milestone comes with *"and here's how you'll know you're actually closer"* — a metric, a probe, a pass/fail. Grounding, not vibes. This is what makes TM a reasoning tool and not a mind-map.

3. **Progress = the frontier moving forward.** A map is never simply "done." A named gap is the next step: answer it (interview), test it (grounding), or go learn it. Then the fog recedes and TM redraws a little further.

---

## Capability: draw it in the form that's easiest to understand

The diagram is not decoration — **choosing the right visual form is itself a thinking move.** TM reads the *shape of the relationship* in the content, then draws it in the visual grammar that fits, so understanding is instant, not decoded.

> **Form follows meaning.** A decision drawn as a flowchart confuses; drawn as an options×criteria grid it's obvious. A root cause drawn as a tree hides the chain; drawn as a why-chain it's clear.

| When the content is about… | Relationship | Draw it as… |
|---|---|---|
| process, roadmap, start→goal | sequence / journey | a path / flow |
| "what are the parts of X" | hierarchy | a tree |
| "why did this happen" | cause → effect | a why-chain / fishbone |
| choosing between options | options × criteria | a scoring matrix |
| narrowing stage to stage | funnel | a pipeline |
| A vs B, is / is not | contrast | a comparison table |
| where two things overlap | intersection | a Venn / collision |
| states and transitions | decision logic | a branch diagram |

Two layers, kept separate: the **board structure** is the durable source of truth (the node graph of the reasoning); a **rendering** is a view *projected* from it on demand into whichever form communicates best. Output is text-based (**Mermaid + ASCII**) — LLM-generatable, portable, renders in both canvas and CLI. The honesty rule still holds: **never draw a shape the content doesn't actually support.**

---

## What it is, and what it is not

| It IS | It is NOT |
|---|---|
| A thinking partner that reveals paths you can't see | A chatbot that answers *for* you |
| An honest map drawn to the frontier | A confident full route built on guesses |
| Grounded — every step is checkable | A pretty diagram that only *feels* like progress |
| Domain-aware — injects the expertise you lack | A blank canvas you fill in yourself |
| Gap-first — names the blind spots | A yes-machine that agrees and elaborates |

**Works across any problem where the middle is unclear:** diagnosing a system design, reviewing a UI/UX, planning a project or business, untangling a decision — and not limited to these.

---

## The test of success

> A user brings a vague goal. TM either draws a trustworthy map, or asks the one question they couldn't see they needed to answer, or says *"here's how far I can take you, and here's the exact unknown standing in your way."* In every case they leave with a clear, testable next step — and never with a confident line that turns out to be a guess.
