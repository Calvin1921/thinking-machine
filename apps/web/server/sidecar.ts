// apps/web/server/sidecar.ts
import express from "express";
import chokidar from "chokidar";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import {
  boardPath, listBoards, createBoard, loadBoard, mutate,
  addNode, linkNodes, setFacet, updateNodePosition,
} from "@tm/core";

export interface Sidecar {
  app: express.Express;
  listen: (port: number) => Promise<AddressInfo>;
  close: () => Promise<void>;
}

export function createSidecar(dir: string): Sidecar {
  const app = express();
  app.use(express.json());
  const clients = new Set<express.Response>();

  // --- collection ---
  app.get("/api/boards", (_req, res) => res.json(listBoards(dir)));

  app.post("/api/boards", (req, res) => {
    const { title, rootType } = req.body;
    res.json({ id: createBoard(dir, title, rootType) });
  });

  // --- a single board ---
  app.get("/api/boards/:id", (req, res) => {
    const file = boardPath(dir, req.params.id);
    if (!existsSync(file)) { res.status(404).json({ error: "no such board" }); return; }
    res.json(loadBoard(file));
  });

  app.post("/api/boards/:id/add", (req, res) => {
    const { label, parentId, kind } = req.body;
    res.json(mutate(boardPath(dir, req.params.id), (b) => addNode(b, { label, parentId, kind })));
  });
  app.post("/api/boards/:id/link", (req, res) => {
    const { from, to, type } = req.body;
    res.json(mutate(boardPath(dir, req.params.id), (b) => linkNodes(b, from, to, type)));
  });
  app.post("/api/boards/:id/facet", (req, res) => {
    const { nodeId, facet, items, mode } = req.body;
    res.json(mutate(boardPath(dir, req.params.id), (b) => setFacet(b, nodeId, facet, items, mode)));
  });
  app.post("/api/boards/:id/move", (req, res) => {
    const { nodeId, x, y } = req.body;
    res.json(mutate(boardPath(dir, req.params.id), (b) => updateNodePosition(b, nodeId, x, y)));
  });

  app.get("/api/events", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

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
  createSidecar(dir).listen(8787).then(() => console.log("sidecar on :8787"));
}
