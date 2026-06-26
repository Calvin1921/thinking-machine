// packages/mcp/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  boardPath, listBoards, createBoard, loadBoard, mutate,
  addNode, linkNodes, setFacet, promoteFacetItem, decompose, setNodeImage, setNodeStatus, setBoardLayout,
  addSection, setSectionNote, setSectionLayout, growSubtree,
  setNodeProvenance, setGuideMode, detectCollisions,
  setVerification, markStale, cacheSubtree, lookupCache, setNodeRationale, lookupCacheEntry,
  setAltFraming,
} from "@tm/core";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

// Board ids are slugs (see core's slug()): a leading [a-z0-9] then up to 63 more
// [a-z0-9-]. Guards `board` before it reaches boardPath()/join(), so a value like
// "../secret" can never escape the boards dir. Mirrors the web sidecar's ID_RE.
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const BOARD_DESC = "the board id from tm_list_boards / tm_create_board";

export function buildServer(dir: string): McpServer {
  const server = new McpServer({ name: "thinking-machine", version: "0.1.0" });
  const libDir = join(dir, "library");

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

  server.tool("tm_link", "Add an edge between two nodes on a board. Give dependency edges a label verb — a labeled link reads as a proposition (A —blocks→ B)",
    { board: z.string().describe(BOARD_DESC), from: z.string(), to: z.string(), type: z.enum(["decomposition", "dependency"]), label: z.string().optional().describe("relationship verb shown on the edge, e.g. 'blocks', 'feeds', 'causes'") },
    async ({ board, from, to, type, label }) =>
      ok(mutate(resolveBoard(board), (b) => linkNodes(b, from, to, type, label))));

  server.tool("tm_set_facet", "Set or add items to a node facet on a board",
    { board: z.string().describe(BOARD_DESC), nodeId: z.string(), facet: z.string(), items: z.array(z.string()), mode: z.enum(["set", "add"]) },
    async ({ board, nodeId, facet, items, mode }) =>
      ok(mutate(resolveBoard(board), (b) => setFacet(b, nodeId, facet, items, mode))));

  server.tool("tm_set_image", "Attach an optional image url to a node on a board (empty url clears it)",
    { board: z.string().describe(BOARD_DESC), nodeId: z.string(), url: z.string().describe("image URL, or empty string to clear") },
    async ({ board, nodeId, url }) =>
      ok(mutate(resolveBoard(board), (b) => setNodeImage(b, nodeId, url))));

  server.tool("tm_set_status", "Set a node's probe/work status on a board; colors the node on the canvas (empty string clears)",
    { board: z.string().describe(BOARD_DESC), nodeId: z.string(), status: z.enum(["todo", "running", "passed", "failed", "blocked", ""]).describe("one of todo|running|passed|failed|blocked, or empty to clear") },
    async ({ board, nodeId, status }) =>
      ok(mutate(resolveBoard(board), (b) => setNodeStatus(b, nodeId, status))));

  server.tool("tm_set_layout", "Set how the canvas lays out a board: 'tree' (default), 'funnel' (sequential stages), 'grid' (tight 2D matrix), 'timeline' (swimlane rows × left→right columns, Gantt-style), 'radial' (ecosystem map — root in the center, one angular sector per top-level child, rings by depth), or 'concentric' (nested layers — root at the center, every node at the same depth evenly on one shared ring, emphasizing core→outer layers)",
    { board: z.string().describe(BOARD_DESC), layout: z.enum(["tree", "funnel", "grid", "timeline", "radial", "concentric"]) },
    async ({ board, layout }) =>
      ok(mutate(resolveBoard(board), (b) => setBoardLayout(b, layout))));

  server.tool("tm_add_section",
    "Add a section to a board — a self-contained view for one purpose (the 'nothing explains in one graph' idea). " +
    "kind 'graph' gets its own root node (grow under it via tm_grow) and its own layout; kind 'note' holds free text. Returns the new section id.",
    {
      board: z.string().describe(BOARD_DESC),
      title: z.string(),
      kind: z.enum(["graph", "note"]),
      layout: z.enum(["tree", "funnel"]).optional().describe("graph sections only"),
    },
    async ({ board, title, kind, layout }) => {
      const b = mutate(resolveBoard(board), (bb) => addSection(bb, { title, kind, layout }));
      const s = b.sections!.at(-1)!;
      return ok({ id: s.id, rootId: s.rootId });   // rootId is where you tm_grow for graph sections
    });

  server.tool("tm_set_note", "Set the text body of a note section on a board",
    { board: z.string().describe(BOARD_DESC), sectionId: z.string(), note: z.string() },
    async ({ board, sectionId, note }) =>
      ok(mutate(resolveBoard(board), (b) => setSectionNote(b, sectionId, note))));

  server.tool("tm_set_section_layout", "Set a graph section's layout on a board: tree|funnel|grid|timeline|radial|concentric",
    { board: z.string().describe(BOARD_DESC), sectionId: z.string(), layout: z.enum(["tree", "funnel", "grid", "timeline", "radial", "concentric"]) },
    async ({ board, sectionId, layout }) =>
      ok(mutate(resolveBoard(board), (b) => setSectionLayout(b, sectionId, layout))));

  server.tool("tm_promote", "Promote a facet item into its own node on a board",
    { board: z.string().describe(BOARD_DESC), nodeId: z.string(), facet: z.string(), index: z.number() },
    async ({ board, nodeId, facet, index }) =>
      ok(mutate(resolveBoard(board), (b) => promoteFacetItem(b, nodeId, facet, index))));

  server.tool("tm_decompose", "Commit a full decomposition proposal in one shot on a board",
    {
      board: z.string().describe(BOARD_DESC),
      nodeId: z.string(),
      decomposition: z.array(z.object({ label: z.string(), kind: z.enum(["branch", "atom"]) })),
      edges: z.array(z.object({ fromLabel: z.string(), toLabel: z.string(), type: z.enum(["decomposition", "dependency"]), label: z.string().optional().describe("relationship verb shown on the edge") })).optional(),
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
      edges: z.array(z.object({ fromLabel: z.string(), toLabel: z.string(), type: z.enum(["decomposition", "dependency"]), label: z.string().optional().describe("relationship verb shown on the edge") })).optional(),
    },
    async ({ board, parentId, nodes, edges }) =>
      ok(mutate(resolveBoard(board), (b) => growSubtree(b, parentId, { nodes, edges }))));

  server.tool("tm_set_provenance", "Set a node's content provenance/trust badge (empty clears)",
    { board: z.string().describe(BOARD_DESC), nodeId: z.string(), provenance: z.enum(["drafted", "verified", "refuted", "informed-opinion", "stale", ""]).describe("one of drafted|verified|refuted|informed-opinion|stale, or empty to clear") },
    async ({ board, nodeId, provenance }) =>
      ok(mutate(resolveBoard(board), (b) => setNodeProvenance(b, nodeId, provenance))));

  server.tool("tm_set_alt_framing", "Pathfinder: set the alternative framing (the road not taken). Empty layout clears. divergence 0..1; the canvas surfaces it only when >= 0.35.",
    { board: z.string().describe(BOARD_DESC),
      layout: z.enum(["tree", "funnel", "grid", "timeline", "radial", "concentric", ""]).describe("alternative representation, or empty to clear"),
      intent: z.string().optional().describe("the main idea that would justify this alternative"),
      divergence: z.number().min(0).max(1).optional() },
    async ({ board, layout, intent, divergence }) =>
      ok(mutate(resolveBoard(board), (b) => layout === ""
        ? setAltFraming(b, null)
        : setAltFraming(b, { layout, intent: intent ?? "", divergence: divergence ?? 0.5 }))));

  server.tool("tm_set_guide", "Turn the Guide posture on/off for the board",
    { board: z.string().describe(BOARD_DESC), on: z.boolean() },
    async ({ board, on }) =>
      ok(mutate(resolveBoard(board), (b) => setGuideMode(b, on))));

  server.tool("tm_collisions", "List proposed labels that collide with existing node labels (drives duplicate-resolution)",
    { board: z.string().describe(BOARD_DESC), labels: z.array(z.string()) },
    async ({ board, labels }) => {
      const b = loadBoard(resolveBoard(board));
      return ok(detectCollisions(b, labels));
    });

  server.tool("tm_verify", "Record a verification result on a node (provenance + optional sources/contentKind/volatility). Omit 'at' to stamp now.",
    { board: z.string().describe(BOARD_DESC), nodeId: z.string(),
      provenance: z.enum(["drafted", "verified", "refuted", "informed-opinion", "stale"]),
      contentKind: z.enum(["factual", "subjective"]).optional(),
      sources: z.array(z.string()).optional(),
      volatility: z.enum(["static", "weeks", "volatile"]).optional(),
      at: z.string().optional().describe("ISO timestamp; defaults to now") },
    async ({ board, nodeId, provenance, contentKind, sources, volatility, at }) =>
      ok(mutate(resolveBoard(board), (b) => setVerification(b, nodeId, {
        provenance, contentKind, sources, volatility, verifiedAt: at ?? new Date().toISOString(),
      }))));

  server.tool("tm_refresh_stale", "Downgrade verified nodes past their TTL to 'stale'. Omit 'at' for now.",
    { board: z.string().describe(BOARD_DESC), at: z.string().optional() },
    async ({ board, at }) =>
      ok(mutate(resolveBoard(board), (b) => markStale(b, at ?? new Date().toISOString()))));

  server.tool("tm_cache_put", "Store a verified subtree payload in the library under a topic",
    { board: z.string().describe(BOARD_DESC), topic: z.string(), payload: z.unknown(), context: z.string().optional() },
    async ({ board, topic, payload, context }) => { resolveBoard(board); cacheSubtree(libDir, topic, payload, context); return ok({ cached: topic }); });

  server.tool("tm_cache_get", "Read the cached payload for a topic (or null)",
    { board: z.string().describe(BOARD_DESC), topic: z.string() },
    async ({ board, topic }) => { resolveBoard(board); return ok(lookupCache(libDir, topic)); });

  server.tool("tm_set_rationale", "Set a node's 'pick this if X' rationale (empty string clears)",
    { board: z.string().describe(BOARD_DESC), nodeId: z.string(), text: z.string() },
    async ({ board, nodeId, text }) =>
      ok(mutate(resolveBoard(board), (b) => setNodeRationale(b, nodeId, text))));

  server.tool("tm_cache_entry", "Read the cached entry {context, payload} for a topic (or null)",
    { board: z.string().describe(BOARD_DESC), topic: z.string() },
    async ({ board, topic }) => { resolveBoard(board); return ok(lookupCacheEntry(libDir, topic)); });

  return server;
}

// stdio entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.env.TM_BOARDS_DIR ?? "boards";
  const server = buildServer(dir);
  server.connect(new StdioServerTransport());
}
