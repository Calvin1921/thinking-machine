import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, applyNodeChanges, type Node as FlowNode, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import type { Board } from "@tm/core/schema";
import { boardToFlow } from "./boardToFlow.js";
import { tidyLayout } from "./tidyLayout.js";
import { ThinkNode } from "./ThinkNode.js";
import { FacetDrawer } from "./FacetDrawer.js";
import { QuickAdd } from "./QuickAdd.js";
import { CollectionView } from "./CollectionView.js";
import { getBoard, moveNode, onBoardChange } from "./api.js";

const nodeTypes = { think: ThinkNode };

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
  walk(board.rootId, false);
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

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const refresh = useCallback(async () => {
    const b = await getBoard(boardId);
    setBoard(b);
    setFlowNodes(boardToFlow(b).nodes);
  }, [boardId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onBoardChange(refresh), [refresh]);   // live reload on CLI/MCP edits

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setFlowNodes((ns) => applyNodeChanges(changes, ns));
    for (const c of changes) {
      if (c.type === "position" && c.dragging === false && c.position) {
        moveNode(boardId, c.id, c.position.x, c.position.y);
      }
    }
  }, [boardId]);

  const tidy = useCallback(() => {
    if (!board) return;
    // React Flow v12 exposes each rendered node's measured size as node.measured?.height.
    const heights: Record<string, number> = {};
    for (const n of flowNodes) { const hh = n.measured?.height; if (hh) heights[n.id] = hh; }
    // Always lay out the FULL tree (ignore collapse): persisting a collapse-aware partial
    // layout would leave hidden children at stale positions and break the expanded view.
    const pos = tidyLayout(board, heights);
    setFlowNodes((ns) => ns.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n)));
    Object.entries(pos).forEach(([id, p]) => moveNode(boardId, id, p.x, p.y));
  }, [board, boardId, flowNodes]);

  // Collapse all nodes that have children, except the root → overview = root + its direct children.
  const collapseAll = useCallback(() => {
    if (!board) return;
    const counts: Record<string, number> = {};
    for (const e of board.edges) if (e.type === "decomposition") counts[e.from] = (counts[e.from] ?? 0) + 1;
    setCollapsed(new Set(board.nodes.filter((n) => counts[n.id] && n.id !== board.rootId).map((n) => n.id)));
  }, [board]);
  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  const hidden = useMemo(() => (board ? computeHidden(board, collapsed) : new Set<string>()), [board, collapsed]);
  const displayNodes = useMemo(
    () => flowNodes
      .filter((n) => !hidden.has(n.id))
      .map((n) => ({ ...n, data: { ...n.data, collapsed: collapsed.has(n.id), onToggle: toggleCollapse } })),
    [flowNodes, hidden, collapsed, toggleCollapse],
  );

  if (!board) return <div className="loading">Loading board…</div>;
  const edges = boardToFlow(board).edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target));
  const selectedNode = board.nodes.find((n) => n.id === selected) ?? null;

  return (
    <div className="app">
      <div className="topbar">
        <button className="back" onClick={onBack}>← Canvases</button>
        <span className="topbar-title">{board.title}</span>
        <button className="back" onClick={tidy} title="Auto-arrange the tree">⤢ Tidy</button>
        <button className="back" onClick={collapsed.size ? expandAll : collapseAll}
          title="Toggle overview">{collapsed.size ? "⊞ Expand all" : "⊟ Collapse all"}</button>
      </div>
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => setSelected(n.id)}
        fitView
      >
        <Background color="#262c36" gap={24} />
        <Controls />
      </ReactFlow>
      <div className="legend">
        <div><span className="lg-line solid" /> part of</div>
        <div><span className="lg-line dashed" /> depends on</div>
        <div><span className="lg-box dashed" /> leaf (won't expand)</div>
      </div>
      <QuickAdd boardId={boardId} rootId={board.rootId} onAdded={refresh} />
      <FacetDrawer boardId={boardId} node={selectedNode} onClose={() => setSelected(null)} onSaved={refresh} />
    </div>
  );
}
