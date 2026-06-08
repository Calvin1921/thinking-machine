import { useCallback, useEffect, useState } from "react";
import { ReactFlow, Background, Controls, applyNodeChanges, type Node as FlowNode, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import type { Board } from "@tm/core/schema";
import { boardToFlow } from "./boardToFlow.js";
import { ThinkNode } from "./ThinkNode.js";
import { FacetDrawer } from "./FacetDrawer.js";
import { QuickAdd } from "./QuickAdd.js";
import { getBoard, moveNode, onBoardChange } from "./api.js";

const nodeTypes = { think: ThinkNode };

export default function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const b = await getBoard();
    setBoard(b);
    setFlowNodes(boardToFlow(b).nodes);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onBoardChange(refresh), [refresh]);   // live reload on CLI/MCP edits

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setFlowNodes((ns) => applyNodeChanges(changes, ns));
    for (const c of changes) {
      if (c.type === "position" && c.dragging === false && c.position) {
        moveNode(c.id, c.position.x, c.position.y);
      }
    }
  }, []);

  if (!board) return <div className="loading">Loading board…</div>;
  const edges = boardToFlow(board).edges;
  const selectedNode = board.nodes.find((n) => n.id === selected) ?? null;

  return (
    <div className="app">
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
      <QuickAdd rootId={board.rootId} onAdded={refresh} />
      <FacetDrawer node={selectedNode} onClose={() => setSelected(null)} onSaved={refresh} />
    </div>
  );
}
