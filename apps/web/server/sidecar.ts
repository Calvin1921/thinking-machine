// apps/web/server/sidecar.ts
import express from "express";
import chokidar from "chokidar";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { loadBoard, mutate, addNode, linkNodes, setFacet, updateNodePosition } from "@tm/core";

export interface Sidecar {
  app: express.Express;
  listen: (port: number) => Promise<AddressInfo>;
  close: () => Promise<void>;
}

export function createSidecar(file: string): Sidecar {
  const app = express();
  app.use(express.json());
  const clients = new Set<express.Response>();

  app.get("/api/board", (_req, res) => res.json(loadBoard(file)));

  app.post("/api/add", (req, res) => {
    const b = mutate(file, (board) => addNode(board, req.body));
    res.json(b);
  });
  app.post("/api/link", (req, res) => {
    const { from, to, type } = req.body;
    res.json(mutate(file, (board) => linkNodes(board, from, to, type)));
  });
  app.post("/api/facet", (req, res) => {
    const { nodeId, facet, items, mode } = req.body;
    res.json(mutate(file, (board) => setFacet(board, nodeId, facet, items, mode)));
  });
  app.post("/api/move", (req, res) => {
    const { nodeId, x, y } = req.body;
    res.json(mutate(file, (board) => updateNodePosition(board, nodeId, x, y)));
  });

  app.get("/api/events", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  // Broadcast on external file changes (CLI/MCP writes). Ignore our own atomic temp files.
  const watcher = chokidar.watch(file, { ignoreInitial: true });
  const broadcast = () => {
    for (const c of clients) c.write(`event: board\ndata: {}\n\n`);
  };
  watcher.on("change", broadcast);
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
  const file = process.env.TM_BOARD ?? "board.json";
  createSidecar(file).listen(8787).then(() => console.log("sidecar on :8787"));
}
