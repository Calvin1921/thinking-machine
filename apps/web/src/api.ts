import type { Board } from "@tm/core/schema";

export type RootType = "objective" | "cause" | "decision" | "concept";

export interface BoardSummary {
  id: string;
  title: string;
  rootType?: string;
  nodeCount: number;
  updatedAt: number;
}

const post = (path: string, body: unknown) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

// --- collection ---
export const listBoards = (): Promise<BoardSummary[]> => fetch("/api/boards").then((r) => r.json());
export const createBoard = (title: string, rootType: RootType): Promise<{ id: string }> =>
  post("/api/boards", { title, rootType });

// --- a single board ---
export const getBoard = (id: string): Promise<Board> => fetch(`/api/boards/${id}`).then((r) => r.json());
export const addNode = (boardId: string, label: string, parentId: string, kind: "branch" | "atom") =>
  post(`/api/boards/${boardId}/add`, { label, parentId, kind });
export const moveNode = (boardId: string, nodeId: string, x: number, y: number) =>
  post(`/api/boards/${boardId}/move`, { nodeId, x, y });
export const setFacet = (boardId: string, nodeId: string, facet: string, items: string[], mode: "set" | "add") =>
  post(`/api/boards/${boardId}/facet`, { nodeId, facet, items, mode });
export const setImage = (boardId: string, nodeId: string, url: string) =>
  post(`/api/boards/${boardId}/image`, { nodeId, url });

/** Subscribe to external board changes (CLI/MCP edits, new boards, etc.). */
export function onBoardChange(cb: () => void): () => void {
  const es = new EventSource("/api/events");
  es.addEventListener("boards", cb);
  return () => es.close();
}
