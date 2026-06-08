import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/index.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tm-mcp-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = buildServer(dir);
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

// MCP tool results carry their payload as text in content[0]; unwrap it back to JSON.
function payload(res: any) {
  return JSON.parse(res.content[0].text);
}

describe("mcp tools", () => {
  it("tm_create_board then tm_add_node creates nodes on disk", async () => {
    const c = await connect();
    const { id } = payload(await c.callTool({
      name: "tm_create_board", arguments: { title: "App", rootType: "objective" },
    }));
    await c.callTool({ name: "tm_add_node", arguments: { board: id, label: "FE", parentId: "root", kind: "branch" } });
    const b = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8"));
    expect(b.nodes.map((n: any) => n.label)).toContain("FE");
  });

  it("tm_decompose commits a proposal on the named board", async () => {
    const c = await connect();
    const { id } = payload(await c.callTool({
      name: "tm_create_board", arguments: { title: "App", rootType: "objective" },
    }));
    await c.callTool({ name: "tm_decompose", arguments: {
      board: id,
      nodeId: "root",
      decomposition: [{ label: "FE", kind: "branch" }, { label: "BE", kind: "branch" }],
    }});
    const b = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8"));
    expect(b.nodes).toHaveLength(3);
  });

  it("tm_set_image attaches an image url shown by tm_show", async () => {
    const c = await connect();
    const { id } = payload(await c.callTool({
      name: "tm_create_board", arguments: { title: "App", rootType: "objective" },
    }));
    await c.callTool({ name: "tm_add_node", arguments: { board: id, label: "FE", parentId: "root", kind: "branch" } });
    const board = payload(await c.callTool({ name: "tm_show", arguments: { board: id } }));
    const fe = board.nodes.find((n: any) => n.label === "FE").id;
    await c.callTool({ name: "tm_set_image", arguments: { board: id, nodeId: fe, url: "https://example.com/x.png" } });
    const node = payload(await c.callTool({ name: "tm_show", arguments: { board: id, nodeId: fe } }));
    expect(node.image).toBe("https://example.com/x.png");
  });

  it("tm_list_boards returns the created boards", async () => {
    const c = await connect();
    const { id } = payload(await c.callTool({
      name: "tm_create_board", arguments: { title: "App", rootType: "objective" },
    }));
    const boards = payload(await c.callTool({ name: "tm_list_boards", arguments: {} }));
    expect(boards.map((b: any) => b.id)).toContain(id);
  });

  it("tm_grow commits a nested subtree on the named board", async () => {
    const c = await connect();
    const { id } = payload(await c.callTool({
      name: "tm_create_board", arguments: { title: "App", rootType: "objective" },
    }));
    await c.callTool({ name: "tm_grow", arguments: {
      board: id,
      parentId: "root",
      nodes: [
        { label: "A", kind: "branch", children: [{ label: "B", kind: "atom", facets: { definition: ["b def"] } }] },
        { label: "C", kind: "branch" },
      ],
      edges: [{ fromLabel: "C", toLabel: "A", type: "dependency" }],
    }});
    const b = payload(await c.callTool({ name: "tm_show", arguments: { board: id } }));
    expect(b.nodes.map((n: any) => n.label).sort()).toEqual(["A", "App", "B", "C"]);
    const nid = (label: string) => b.nodes.find((n: any) => n.label === label).id;
    expect(b.edges).toContainEqual({ from: "root", to: nid("A"), type: "decomposition" });
    expect(b.edges).toContainEqual({ from: nid("A"), to: nid("B"), type: "decomposition" });
    expect(b.edges).toContainEqual({ from: nid("C"), to: nid("A"), type: "dependency" });
    expect(b.nodes.find((n: any) => n.label === "B").facets.definition).toEqual(["b def"]);
  });

  it("tm_show with a bad board id returns an isError result", async () => {
    const c = await connect();
    const res: any = await c.callTool({ name: "tm_show", arguments: { board: "../etc" } });
    expect(res.isError).toBe(true);
  });
});
