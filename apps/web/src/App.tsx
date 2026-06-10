import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlow, Background, Controls, applyNodeChanges, type Node as FlowNode, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import type { Board } from "@tm/core/schema";
import { boardToFlow } from "./boardToFlow.js";
import { tidyLayout } from "./tidyLayout.js";
import { funnelLayout } from "./funnelLayout.js";
import { gridLayout } from "./gridLayout.js";
import { timelineLayout } from "./timelineLayout.js";
import { radialLayout } from "./radialLayout.js";
import { sectionedLayout, HEADER_H } from "./sectionedLayout.js";
import { ThinkNode } from "./ThinkNode.js";
import { SectionBox } from "./SectionNodes.js";
import { FacetDrawer } from "./FacetDrawer.js";
import { QuickAdd } from "./QuickAdd.js";
import { CollectionView } from "./CollectionView.js";
import { getBoard, moveNode, onBoardChange, setLayout, setSectionPos, setNodeSize, applyLayout } from "./api.js";

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
  return <CanvasView boardId={boardId} onBack={backToCollection} />;
}

function CanvasView({ boardId, onBack }: { boardId: string; onBack: () => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const seededRef = useRef<string | null>(null);   // boardId whose sections we've already seeded
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
      return flow.nodes
        .filter((n) => !hidden.has(n.id))
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
  }, [toggleCollapse]);

  const refresh = useCallback(async () => {
    const b = await getBoard(boardId);
    setBoard(b);
    // One-time seed: give unplaced sections + their nodes concrete persisted positions so
    // they can then be dragged. After this the board carries section.x/y and relative node x/y.
    if (b.sections?.some((s) => s.x == null) && seededRef.current !== boardId) {
      seededRef.current = boardId;
      const sl = sectionedLayout(b);
      const positions: Record<string, { x: number; y: number }> = {};
      for (const id of Object.keys(sl.nodes)) positions[id] = { x: sl.nodes[id].x + SEC_PAD_X, y: sl.nodes[id].y };
      const sectionPositions: Record<string, { x: number; y: number }> = {};
      for (const r of sl.sections) sectionPositions[r.id] = { x: r.x, y: r.y };
      applyLayout(boardId, { positions, sectionPositions });   // one atomic write, no race
    }
  }, [boardId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onBoardChange(refresh), [refresh]);   // live reload on CLI/MCP edits
  // Rebuild the controlled node list whenever the board or collapse state changes.
  useEffect(() => { if (board) { const fn = buildNodes(board, collapsed); fnRef.current = fn; setFlowNodes(fn); } }, [board, collapsed, buildNodes]);

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
        if (isSec) setSectionPos(boardId, secId, n.position.x, n.position.y);
        else moveNode(boardId, c.id, n.position.x, n.position.y);
      } else if (c.type === "dimensions" && c.resizing === false && c.dimensions) { // resize-end
        const n = at(c.id); if (!n) continue;
        const w = Math.round(c.dimensions.width), h = Math.round(c.dimensions.height);
        if (isSec) {
          // persist the resized box AND the children's ReactFlow-corrected positions
          const positions: Record<string, { x: number; y: number }> = {};
          for (const ch of next) if (ch.parentId === c.id) positions[ch.id] = { x: ch.position.x, y: ch.position.y };
          applyLayout(boardId, { sectionPositions: { [secId]: { x: n.position.x, y: n.position.y } }, sectionSizes: { [secId]: { w, h } }, positions });
        } else {
          setNodeSize(boardId, c.id, w, h);
          moveNode(boardId, c.id, n.position.x, n.position.y);
        }
      }
    }
  }, [boardId]);

  // Re-arrange a NON-sectioned board with the given layout, sizing every card to the
  // uniform cell and aligning to it — committed atomically (one write, no race).
  const arrange = useCallback((b: Board, kind: "tree" | "funnel" | "grid" | "timeline" | "radial") => {
    const cell = uniformCell(flowNodes);
    const pos = kind === "funnel" ? funnelLayout(b, {}, cell) : kind === "grid" ? gridLayout(b, {}, cell) : kind === "timeline" ? timelineLayout(b, {}, cell) : kind === "radial" ? radialLayout(b, {}, cell) : tidyLayout(b, {}, new Set(), cell);
    const sizes: Record<string, { w: number; h: number }> = {};
    for (const n of b.nodes) sizes[n.id] = cell;
    applyLayout(boardId, { positions: pos, sizes });
  }, [boardId, flowNodes]);

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
      applyLayout(boardId, { positions, sizes, sectionPositions });
      return;
    }
    arrange(board, board.layout ?? "tree");
  }, [board, boardId, arrange, flowNodes]);

  // Cycle the board layout tree → funnel → grid → timeline → radial: persist, flip handles, re-arrange.
  const switchLayout = useCallback((kind: "tree" | "funnel" | "grid" | "timeline" | "radial") => {
    if (!board) return;
    const next = { ...board, layout: kind === "tree" ? undefined : kind };
    setBoard(next);             // re-renders edges with the right handles immediately
    arrange(next, kind);
    setLayout(boardId, kind);   // persist (SSE refresh will reconcile)
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

  if (!board) return <div className="loading">Loading board…</div>;
  const visibleIds = new Set(flowNodes.map((n) => n.id));
  const edges = boardToFlow(board).edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  const selectedNode = board.nodes.find((n) => n.id === selected) ?? null;

  return (
    <div className="app">
      <div className="topbar">
        <button className="back" onClick={onBack}>← Canvases</button>
        <span className="topbar-title">{board.title}</span>
        <button className="back" onClick={collapsed.size ? expandAll : collapseAll}
          title="Toggle overview">{collapsed.size ? "⊞ Expand all" : "⊟ Collapse all"}</button>
        <button className="back" onClick={tidy} title={sectioned ? "Reset section layout" : "Auto-arrange"}>⤢ Tidy</button>
        {!sectioned && (() => {
          const cycle = { tree: "funnel", funnel: "grid", grid: "timeline", timeline: "radial", radial: "tree" } as const;
          const next = cycle[board.layout ?? "tree"];
          const label = { tree: "🌳 Tree", funnel: "▽ Funnel", grid: "▦ Grid", timeline: "▤ Timeline", radial: "◎ Radial" } as const;
          return <button className="back" onClick={() => switchLayout(next)} title="Switch representation">{label[next]}</button>;
        })()}
      </div>
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => setSelected(n.id)}
        fitView
        minZoom={0.1}
      >
        <Background color="#262c36" gap={24} />
        <Controls />
      </ReactFlow>
      <div className="legend">
        <div><span className="lg-line solid" /> part of</div>
        <div><span className="lg-line dashed" /> depends on</div>
        <div><span className="lg-box dashed" /> leaf (won't expand)</div>
      </div>
      {!sectioned && <QuickAdd boardId={boardId} rootId={board.rootId} onAdded={refresh} />}
      <FacetDrawer boardId={boardId} node={selectedNode} onClose={() => setSelected(null)} onSaved={refresh} />
    </div>
  );
}
