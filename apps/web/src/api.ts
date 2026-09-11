import type { Board } from "@tm/core/schema";

export type RootType = "objective" | "cause" | "decision" | "concept";

export interface BoardSummary {
  id: string;
  title: string;
  rootType?: string;
  nodeCount: number;
  updatedAt: number;
}

const post = async (path: string, body: unknown) => {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Could not save (HTTP ${response.status}). Your input has been kept; try again.`);
  return data;
};

export const editThought = (boardId: string, nodeId: string, changes: import("@tm/core").NodePatch, expected: import("@tm/core").NodePatch): Promise<Board> =>
  post(`/api/boards/${boardId}/edit`, { nodeId, changes, expected });

// --- collection ---
export const listBoards = (): Promise<BoardSummary[]> => fetch("/api/boards").then((r) => { if (!r.ok) throw new Error("Could not load boards. Check that the local server is running."); return r.json(); });
export const createBoard = (title: string, rootType: RootType): Promise<{ id: string }> =>
  post("/api/boards", { title, rootType });

// --- a single board ---
export const getBoard = async (id: string): Promise<Board> => {
  const r = await fetch(`/api/boards/${id}`);
  if (!r.ok) {
    const detail = await r.json().catch(() => null);
    throw new Error(detail?.error ? `Couldn't load board "${id}": ${detail.error}` : `Couldn't load board "${id}" (HTTP ${r.status})`);
  }
  return r.json();
};
export const addNode = (boardId: string, label: string, parentId: string, kind: "branch" | "atom"): Promise<Board> =>
  post(`/api/boards/${boardId}/add`, { label, parentId, kind });
export const moveNode = (boardId: string, nodeId: string, x: number, y: number) =>
  post(`/api/boards/${boardId}/move`, { nodeId, x, y });
export const setLabel = (boardId: string, nodeId: string, label: string) =>
  post(`/api/boards/${boardId}/label`, { nodeId, label });
export const setDescription = (boardId: string, nodeId: string, description: string) =>
  post(`/api/boards/${boardId}/description`, { nodeId, description });
export const setImage = (boardId: string, nodeId: string, url: string) =>
  post(`/api/boards/${boardId}/image`, { nodeId, url });
export const setStatus = (boardId: string, nodeId: string, status: string) =>
  post(`/api/boards/${boardId}/status`, { nodeId, status });
export const setLayout = (boardId: string, layout: string) =>
  post(`/api/boards/${boardId}/layout`, { layout });
export const addSection = (boardId: string, title: string, kind: "graph" | "note", layout?: string) =>
  post(`/api/boards/${boardId}/section`, { title, kind, layout });
export const setNote = (boardId: string, sectionId: string, note: string) =>
  post(`/api/boards/${boardId}/note`, { sectionId, note });
export const setSectionLayout = (boardId: string, sectionId: string, layout: string) =>
  post(`/api/boards/${boardId}/section-layout`, { sectionId, layout });
export const setSectionPos = (boardId: string, sectionId: string, x: number, y: number) =>
  post(`/api/boards/${boardId}/section-pos`, { sectionId, x, y });
export interface LayoutUpdate {
  positions?: Record<string, { x: number; y: number }>;
  sizes?: Record<string, { w: number; h: number }>;
  sectionPositions?: Record<string, { x: number; y: number }>;
  sectionSizes?: Record<string, { w: number; h: number }>;
}
export const applyLayout = (boardId: string, update: LayoutUpdate) =>
  post(`/api/boards/${boardId}/layout-bulk`, update);
export const setNodeSize = (boardId: string, nodeId: string, w: number, h: number) =>
  post(`/api/boards/${boardId}/node-size`, { nodeId, w, h });
export const setSectionSize = (boardId: string, sectionId: string, w: number, h: number) =>
  post(`/api/boards/${boardId}/section-size`, { sectionId, w, h });

/** Subscribe to external board changes (CLI/MCP edits, new boards, etc.). */
export function onBoardChange(cb: () => void): () => void {
  const es = new EventSource("/api/events");
  es.addEventListener("boards", cb);
  return () => es.close();
}
