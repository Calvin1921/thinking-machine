import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlow, Background, applyNodeChanges, type Node as FlowNode, type NodeChange, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import type { Board } from "@tm/core/schema";
import { shouldSuggestAlt, subtreeIds, ancestorPath } from "@tm/core/ops";
import { boardToFlow } from "./boardToFlow.js";
import { tidyLayout } from "./tidyLayout.js";
import { funnelLayout } from "./funnelLayout.js";
import { gridLayout } from "./gridLayout.js";
import { timelineLayout } from "./timelineLayout.js";
import { radialLayout } from "./radialLayout.js";
import { concentricLayout } from "./concentricLayout.js";
import { sectionedLayout, HEADER_H } from "./sectionedLayout.js";
import { ThinkNode } from "./ThinkNode.js";
import { SectionBox } from "./SectionNodes.js";
import { FacetDrawer } from "./FacetDrawer.js";
import { QuickAdd } from "./QuickAdd.js";
import { CollectionView } from "./CollectionView.js";
import { getBoard, moveNode, onBoardChange, setLayout, setSectionPos, setNodeSize, applyLayout, setLabel, setDescription } from "./api.js";

// Uniform cell = the widest × tallest measured think-node, so every card matches and aligns.
function uniformCell(flowNodes: FlowNode[]): { w: number; h: number } {
  let w = 230, h = 120;
  for (const n of flowNodes) {
    if (n.type !== "think") continue;
    if (n.measured?.width) w = Math.max(w, n.measured.width);
    if (n.measured?.height) h = Math.max(h, n.measured.height);
  }
  return { w: Math.round(w), h: Math.round(h) };
}

const nodeTypes = { think: ThinkNode, sectionBox: SectionBox };
const SEC_PREFIX = "__sec_";
const SEC_PAD_X = 32; // horizontal inset of section nodes from the container's left edge

/** Ids of nodes hidden because an ancestor is collapsed (the collapsed node itself stays visible). */
function computeHidden(board: Board, collapsed: Set<string>): Set<string> {
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from]?.push(e.to);
  const hidden = new Set<string>();
  const seen = new Set<string>();
  const walk = (id: string, under: boolean) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (under) hidden.add(id);
    const childUnder = under || collapsed.has(id);
    for (const c of kids[id] ?? []) walk(c, childUnder);
  };
  // Walk from the board root AND each section's own root (sections are separate sub-trees).
  walk(board.rootId, false);
  for (const s of board.sections ?? []) if (s.rootId) walk(s.rootId, false);
  return hidden;
}

// A board bigger than working memory loads as an overview: root + two levels visible,
// everything deeper folded behind its parent's +n toggle (expand follows the user's focus).
const OVERVIEW_MIN_NODES = 60;

/** Collapse set for the overview cut: every node at depth ≥ 2 that has children. */
function overviewCollapsed(board: Board): Set<string> {
  const kids: Record<string, string[]> = {};
  for (const n of board.nodes) kids[n.id] = [];
  for (const e of board.edges) if (e.type === "decomposition") kids[e.from]?.push(e.to);
  const out = new Set<string>();
  const seen = new Set<string>();
  const queue: [string, number][] = [board.rootId, ...(board.sections ?? []).map((s) => s.rootId).filter(Boolean) as string[]]
    .map((r) => [r, 0] as [string, number]);
  while (queue.length) {
    const [id, d] = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (d >= 2 && (kids[id]?.length ?? 0) > 0) { out.add(id); continue; }  // fold; skip descendants
    for (const c of kids[id] ?? []) queue.push([c, d + 1]);
  }
  return out;
}

// Below this zoom a card's body text is sub-perceptual — strip detail, keep title + status
// (the tldraw rule: simplify ornament, never meaning).
const LOD_ZOOM = 0.35;

