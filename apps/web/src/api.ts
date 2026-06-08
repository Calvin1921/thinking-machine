import type { Board } from "@tm/core/schema";

export const getBoard = (): Promise<Board> => fetch("/api/board").then((r) => r.json());

const post = (path: string, body: unknown) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

export const addNode = (label: string, parentId: string, kind: "branch" | "atom") => post("/api/add", { label, parentId, kind });
export const moveNode = (nodeId: string, x: number, y: number) => post("/api/move", { nodeId, x, y });
export const setFacet = (nodeId: string, facet: string, items: string[], mode: "set" | "add") =>
  post("/api/facet", { nodeId, facet, items, mode });

/** Subscribe to external board changes (CLI/MCP edits). */
export function onBoardChange(cb: () => void): () => void {
  const es = new EventSource("/api/events");
  es.addEventListener("board", cb);
  return () => es.close();
}
