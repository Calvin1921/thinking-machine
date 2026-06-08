import { useCallback, useEffect, useState } from "react";
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
    const pos = tidyLayout(board, heights);
    setFlowNodes((ns) => ns.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n)));
    Object.entries(pos).forEach(([id, p]) => moveNode(boardId, id, p.x, p.y));
  }, [board, boardId, flowNodes]);

  if (!board) return <div className="loading">Loading board…</div>;
  const edges = boardToFlow(board).edges;
  const selectedNode = board.nodes.find((n) => n.id === selected) ?? null;

  return (
    <div className="app">
      <div className="topbar">
        <button className="back" onClick={onBack}>← Canvases</button>
        <span className="topbar-title">{board.title}</span>
        <button className="back" onClick={tidy} title="Auto-arrange the tree">⤢ Tidy</button>
      </div>
      <ReactFlow
        nodes={flowNodes}
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