/** Active board id from the URL hash, or null for the collection. `#/board/:id`. */
function boardIdFromHash(): string | null {
  const m = window.location.hash.match(/^#\/board\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function App() {
  const [boardId, setBoardId] = useState<string | null>(boardIdFromHash());

  useEffect(() => {
    const onHash = () => setBoardId(boardIdFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const open = useCallback((id: string) => { window.location.hash = `#/board/${encodeURIComponent(id)}`; }, []);
  const backToCollection = useCallback(() => { window.location.hash = "#/"; }, []);

  if (!boardId) return <CollectionView onOpen={open} />;
  return <CanvasView key={boardId} boardId={boardId} onBack={backToCollection} />;
}

function CanvasView({ boardId, onBack }: { boardId: string; onBack: () => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);   // Focus-dive: current re-root, null = board root
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hasDraft, setHasDraft] = useState(false);
  const [parentOverride, setParentOverride] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const selectThought = useCallback((id: string | null) => {
    if (id === selected) return;
    if (hasDraft && !window.confirm('Discard the unsaved changes in Thought details?')) return;
    setHasDraft(false); setSelected(id); setParentOverride(null);
  }, [selected, hasDraft]);
  useEffect(() => {
    if (!hasDraft) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasDraft]);
  const reportSaveError = useCallback((e: unknown) => setSaveError(e instanceof Error ? e.message : 'Could not save. Try again.'), []);
  const [far, setFar] = useState(false);            // zoomed out past the LOD threshold
  const seededRef = useRef<string | null>(null);   // boardId whose sections we've already seeded
  const overviewRef = useRef<string | null>(null); // boardId whose default collapse we've applied
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const fnRef = useRef<FlowNode[]>([]);             // latest flow nodes, for reading post-change positions

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  // Build the controlled node list from a board + collapse state. In section mode each
  // section is a draggable parent container; its graph nodes are children (relative coords).
  const buildNodes = useCallback((b: Board, collapsedSet: Set<string>): FlowNode[] => {
    const hidden = computeHidden(b, collapsedSet);
    const flow = boardToFlow(b);
    if (!b.sections?.length) {
      // Focus-dive: when a node is the dive-root, show only its decomposition subtree.
      const inFocus = focusId && b.nodes.some((n) => n.id === focusId) ? subtreeIds(b, focusId) : null;
      return flow.nodes
        .filter((n) => !hidden.has(n.id) && (!inFocus || inFocus.has(n.id)))
        .map((n) => ({ ...n, data: { ...n.data, collapsed: collapsedSet.has(n.id), onToggle: toggleCollapse } }));
    }
    const sl = sectionedLayout(b);
    const rectById = new Map(sl.sections.map((s) => [s.id, s]));
    const byId = new Map(flow.nodes.map((n) => [n.id, n]));
    const out: FlowNode[] = [];
    for (const s of b.sections) {
      const rect = rectById.get(s.id);
      if (!rect) continue;
      const w = s.w ?? (Math.max(rect.w, 300) + SEC_PAD_X * 2);
      const h = s.h ?? (rect.h + 34);
      const placed = s.x != null && s.y != null;
      out.push({
        id: `${SEC_PREFIX}${s.id}`, type: "sectionBox",
        position: placed ? { x: s.x!, y: s.y! } : { x: rect.x, y: rect.y },
        width: w, height: h, style: { width: w, height: h, zIndex: 0 }, draggable: true, selectable: true,
        data: { title: s.title, purpose: s.kind === "note" ? "note" : (s.layout ?? "tree"), kind: s.kind, note: s.note ?? "", w, h },
      } as FlowNode);
    }
    for (const n of b.nodes) {
      if (!n.sectionId || hidden.has(n.id)) continue;
      const base = byId.get(n.id);
      const sec = b.sections.find((s) => s.id === n.sectionId);
      if (!base || !sec) continue;
      // placed → persisted relative coords; unplaced → freshly computed relative + inset.
      const rel = sec.x != null
        ? { x: n.x, y: n.y }
        : (sl.nodes[n.id] ? { x: sl.nodes[n.id].x + SEC_PAD_X, y: sl.nodes[n.id].y } : { x: SEC_PAD_X, y: HEADER_H });
      out.push({ ...base, parentId: `${SEC_PREFIX}${n.sectionId}`, position: rel, draggable: true,
        data: { ...base.data, collapsed: collapsedSet.has(n.id), onToggle: toggleCollapse } } as FlowNode);
    }
    return out;
  }, [toggleCollapse, focusId]);

  // Focus-dive controls: dive into a node, pop up one level, or jump to a breadcrumb crumb.
  const dive = useCallback((id: string) => { setFocusId(id); setTimeout(() => rfRef.current?.fitView({ padding: 0.12 }), 120); }, []);
  const popFocus = useCallback(() => {
    if (!board || !focusId) return;
    const path = ancestorPath(board, focusId);
    setFocusId(path.length >= 2 ? path[path.length - 2] : null);
    setTimeout(() => rfRef.current?.fitView({ padding: 0.12 }), 120);
  }, [board, focusId]);
  useEffect(() => { setFocusId(null); }, [boardId]);                 // reset dive on board switch
  useEffect(() => {                                                  // Esc pops up one dive level
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && focusId) { e.preventDefault(); popFocus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId, popFocus]);

  const refresh = useCallback(async () => {
    let b: Board;
    try {
      b = await getBoard(boardId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      return;
    }
    setLoadError(null);
    setBoard(b);
    // First open of a board: big boards start as an overview (root + two levels), small
    // ones fully expanded. Once per board — afterwards the user's fold state rules. Done
    // here (not in an effect) because the closure knows which boardId this fetch was FOR;
    // board.id is unreliable (legacy files carry ids that don't match their filename slug).
    if (overviewRef.current !== boardId) {
      overviewRef.current = boardId;
      setCollapsed(b.nodes.length > OVERVIEW_MIN_NODES ? overviewCollapsed(b) : new Set<string>());
      // re-frame once the (possibly folded) list has rendered: the initial fitView saw the
      // fully-expanded extent, and a hash-switch keeps the previous board's viewport.
      // Twice — unsized cards have no bounds until ReactFlow measures them.
      setTimeout(() => rfRef.current?.fitView({ padding: 0.08 }), 150);
      setTimeout(() => rfRef.current?.fitView({ padding: 0.08 }), 700);
    }
    // One-time seed: give unplaced sections + their nodes concrete persisted positions so
    // they can then be dragged. After this the board carries section.x/y and relative node x/y.
    if (b.sections?.some((s) => s.x == null) && seededRef.current !== boardId) {
      seededRef.current = boardId;
      const sl = sectionedLayout(b);
      const positions: Record<string, { x: number; y: number }> = {};
      for (const id of Object.keys(sl.nodes)) positions[id] = { x: sl.nodes[id].x + SEC_PAD_X, y: sl.nodes[id].y };
      const sectionPositions: Record<string, { x: number; y: number }> = {};
      for (const r of sl.sections) sectionPositions[r.id] = { x: r.x, y: r.y };
      applyLayout(boardId, { positions, sectionPositions }).catch(reportSaveError);   // one atomic write, no race
    }
  }, [boardId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onBoardChange(refresh), [refresh]);   // live reload on CLI/MCP edits

  // Inline card edits → persist, then refresh (SSE would also catch it, but explicit is instant).
  const rename = useCallback((id: string, label: string) => { setLabel(boardId, id, label).then(refresh).catch(reportSaveError); }, [boardId, refresh]);
  const describe = useCallback((id: string, description: string) => { setDescription(boardId, id, description).then(refresh).catch(reportSaveError); }, [boardId, refresh]);

  // Rebuild the controlled node list whenever the board or collapse state changes; inject the
  // inline-edit callbacks into each think node here (keeps buildNodes pure of the API layer).
  useEffect(() => {
    if (!board) return;
    const fn = buildNodes(board, collapsed).map((n) =>
      n.type === "think" ? { ...n, selected: n.id === selected, data: { ...n.data, onRename: rename, onDescribe: describe } } : n);
    fnRef.current = fn;
    setFlowNodes(fn);
  }, [board, collapsed, buildNodes, rename, describe, selected]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // ReactFlow already corrects child positions for a top/left section resize (it emits the
    // child position changes here), so we just apply them — no manual compensation.
    const next = applyNodeChanges(changes, fnRef.current);
    fnRef.current = next;
    setFlowNodes(next);
    const at = (id: string) => next.find((n) => n.id === id);
    for (const c of changes) {
      const isSec = "id" in c && c.id.startsWith(SEC_PREFIX);
      const secId = isSec ? (c as { id: string }).id.slice(SEC_PREFIX.length) : "";
      if (c.type === "position" && c.dragging === false) {          // drag-end
        const n = at(c.id); if (!n) continue;
        if (isSec) setSectionPos(boardId, secId, n.position.x, n.position.y).catch(reportSaveError);
        else moveNode(boardId, c.id, n.position.x, n.position.y).catch(reportSaveError);
      } else if (c.type === "dimensions" && c.resizing === false && c.dimensions) { // resize-end
        const n = at(c.id); if (!n) continue;
        const w = Math.round(c.dimensions.width), h = Math.round(c.dimensions.height);
        if (isSec) {
          // persist the resized box AND the children's ReactFlow-corrected positions
          const positions: Record<string, { x: number; y: number }> = {};
          for (const ch of next) if (ch.parentId === c.id) positions[ch.id] = { x: ch.position.x, y: ch.position.y };
          applyLayout(boardId, { sectionPositions: { [secId]: { x: n.position.x, y: n.position.y } }, sectionSizes: { [secId]: { w, h } }, positions }).catch(reportSaveError);
        } else {
          setNodeSize(boardId, c.id, w, h).catch(reportSaveError);
          moveNode(boardId, c.id, n.position.x, n.position.y).catch(reportSaveError);
        }
      }
    }
  }, [boardId]);

  // Re-frame once a layout write lands. The new positions arrive via the SSE refresh
  // on a later render, so fit twice — quickly, then again after cards re-measure
  // (same two-beat pattern as the board-open fit).
  const fitAfterLayout = useCallback(() => {
    setTimeout(() => rfRef.current?.fitView({ padding: 0.12 }), 150);
    setTimeout(() => rfRef.current?.fitView({ padding: 0.12 }), 600);
  }, []);

  // Re-arrange a NON-sectioned board with the given layout, committed atomically (one
  // write, no race), then re-framed. The tree keeps each card's measured height and the
  // live fold state — a collapsed subtree lays out as a leaf instead of reserving
  // phantom space — with the uniform cell aligning column widths only. The geometric
  // layouts (funnel/grid/timeline/radial/concentric) still size every card to the cell.
  const arrange = useCallback((b: Board, kind: "tree" | "funnel" | "grid" | "timeline" | "radial" | "concentric") => {
    const cell = uniformCell(flowNodes);
    if (kind === "tree") {
      const heights: Record<string, number> = {};
      for (const n of flowNodes) if (n.type === "think" && n.measured?.height) heights[n.id] = n.measured.height;
      applyLayout(boardId, { positions: tidyLayout(b, heights, collapsed, cell) }).then(fitAfterLayout).catch(reportSaveError);
      return;
    }
    const pos = kind === "funnel" ? funnelLayout(b, {}, cell) : kind === "grid" ? gridLayout(b, {}, cell) : kind === "timeline" ? timelineLayout(b, {}, cell) : kind === "radial" ? radialLayout(b, {}, cell) : concentricLayout(b, {}, cell);
    const sizes: Record<string, { w: number; h: number }> = {};
    for (const n of b.nodes) sizes[n.id] = cell;
    applyLayout(boardId, { positions: pos, sizes }).then(fitAfterLayout).catch(reportSaveError);
  }, [boardId, flowNodes, collapsed, fitAfterLayout]);

  const tidy = useCallback(() => {
    if (!board) return;
    const cell = uniformCell(flowNodes);
    if (board.sections?.length) {
      const sl = sectionedLayout(board, cell);
      const positions: Record<string, { x: number; y: number }> = {};
      for (const id of Object.keys(sl.nodes)) positions[id] = { x: sl.nodes[id].x + SEC_PAD_X, y: sl.nodes[id].y };
      const sizes: Record<string, { w: number; h: number }> = {};
      for (const n of board.nodes) if (n.sectionId) sizes[n.id] = cell;
      const sectionPositions: Record<string, { x: number; y: number }> = {};
      for (const r of sl.sections) sectionPositions[r.id] = { x: r.x, y: r.y };
      applyLayout(boardId, { positions, sizes, sectionPositions }).then(fitAfterLayout).catch(reportSaveError);
      return;
    }
    arrange(board, board.layout ?? "tree");
  }, [board, boardId, arrange, flowNodes, fitAfterLayout]);

  // Cycle the board layout tree → funnel → grid → timeline → radial: persist, flip handles, re-arrange.
  const switchLayout = useCallback((kind: "tree" | "funnel" | "grid" | "timeline" | "radial" | "concentric") => {
    if (!board) return;
    const next = { ...board, layout: kind === "tree" ? undefined : kind };
    setBoard(next);             // re-renders edges with the right handles immediately
    arrange(next, kind);
    setLayout(boardId, kind).catch(reportSaveError);   // persist (SSE refresh will reconcile)
  }, [board, boardId, arrange]);

  // Collapse all nodes that have children, except the root → overview = root + its direct children.
  const collapseAll = useCallback(() => {
    if (!board) return;
    const counts: Record<string, number> = {};
    for (const e of board.edges) if (e.type === "decomposition") counts[e.from] = (counts[e.from] ?? 0) + 1;
    const roots = new Set([board.rootId, ...(board.sections ?? []).map((s) => s.rootId).filter(Boolean) as string[]]);
    setCollapsed(new Set(board.nodes.filter((n) => counts[n.id] && !roots.has(n.id)).map((n) => n.id)));
  }, [board]);
  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  const sectioned = !!board?.sections?.length;

  if (loadError) return (
    <div className="loading">
      <p>{loadError}</p>
      <button className="back" onClick={onBack}>← Back to canvases</button>
    </div>
  );
  if (!board) return <div className="loading">Loading board…</div>;
  const visibleIds = new Set(flowNodes.map((n) => n.id));
  const edges = boardToFlow(board).edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  const selectedNode = board.nodes.find((n) => n.id === selected) ?? null;

  const suggestedParent = parentOverride ?? selectedNode?.id ?? focusId ?? board.rootId;
  const parentId = board.nodes.some(n => n.id === suggestedParent) ? suggestedParent : board.rootId;
  const addRelated = () => { setParentOverride(selectedNode?.id ?? board.rootId); document.getElementById('new-thought')?.focus(); };
  const leave = () => { if (!hasDraft || window.confirm('Discard the unsaved changes in Thought details?')) onBack(); };
  return (
    <div className={far ? "app lod-far" : "app"}>
      <header className="topbar">
        <button className="back" onClick={leave}>Boards</button>
        <span className="topbar-title">{board.title}</span>
        {board.guideMode && (
          <span className="guide-badge" title="Guide posture is on — the assistant asks before expanding the board">Guide</span>
        )}
        <button className="back" onClick={collapsed.size ? expandAll : collapseAll}
          title="Toggle overview">{collapsed.size ? "Expand all" : "Overview"}</button>
        <button className="back" onClick={tidy} title={sectioned ? "Reset section layout" : "Auto-arrange"}>Arrange</button>
        {!sectioned && focusId && board.nodes.some((n) => n.id === focusId) && (
          <nav className="crumbs" aria-label="Focus path">
            <button className="crumb" onClick={() => { setFocusId(null); setTimeout(() => rfRef.current?.fitView({ padding: 0.12 }), 120); }} title="Back to the whole board">Whole board</button>
            {ancestorPath(board, focusId).map((id, i, arr) => {
              const n = board.nodes.find((x) => x.id === id);
              if (!n) return null;
              const last = i === arr.length - 1;
              return <span key={id} className="crumb-seg">
                <span className="crumb-sep">›</span>
                {last ? <span className="crumb cur">{n.label}</span>
                      : <button className="crumb" onClick={() => dive(id)}>{n.label}</button>}
              </span>;
            })}
          </nav>
        )}
        {!sectioned && <label className="layout-picker">Layout
          <select value={board.layout ?? 'tree'} onChange={e => switchLayout(e.target.value as 'tree')}>
            <option value="tree">Tree</option><option value="funnel">Funnel</option><option value="grid">Grid</option>
            <option value="timeline">Timeline</option><option value="radial">Radial</option><option value="concentric">Concentric</option>
          </select>
        </label>}
        {!sectioned && shouldSuggestAlt(board) && (() => {
          const label = { tree: "Tree", funnel: "Funnel", grid: "Grid", timeline: "Timeline", radial: "Radial", concentric: "Concentric" } as const;
          const a = board.altFraming!;
          // Pathfinder: offer the road not taken — the framing the user might not have considered.
          return <button className="back alt-frame" onClick={() => switchLayout(a.layout as "tree" | "funnel" | "grid" | "timeline" | "radial" | "concentric")}
            title={a.intent ? `if your point is: ${a.intent}` : "alternative framing"}>See as {label[a.layout]}</button>;
        })()}
        <button className="back help-toggle" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)}>How to use</button>
      </header>
      {saveError && <div className="save-error" role="alert">{saveError} <button className="btn-ghost" onClick={() => setSaveError(null)}>Dismiss</button></div>}
      {showHelp && <section className="canvas-help" aria-label="How to use this board">
        <div><h2>Think wider. Go deeper. Keep your judgment.</h2><p>Add a different option under <strong>Whole board</strong>. Select a concept to add related thoughts. Click its title to edit inline, or use <strong>Thought details</strong> to record your reasoning.</p></div>
        <div><h3>Questions worth adding</h3><p>What are we overlooking? What would change our mind? Which trade-off matters most? Record missing evidence as an <strong>Open question</strong>, and a decision as an <strong>Outcome / next step</strong>.</p></div>
        <div><h3>Read the map</h3><p>Solid lines: part of. Dashed lines: depends on. Amber question: missing information. Evidence labels describe recorded checks, not automatic truth.</p><p>Double-click to focus. Escape moves up. Drag to rearrange; use Fit view to see the whole map. Changes are saved locally; agents can update the same board.</p></div>
      </section>}
      <div className="canvas-workspace">
      <main className="canvas-stage" aria-label="Thinking canvas">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => { if (!n.id.startsWith(SEC_PREFIX)) selectThought(n.id); }}
        onPaneClick={() => selectThought(null)}
        nodesConnectable={false}
        deleteKeyCode={null}
        colorMode="dark"
        style={{ background: "var(--bg)" }}
        onNodeDoubleClick={(_, n) => { if (!n.id.startsWith(SEC_PREFIX)) dive(n.id); }}
        onViewportChange={(vp) => setFar(vp.zoom < LOD_ZOOM)}
        onInit={(inst) => { rfRef.current = inst; }}
        fitView
        minZoom={0.02}
      >
        <Background color="#152130" gap={24} />
      </ReactFlow>
      <nav className="canvas-controls" aria-label="Canvas view controls">
        <button onClick={() => rfRef.current?.zoomOut()} aria-label="Zoom out"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12" /></svg></button>
        <button onClick={() => rfRef.current?.zoomIn()} aria-label="Zoom in"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M10 4v12" /></svg></button>
        <button onClick={() => rfRef.current?.fitView({ padding: 0.15 })}>Fit view</button>
      </nav>
      </main>
      {selectedNode && <FacetDrawer key={selectedNode.id} boardId={boardId} node={selectedNode}
        onClose={() => selectThought(null)} onSaved={() => { refresh(); fitAfterLayout(); }} onDirtyChange={setHasDraft}
        onAddChild={addRelated} onFocus={() => dive(selectedNode.id)} />}
      </div>
      <QuickAdd boardId={boardId} board={board} parentId={parentId} onParentChange={setParentOverride} onAdded={(next, _id, parent) => {
        setBoard(next);
        setCollapsed(old => { const expanded = new Set(old); for (const id of ancestorPath(next, parent)) expanded.delete(id); expanded.delete(parent); return expanded; });
        if (focusId && !subtreeIds(next, focusId).has(parent)) setFocusId(null);
        fitAfterLayout();
      }} />
    </div>
  );
}
