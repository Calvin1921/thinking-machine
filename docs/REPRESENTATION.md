# Representation Principles — why each layout exists

> Source of truth for *what each graph type is for*, grounded in graph-perception research
> and best-in-class product patterns. Every layout must answer one question the human brain
> is bad at holding internally. If a layout's spatial encoding doesn't answer its question,
> it's decoration.
>
> Researched 2026-06-11 (cognitive-science lit + Heptabase/TheBrain/Obsidian/Miro/tldraw/
> Napkin/CB Insights/MAD-landscape survey). Key citations at bottom.

## The core value of the canvas

A board is **externalized cognition**: working memory holds ~4 unfamiliar chunks (Cowan 2001,
not Miller's 7±2), so the canvas's job is to hold the structure the head can't. Three laws
follow from the evidence and override everything else:

1. **Position is sacred.** Position-on-a-common-scale is the most accurately read visual
   channel (Cleveland & McGill 1984) and the substrate of spatial memory (Data Mountain 1998;
   Scarr et al.). Spend position on the layout's core semantic. Never silently reflow —
   re-layout is an explicit, animated event.
2. **A labeled link is a proposition; an unlabeled link is almost nothing.** The measured
   active ingredient of concept maps is the labeled edge ("A —*blocks*→ B") that forces
   relational encoding (Nesbit & Adesope 2006 meta-analysis, n=5,818).
3. **Above ~50–100 visible nodes, nobody reads edges** (Yoghourdjian 2021, EEG-verified;
   Ghoniem 2004). They read regions, density, and color. At scale the units of comprehension
   are labeled containers, not nodes — which is why every professional market map is a
   logo-grid in labeled boxes, never a node-link graph.

## Layout = question. One per layout.

| Layout | The question it answers | Perceptual mechanism | Evidence-backed limits | Breaks when |
|---|---|---|---|---|
| **Tree** | "What is this made of? What's under X?" | Connectedness (strongest Gestalt cue) + depth-as-position | 3–5 novel siblings; 3–4 visible levels; beyond that, collapse (SpaceTree) | cross-links styled like hierarchy edges; >7 expanded siblings; edge crossings on the traced path |
| **Funnel** | "What survived, and where did each option die?" | Continuity + reading order; taper = preattentive gist of attrition | ≤6 stages; genuinely linear processes only | width treated as readable quantity (area is the worst channel — labels carry the data, the taper is only narrative); branching processes |
| **Grid** | "How do these compare, cell by cell?" | Alignment = common-scale judgment (the #1 most accurate); proximity for rows/cols | dozens of cells fine **if axes are semantic**; ~4 items per cell | rows/columns that don't mean anything — accidental alignment implies comparability and therefore lies |
| **Timeline** | "What order? What overlaps when?" | Position on a common axis, mapped to reading direction (Tversky) | scales until labels collide → then swimlanes | distorted/implicit time axis; mixing ordinal sequence with metric time; unrelated items in one lane |
| **Radial** | "What's the gist of this ecosystem — which sector, how much activity, who's central?" | Sector enclosure (common region) + center-periphery as importance + symmetry | **gist only, never topology.** Radial is the *worst* tree layout for ancestry tasks (Burch 2011); >100 nodes = give up reading paths | promising edge-reading at scale; equal visual weight on 350 nodes; meaningless radius (see rule below) |

**The radial rule** (from ThoughtWorks Radar / sunburst / market-map analysis): a radial form
earns its shape only if you can name what **radius** means and what **angle** means
(e.g., radius = maturity/status, angle = category sector). If the answer is "where the
algorithm put it," a labeled-box grid beats the wheel for comprehension — CB Insights, MAD,
a16z, Sequoia all publish boxes/stacks, never radial node-link. The wheel's defensible value
is *orientation + sector membership + wow*; design it for that, not for reading.

**Containment vs connection** (Ziemkiewicz & Kosara 2008): enclosure (sections) for
"is part of"; edges for "relates to". Don't blur them.

## The scale stack (Shneiderman: overview → zoom & filter → details on demand)

What every surviving tool at 300+ nodes does, in order:

1. **Overview** — constant-screen-size region labels (Figma sections, Miro frames), so
   zoomed-out is a readable *map of named regions*, not confetti. LOD strips decoration
   (previews, facet dots, shadows, edge detail) below a zoom threshold — never titles.
2. **Zoom & filter** — default-collapsed beyond depth ~2 (markmap `initialExpandLevel`);
   expand along the focus path, collapse siblings (Furnas DOI). Local/ego view for huge
   graphs (TheBrain plex: O(degree) on screen at 620k nodes; Obsidian local graph).
3. **Details on demand** — card = title + one visual key (status color / logo) + 1-line
   preview; everything else in the drawer. (Already TM's model — keep.)
4. **Position anchors** — search-that-flies-the-camera, minimap (with edges hidden —
   tldraw's `hideInMinimap` insight), deep links to sections. Prevents "desert fog".

## Card grammar (graspable in 5 seconds)

One bolded title → one preattentive key (status hue OR logo, never a conjunction of two) →
1–2 line preview → click for drawer. One preattentive channel per board for "what matters";
status color is that channel. Don't add a second hue-coded dimension.

## Form follows meaning (the tm/LLM layer)

Napkin's architecture: a *closed taxonomy* of structures + a dedicated layout-selection
step + a human picking from a slate. TM's equivalent: `tm grow` should classify the idea's
*relationship type* and propose the layout — sequence→timeline, elimination→funnel,
comparison→grid, part-whole→tree, ecosystem-membership→radial/sections — with the human
confirming. AI picks content; the layout engine stays deterministic.

## Gap analysis → roadmap (as of 2026-06-11)

What TM already gets right: deterministic layouts (spatial memory ✓), height-aware
no-overlap packing, collapse/expand + collapse-all, detail-on-demand drawer, status as the
single preattentive channel, sections with per-section layouts, dashed-vs-solid edge types.

| # | Gap | Evidence | Fix |
|---|---|---|---|
| P0-1 | **No edge labels** (schema has no field; nothing rendered) | Nesbit & Adesope: the labeled link is the active ingredient | add `label?` to Edge schema; render at zoom ≥ threshold; `tm link` accepts a verb |
| P0-2 | **Everything expanded by default** at any size | Cowan ~4; SpaceTree; markmap initialExpandLevel | boards > ~60 nodes load collapsed to depth 2; expand path-to-focus |
| P0-3 | **No semantic zoom** — 353 full-fidelity cards at 0.02 zoom is noise | tldraw LOD; Figma constant-size labels | below zoom ~0.35: hide preview/facets/edges-in-bands, keep title+status; section & radial-sector labels render constant screen size |
| P1-4 | **Radial radius/angle encode nothing** beyond sector | ThoughtWorks Radar rule; market-map survey | sector hulls (tinted wedge + constant-size sector label); optional radius=status/maturity; hover = highlight path, fade rest |
| P1-5 | **No search / minimap** | desert fog (Jul & Furnas 1998) | search box that flies camera to hit; React Flow MiniMap with edges hidden |
| P1-6 | **Layout chosen by manual cycling** | Napkin layout-agent pattern | `tm grow`/`tm decompose` suggests layout from structure shape; UI confirms |
| P2-7 | **No local/focus view** | TheBrain plex; Obsidian local graph | "focus mode": selected node + N hops full opacity, rest dimmed |
| P2-8 | **Layout switches teleport nodes** | Scarr: reflow destroys spatial memory | animate transitions; preserve relative order |
| P2-9 | **Grid rows aren't semantic** — columns-of-stacks, not a matrix | accidental alignment lies | optional row dimension (facet/status) so rows mean something |

## Key sources

Cleveland & McGill 1984 · Cowan 2001 · Nesbit & Adesope 2006 · Ziemkiewicz & Kosara 2008 ·
Burch et al. 2011 (radial worst for tree tasks) · Ghoniem 2004 / Yoghourdjian 2021 (node-link
limits) · Holten 2006 (edge bundling) · Shneiderman 1996 · Furnas 1986 (DOI) · Pirolli & Card
1999 (scent) · Robertson 1998 (Data Mountain) · Tversky 2011 (congruence principle) ·
product patterns: Heptabase, TheBrain, Obsidian (cautionary), MindNode, Miro, FigJam, tldraw
LOD, Napkin AI, CB Insights / MAD / a16z / Sequoia market maps, ThoughtWorks Radar.
