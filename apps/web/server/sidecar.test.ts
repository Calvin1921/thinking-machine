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

  it("returns baseline security headers", async () => {
    const response = await fetch(`${base}/api/boards`);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves the built web app from TM_WEB_DIST (static + SPA fallback, API still wins)", async () => {
    const distDir = mkdtempSync(join(tmpdir(), "tm-dist-"));
    writeFileSync(join(distDir, "index.html"), "<!doctype html><title>TM</title>");
    const prev = process.env.TM_WEB_DIST;
    process.env.TM_WEB_DIST = distDir;
    const boardsDir = mkdtempSync(join(tmpdir(), "tm-side2-"));
    const s = createSidecar(boardsDir);
    const addr = await s.listen(0);
    const b = `http://127.0.0.1:${addr.port}`;
    try {
      // SPA fallback returns index.html for a non-API client route
      expect(await (await fetch(`${b}/some/client/route`)).text()).toContain("<title>TM</title>");
      // API still resolves (registered before the static fallback)
      expect((await fetch(`${b}/api/boards`)).status).toBe(200);
      // unknown /api path still 404s — the fallback excludes /api
      expect((await fetch(`${b}/api/nope`)).status).toBe(404);
    } finally {
      await s.close();
      rmSync(distDir, { recursive: true, force: true });
      rmSync(boardsDir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.TM_WEB_DIST; else process.env.TM_WEB_DIST = prev;
    }
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

  it("POST /api/boards/:id/image attaches an image url to a node", async () => {
    const id = createBoard(dir, "App", "objective");
    await json(`/api/boards/${id}/add`, { label: "FE", parentId: "root", kind: "branch" });
    const before = await (await fetch(`${base}/api/boards/${id}`)).json();
    const fe = before.nodes.find((n: any) => n.label === "FE").id;
    await json(`/api/boards/${id}/image`, { nodeId: fe, url: "https://example.com/x.png" });
    const after = await (await fetch(`${base}/api/boards/${id}`)).json();
    expect(after.nodes.find((n: any) => n.id === fe).image).toBe("https://example.com/x.png");
    // missing fields → 400
    expect((await json(`/api/boards/${id}/image`, { nodeId: fe })).status).toBe(400);
  });

  it("rejects a path-traversal id with 400 and reads nothing outside the dir", async () => {
    const res = await fetch(`${base}/api/boards/${encodeURIComponent("../package")}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad id" });
  });

  it("POST to a mutation endpoint on a nonexistent board returns 404", async () => {
    const res = await json("/api/boards/ghost/add", { label: "X", parentId: "root", kind: "branch" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no such board" });
  });

  it("POST /api/boards validates the body", async () => {
    expect((await json("/api/boards", {})).status).toBe(400);
    expect((await json("/api/boards", { title: "  ", rootType: "objective" })).status).toBe(400);
    expect((await json("/api/boards", { title: "Valid", rootType: "bogus" })).status).toBe(400);
    const ok = await json("/api/boards", { title: "Valid", rootType: "objective" });
    expect(ok.status).toBe(200);
    const list = await (await fetch(`${base}/api/boards`)).json();
    expect(list.map((b: any) => b.title)).toContain("Valid");
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
