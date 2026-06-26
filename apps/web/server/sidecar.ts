// apps/web/server/sidecar.ts
import express from "express";
import chokidar from "chokidar";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  boardPath, listBoards, createBoard, loadBoard, mutate,
  addNode, linkNodes, setFacet, updateNodePosition, setNodeImage, setNodeStatus, setBoardLayout,
  addSection, setSectionNote, setSectionLayout, setSectionPos, setNodeSize, setSectionSize, applyLayout,
} from "@tm/core";

export interface Sidecar {
  app: express.Express;
  listen: (port: number) => Promise<AddressInfo>;
  close: () => Promise<void>;
}

// Board ids are slugs (see core's slug()): a leading [a-z0-9] then up to 63 more
// [a-z0-9-]. This guards `:id` before it reaches boardPath()/join(), so a value
// like "../secret" or "..%2Fsecret" can never escape the boards dir.
// Board ids are filename slugs in the `<project>__<topic>` convention, so underscores
// are valid. Still no `.` / `/` / `\` — ID_RE is the only guard against path traversal.
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,127}$/;

const ROOT_TYPES = new Set(["objective", "cause", "decision", "concept"]);

export function createSidecar(dir: string): Sidecar {
  const app = express();
  app.use(express.json());
  const clients = new Set<express.Response>();

  // Validate `:id` and (when mutating) confirm the board exists. Returns the
  // resolved file path, or null after sending the appropriate error response.
  const resolveBoard = (res: express.Response, id: string, mustExist: boolean): string | null => {
    if (!ID_RE.test(id)) { res.status(400).json({ error: "bad id" }); return null; }
    const file = boardPath(dir, id);
    if (mustExist && !existsSync(file)) { res.status(404).json({ error: "no such board" }); return null; }
    return file;
  };

  // --- collection ---
  app.get("/api/boards", (_req, res) => res.json(listBoards(dir)));

  app.post("/api/boards", (req, res) => {
    const { title, rootType } = req.body ?? {};
    if (typeof title !== "string" || title.trim() === "") {
      res.status(400).json({ error: "title required" }); return;
    }
    if (typeof rootType !== "string" || !ROOT_TYPES.has(rootType)) {
      res.status(400).json({ error: "invalid rootType" }); return;
    }
    res.json({ id: createBoard(dir, title, rootType as "objective" | "cause" | "decision" | "concept") });
  });

  // --- a single board ---
  app.get("/api/boards/:id", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    res.json(loadBoard(file));
  });

  app.post("/api/boards/:id/add", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { label, parentId, kind } = req.body;
    res.json(mutate(file, (b) => addNode(b, { label, parentId, kind })));
  });
  app.post("/api/boards/:id/link", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { from, to, type, label } = req.body;
    res.json(mutate(file, (b) => linkNodes(b, from, to, type, label)));
  });
  app.post("/api/boards/:id/facet", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { nodeId, facet, items, mode } = req.body;
    res.json(mutate(file, (b) => setFacet(b, nodeId, facet, items, mode)));
  });
  app.post("/api/boards/:id/image", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { nodeId, url } = req.body ?? {};
    if (typeof nodeId !== "string" || typeof url !== "string") {
      res.status(400).json({ error: "nodeId and url required" }); return;
    }
    res.json(mutate(file, (b) => setNodeImage(b, nodeId, url)));
  });
  app.post("/api/boards/:id/status", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { nodeId, status } = req.body ?? {};
    if (typeof nodeId !== "string" || typeof status !== "string") {
      res.status(400).json({ error: "nodeId and status required" }); return;
    }
    res.json(mutate(file, (b) => setNodeStatus(b, nodeId, status as "" | "todo" | "running" | "passed" | "failed" | "blocked")));
  });
  app.post("/api/boards/:id/layout", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { layout } = req.body ?? {};
    if (typeof layout !== "string") { res.status(400).json({ error: "layout required" }); return; }
    res.json(mutate(file, (b) => setBoardLayout(b, layout as Parameters<typeof setBoardLayout>[1])));
  });
  app.post("/api/boards/:id/section", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { title, kind, layout } = req.body ?? {};
    if (typeof title !== "string" || (kind !== "graph" && kind !== "note")) {
      res.status(400).json({ error: "title and kind (graph|note) required" }); return;
    }
    res.json(mutate(file, (b) => addSection(b, { title, kind, layout })));
  });
  app.post("/api/boards/:id/note", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { sectionId, note } = req.body ?? {};
    if (typeof sectionId !== "string" || typeof note !== "string") {
      res.status(400).json({ error: "sectionId and note required" }); return;
    }
    res.json(mutate(file, (b) => setSectionNote(b, sectionId, note)));
  });
  app.post("/api/boards/:id/section-layout", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { sectionId, layout } = req.body ?? {};
    if (typeof sectionId !== "string" || typeof layout !== "string") {
      res.status(400).json({ error: "sectionId and layout required" }); return;
    }
    res.json(mutate(file, (b) => setSectionLayout(b, sectionId, layout as Parameters<typeof setSectionLayout>[2])));
  });
  app.post("/api/boards/:id/section-pos", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { sectionId, x, y } = req.body ?? {};
    if (typeof sectionId !== "string" || typeof x !== "number" || typeof y !== "number") {
      res.status(400).json({ error: "sectionId, x, y required" }); return;
    }
    res.json(mutate(file, (b) => setSectionPos(b, sectionId, x, y)));
  });
  app.post("/api/boards/:id/node-size", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { nodeId, w, h } = req.body ?? {};
    if (typeof nodeId !== "string" || typeof w !== "number" || typeof h !== "number") {
      res.status(400).json({ error: "nodeId, w, h required" }); return;
    }
    res.json(mutate(file, (b) => setNodeSize(b, nodeId, w, h)));
  });
  app.post("/api/boards/:id/section-size", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { sectionId, w, h } = req.body ?? {};
    if (typeof sectionId !== "string" || typeof w !== "number" || typeof h !== "number") {
      res.status(400).json({ error: "sectionId, w, h required" }); return;
    }
    res.json(mutate(file, (b) => setSectionSize(b, sectionId, w, h)));
  });
  app.post("/api/boards/:id/layout-bulk", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { positions, sizes, sectionPositions, sectionSizes } = req.body ?? {};
    res.json(mutate(file, (b) => applyLayout(b, { positions, sizes, sectionPositions, sectionSizes })));
  });
  app.post("/api/boards/:id/move", (req, res) => {
    const file = resolveBoard(res, req.params.id, true);
    if (!file) return;
    const { nodeId, x, y } = req.body;
    res.json(mutate(file, (b) => updateNodePosition(b, nodeId, x, y)));
  });

  app.get("/api/events", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  // Serve the built web app (production `tmind ui`): static assets + SPA fallback.
  // Registered AFTER all /api routes so the API always wins; the fallback excludes /api,
  // so unknown /api/* paths still 404 normally instead of returning index.html.
  const distDir = process.env.TM_WEB_DIST;
  if (distDir && existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(distDir, "index.html")));
  }

  // Watch the whole boards dir for *.json adds/changes/unlinks (CLI/MCP/other-tab
  // writes). Ignore our own atomic temp/lock files so we don't echo our own writes.
  const watcher = chokidar.watch(dir, {
    ignoreInitial: true,
    ignored: (p: string) => /\.(tmp|lock)$/.test(p) || /\.\d+\.tmp$/.test(p),
  });
  const broadcast = () => {
    for (const c of clients) c.write(`event: boards\ndata: {}\n\n`);
  };
  watcher.on("add", broadcast);
  watcher.on("change", broadcast);
  watcher.on("unlink", broadcast);
  // fsevents (macOS) returns from watch() before the initial scan finishes; a write
  // during that window is swallowed by ignoreInitial. Await `ready` so that once
  // listen() resolves, external edits are reliably detected.
  const ready = new Promise<void>((r) => watcher.once("ready", () => r()));

  let server: Server | undefined;
  return {
    app,
    listen: (port: number) =>
      ready.then(
        () =>
          new Promise<AddressInfo>((resolve) => {
            server = app.listen(port, () => resolve(server!.address() as AddressInfo));
          }),
      ),
    close: async () => {
      await watcher.close();
      // SSE responses keep their sockets open; end them so server.close() can resolve.
      for (const c of clients) c.end();
      clients.clear();
      await new Promise<void>((r) => server?.close(() => r()));
    },
  };
}

// Stdio entrypoint: `node --import tsx server/sidecar.ts` boots the sidecar on :8787.
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.env.TM_BOARDS_DIR ?? "boards";
  const port = Number(process.env.TM_UI_PORT ?? 8787);
  createSidecar(dir)
    .listen(port)
    .then((addr) => console.log(`Thinking Machine UI → http://localhost:${addr.port}`));
}
