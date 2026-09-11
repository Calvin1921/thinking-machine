# DESIGN.md — "Wayfinder"

The frozen design ruler for the Thinking Machine canvas. Derived by decomposing the design
space on the tool itself (board: `tmind__ui-design-language-options`). One axis, one signature,
one accent.

## What the tool is (the prior that drives every choice)

A **read, contribute, and steer** tool for a person and their AI agents. Both can add
structure and reasoning to the same saved board. The canvas prioritizes comprehension
of dense trees, with an explicit composer for the person’s own ideas and a details panel
for reasoning, trade-offs, open questions, and outcomes.

## Signature move — Focus-dive

Click (double-click) any node → it becomes the canvas root; a **breadcrumb** shows the path
back; `Esc` pops up one level. The canvas always answers *"where am I in my thinking."*
Workflowy's zoom-into-a-bullet, on a 2D canvas Claude grows. Everything else serves this.

## The node — a poster card (the reading atom)

```
  ┌────────────────────────────┐
  │  LABEL  (Space Grotesk 700) │   ← the headline
  │  description body (Inter)   │   ← what it means / the thinking it holds
  │  ● verified                 │   ← trust dot, read without clicking
  └────────────────────────────┘
```
- Filled card (subtle top-lit gradient), 1px border, 12px radius. Bold label, body below.
- Selected / current-dive-root → **cyan** border. Root node → violet border.
- ~190px wide; body wraps; trust dot bottom-left.

## Type
- **Space Grotesk** (500/700) — labels, titles, section headers. Cold, geometric, poster.
- **Inter** (400/500) — descriptions, metadata, UI. Dense legibility at small sizes.

## Color (cold base · ONE accent · trust palette)
```
  --bg      #070b11   page (near-black, cold)
  --panel   #10161f   card / surface
  --line    #1d2735   borders / hierarchy lines
  --ink     #e6edf3   primary text
  --mut     #8499b3   body / secondary
  --cyan    #22d3ee   THE accent — reserved for: selection, current dive-root, focus
  --violet  #a78bfa   root node only
  trust:    verified #34d399 · refuted #ff6b6b · drafted (muted) · stale #f5a623 · informed #6aa3ff
```
Accent is rationed: if everything is cyan, nothing is. Trust colors live on the card and never
compete with the accent.

## Hierarchy lines
Orthogonal elbows. **Decomposition = solid**; **dependency = dashed + labeled verb**. Lines are
`--line`, quiet; the cards carry the attention.

## Navigation & motion
- Focus-dive with smooth re-root + breadcrumb (the signature).
- Collapse/expand to manage density; **Tidy** to auto-arrange; pan/zoom.
- **Keyboard access**: labelled form controls and view controls; Escape moves up a focus level. Full keyboard-only graph exploration remains incomplete.
- Motion is fast and structural (≤150ms), never decorative. Latency on expand/dive is a bug.

## Anti-slop gates (hold these)
- No wall-of-boxes — density stays legible via type, spacing, collapse, focus.
- Keep the map usable while editing: inline editing remains available; the details panel occupies its own column. On narrow screens the panel replaces the map temporarily and Close returns to it.
- No expand/focus latency — every structural action is instant.
- No decoration-as-design — the signature done well beats ornament.

## Out of scope (later)
The richer Adaptive-Lens presets (network/concentric/pyramid/flow), Claude-in-canvas
"expand with AI". Metadata (status/image/verification) still uses the drawer for now — the
"light popover" replacement is a later slice.

## Shipped since freeze
- **Inline label/description editing on the card** — select a node, then click its title or
  body to edit in place (Enter/blur commits, Esc cancels). Honours the "editing is inline"
  anti-slop gate. Metadata still in the drawer.
- **Orthogonal hierarchy elbows in quiet `--line`** — decomposition edges no longer use the
  cyan accent (it stays rationed for selection/dive-root).

## Human contribution pass — 2026-09-11

- Persistent, labelled “Add under / Your thought / Add thought” composer. The parent is explicit and can be the whole board or a selected concept; additions remain expandable.
- Details use one explicit save, with conflict detection for changed fields and draft preservation while agent updates arrive. A saved outcome does not automatically close a question or mark a test as passed.
- Header, canvas and composer have separate layout space. Zoom/fit controls use one neutral treatment; the relationship legend is explained in “How to use.” React Flow credit remains legible but quiet.
- No remote font request: use available named faces with system fallbacks, consistent with the previously rendered local app (its CSP blocked Google Fonts).
- Recordings are deferred and will be made one project at a time with OpenScreen.
