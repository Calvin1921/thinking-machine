import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/index.js";

let dir: string, board: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tm-mcp-")); board = join(dir, "board.json"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = buildServer(board);
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("mcp tools", () => {
  it("tm_init then tm_add creates nodes", async () => {
    const c = await connect();
    await c.callTool({ name: "tm_init", arguments: { title: "App", rootType: "objective" } });
    await c.callTool({ name: "tm_add_node", arguments: { label: "FE", parentId: "root", kind: "branch" } });
    const b = JSON.parse(readFileSync(board, "utf8"));
    expect(b.nodes.map((n: any) => n.label)).toContain("FE");
  });

  it("tm_decompose commits a proposal", async () => {
    const c = await connect();
    await c.callTool({ name: "tm_init", arguments: { title: "App", rootType: "objective" } });
    await c.callTool({ name: "tm_decompose", arguments: {
      nodeId: "root",
      decomposition: [{ label: "FE", kind: "branch" }, { label: "BE", kind: "branch" }],
    }});
    const b = JSON.parse(readFileSync(board, "utf8"));
    expect(b.nodes).toHaveLength(3);
  });
});
