// packages/mcp/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync } from "node:fs";
import { z } from "zod";
import {
  newBoard, loadBoard, saveBoard, mutate,
  addNode, linkNodes, setFacet, promoteFacetItem, decompose,
} from "@tm/core";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

export function buildServer(file: string): McpServer {
  const server = new McpServer({ name: "thinking-machine", version: "0.1.0" });

  server.tool("tm_init", "Create a new board",
    { title: z.string(), rootType: z.enum(["objective", "cause", "decision", "concept"]) },
    async ({ title, rootType }) => {
      if (existsSync(file)) throw new Error(`${file} already exists`);
      saveBoard(file, newBoard(title, rootType));
      return ok({ created: true });
    });

  server.tool("tm_show", "Read the whole board or one node",
    { nodeId: z.string().optional() },
    async ({ nodeId }) => {
      const b = loadBoard(file);
      return ok(nodeId ? b.nodes.find((n) => n.id === nodeId) : b);
    });

  server.tool("tm_add_node", "Add a child node under a parent",
    { label: z.string(), parentId: z.string(), kind: z.enum(["branch", "atom"]) },
    async (a) => ok(mutate(file, (b) => addNode(b, a))));

  server.tool("tm_link", "Add an edge between two nodes",
    { from: z.string(), to: z.string(), type: z.enum(["decomposition", "dependency"]) },
    async ({ from, to, type }) => ok(mutate(file, (b) => linkNodes(b, from, to, type))));

  server.tool("tm_set_facet", "Set or add items to a node facet",
    { nodeId: z.string(), facet: z.string(), items: z.array(z.string()), mode: z.enum(["set", "add"]) },
    async ({ nodeId, facet, items, mode }) => ok(mutate(file, (b) => setFacet(b, nodeId, facet, items, mode))));

  server.tool("tm_promote", "Promote a facet item into its own node",
    { nodeId: z.string(), facet: z.string(), index: z.number() },
    async ({ nodeId, facet, index }) => ok(mutate(file, (b) => promoteFacetItem(b, nodeId, facet, index))));

  server.tool("tm_decompose", "Commit a full decomposition proposal in one shot",
    {
      nodeId: z.string(),
      decomposition: z.array(z.object({ label: z.string(), kind: z.enum(["branch", "atom"]) })),
      edges: z.array(z.object({ fromLabel: z.string(), toLabel: z.string(), type: z.enum(["decomposition", "dependency"]) })).optional(),
      facets: z.record(z.string(), z.array(z.string())).optional(),
    },
    async ({ nodeId, decomposition, edges, facets }) =>
      ok(mutate(file, (b) => decompose(b, nodeId, { decomposition, edges, facets }))));

  return server;
}

// stdio entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.env.TM_BOARD ?? "board.json";
  const server = buildServer(file);
  server.connect(new StdioServerTransport());
}
