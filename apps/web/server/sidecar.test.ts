// apps/web/server/sidecar.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newBoard, saveBoard } from "@tm/core";
import { createSidecar } from "./sidecar.js";

let dir: string, board: string, server: ReturnType<typeof createSidecar>, base: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "tm-side-"));
  board = join(dir, "board.json");
  saveBoard(board, newBoard("App", "objective"));
  server = createSidecar(board);
  const addr = await server.listen(0);
  base = `http://127.0.0.1:${addr.port}`;
});
afterEach(async () => { await server.close(); rmSync(dir, { recursive: true, force: true }); });

describe("sidecar", () => {
  it("GET /api/board returns the board", async () => {
    const res = await fetch(`${base}/api/board`);
    const b = await res.json();
    expect(b.title).toBe("App");
  });

  it("POST /api/add adds a node through core", async () => {
    await fetch(`${base}/api/add`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "FE", parentId: "root", kind: "branch" }),
    });
    const b = await (await fetch(`${base}/api/board`)).json();
    expect(b.nodes.map((n: any) => n.label)).toContain("FE");
  });

  it("emits an SSE 'board' event when the file changes externally", async () => {
    const events: string[] = [];
    const es = await fetch(`${base}/api/events`);
    const reader = es.body!.getReader();
    const read = (async () => {
      const { value } = await reader.read();
      events.push(new TextDecoder().decode(value));
    })();
    // external edit (simulating CLI/MCP writing the file)
    const b = newBoard("Changed", "cause");
    writeFileSync(board, JSON.stringify(b, null, 2));
    await new Promise((r) => setTimeout(r, 300));
    await read.catch(() => {});
    reader.cancel();
    expect(events.join("")).toContain("event: board");
  });
});
