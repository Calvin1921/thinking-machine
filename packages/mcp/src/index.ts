// packages/mcp/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync } from "node:fs";
import { z } from "zod";
import {
  boardPath, listBoards, createBoard, loadBoard, mutate,
  addNode, linkNodes, setFacet, promoteFacetItem, decompose, setNodeImage, growSubtree,
} from "@tm/core";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

// Board ids are slugs (see core's slug()): a leading [a-z0-9] then up to 63 more
// [a-z0-9-]. Guards `board` before it reaches boardPath()/join(), so a value like
// "../secret" can never escape the boards dir. Mirrors the web sidecar's ID_RE.
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const BOARD_DESC = "the board id from tm_list_boards / tm_create_board";

export function buildServer(dir: string): McpServer {
  const server = new McpServer({ name: "thinking-machine", version: "0.1.0" });

  // Validate `board` and confirm it exists on disk. Throws on failure; the MCP SDK
  // wraps a thrown Error into an `isError` tool result for the agent to read.
  const resolveBoard = (board: string): string => {
    if (!ID_RE.test(board)) throw new Error("bad board id");
    const file = boardPath(dir, board);
    if (!existsSync(file)) throw new Error("no such board");
    return file;
  };

  server.tool("tm_list_boards", "List every board in the boards directory (newest first)",
    {},
    async () => ok(listBoards(dir)));

  server.tool("tm_create_board", "Create a new board with one root node; returns its id",
    { title: z.string(), rootType: z.enum(["objective", "cause", "decision", "concept"]) },
    async ({ title, rootType }) => {
      if (title.trim() === "") throw new Error("title required");
      return ok({ id: createBoard(dir, title, rootType) });
    });

  server.tool("tm_show", "Read a whole board, or one node within it",
    { board: z.string().describe(BOARD_DESC), nodeId: z.string().optional() },
    async ({ board, nodeId }) => {
      const b = loadBoard(resolveBoard(board));
      return ok(nodeId ? b.nodes.find((n) => n.id === nodeId) : b);
    });

  server.tool("tm_add_node", "Add a child node under a parent on a board",
    { board: z.string().describe(BOARD_DESC), label: z.string(), parentId: z.string(), kind: z.enum(["branch", "atom"]) },
    async ({ board, label, parentId, kind }) =>
      ok(mutate(resolveBoard(board), (b) => addNode(b, { label, parentId, kind }))));

  server.tool("tm_link", "Add an edge between two nodes on a board",
    { board: z.string().describe(BOARD_DESC), from: z.string(), to: z.string(), type: z.enum(["decomposition", "dependency"]) },
    async ({ board, from, to, type }) =>
      ok(mutate(resolveBoard(board), (b) => linkNodes(b, from, to, type))));

  server.tool("tm_set_facet", "Set or add items to a node facet on a board",
    { board: z.string().describe(BOARD_DESC), nodeId: z.string(), facet: z.string(), items: z.array(z.string()), mode: z.enum(["set", "add"]) },
    async ({ board, nodeId, facet, items, mode }) =>
      ok(mutate(resolveBoard(board), (b) => setFacet(b, nodeId, facet, items, mode))));

  server.tool("tm_set_image", "Attach an optional image url to a node on a board (empty url clears it)",
    { board: z.string().describe(BOARD_DESC), nodeId: z.string(), url: z.string().describe("image URL, or empty string to clear") },
    async ({ board, nodeId, url }) =>
      ok(mutate(resolveBoard(board), (b) => setNodeImage(b, nodeId, url))));

  server.tool("tm_promote", "Promote a facet item into its own node on a board",
    { board: z.string().describe(BOARD_DESC), nodeId: z.string(), facet: z.string(), index: z.number() },
    async ({ board, nodeId, facet, index }) =>
      ok(mutate(resolveBoard(board), (b) => promoteFacetItem(b, nodeId, facet, index))));

  server.tool("tm_decompose", "Commit a full decomposition proposal in one shot on a board",
    {
      board: z.string().describe(BOARD_DESC),
      nodeId: z.string(),
      decomposition: z.array(z.object({ label: z.string(), kind: z.enum(["branch", "atom"]) })),
      edges: z.array(z.object({ fromLabel: z.string(), toLabel: z.string(), type: z.enum(["decomposition", "dependency"]) })).optional(),
      facets: z.record(z.string(), z.array(z.string())).optional(),
    },
    async ({ board, nodeId, decomposition, edges, facets }) =>
      ok(mutate(resolveBoard(board), (b) => decompose(b, nodeId, { decomposition, edges, facets }))));

  // Recursive GrowNode shape (a node may carry nested children of the same shape).
  const growNode: z.ZodType<any> = z.lazy(() => z.object({
    label: z.string(),
    kind: z.enum(["branch", "atom"]),
    facets: z.record(z.string(), z.array(z.string())).optional(),
    children: z.array(growNode).optional(),
  }));

  server.tool("tm_grow", "Create a whole nested multi-level subtree under a parent in one shot on a board",
    {
      board: z.string().describe(BOARD_DESC),
      parentId: z.string().describe("id of the node the new subtree hangs under (e.g. \"root\")"),
      nodes: z.array(growNode).describe("forest of GrowNodes {label,kind,facets?,children?}; children recurse to any depth"),
      edges: z.array(z.object({ fromLabel: z.string(), toLabel: z.string(), type: z.enum(["decomposition", "dependency"]) })).optional(),
    },
    async ({ board, parentId, nodes, edges }) =>
      ok(mutate(resolveBoard(board), (b) => growSubtree(b, parentId, { nodes, edges }))));

  return server;
}

// stdio entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.env.TM_BOARDS_DIR ?? "boards";
  const server = buildServer(dir);
  server.connect(new StdioServerTransport());
}
