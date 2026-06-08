// apps/web/server/sidecar.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newBoard, createBoard, boardPath } from "@tm/core";
import { createSidecar } from "./sidecar.js";

let dir: string, server: ReturnType<typeof createSidecar>, base: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "tm-side-"));
  server = createSidecar(dir);
  const addr = await server.listen(0);
  base = `http://127.0.0.1:${addr.port}`;
});
afterEach(async () => { await server.close(); rmSync(dir, { recursive: true, force: true }); });

const json = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("sidecar", () => {
  it("GET /api/boards lists created boards", async () => {
    createBoard(dir, "App", "objective");
    const list = await (await fetch(`${base}/api/boards`)).json();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("App");
  });

  it("POST /api/boards creates a board file and returns its id", async () => {
    const { id } = await (await json("/api/boards", { title: "New Idea", rootType: "decision" })).json();
    expect(id).toBe("new-idea");
    expect(existsSync(boardPath(dir, id))).toBe(true);
  });

  it("GET /api/boards/:id returns the board, 404 when missing", async () => {
    const id = createBoard(dir, "App", "objective");
    const b = await (await fetch(`${base}/api/boards/${id}`)).json();
    expect(b.title).toBe("App");
    expect((await fetch(`${base}/api/boards/missing`)).status).toBe(404);
  });

  it("POST /api/boards/:id/add mutates that board through core", async () => {
    const id = createBoard(dir, "App", "objective");
    await json(`/api/boards/${id}/add`, { label: "FE", parentId: "root", kind: "branch" });
    const b = await (await fetch(`${base}/api/boards/${id}`)).json();
    expect(b.nodes.map((n: any) => n.label)).toContain("FE");
  });

  it("emits an SSE 'boards' event when a board file in the dir changes externally", async () => {
    const id = createBoard(dir, "App", "objective");
    const events: string[] = [];
    const es = await fetch(`${base}/api/events`);
    const reader = es.body!.getReader();
    const read = (async () => {
      const { value } = await reader.read();
      events.push(new TextDecoder().decode(value));
    })();
    // external edit (simulating CLI/MCP writing a board file in the dir)
    writeFileSync(boardPath(dir, id), JSON.stringify(newBoard("Changed", "cause", id), null, 2));
    await new Promise((r) => setTimeout(r, 400));
    await read.catch(() => {});
    reader.cancel();
    expect(events.join("")).toContain("event: boards");
  });
});
