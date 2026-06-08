// packages/core/test/board.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBoard, saveBoard, newBoard } from "../src/board.js";

let dir: string, file: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tm-")); file = join(dir, "board.json"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("board io", () => {
  it("round-trips a new board", () => {
    const b = newBoard("My Idea", "objective");
    saveBoard(file, b);
    const loaded = loadBoard(file);
    expect(loaded.title).toBe("My Idea");
    expect(loaded.nodes).toHaveLength(1);
    expect(loaded.nodes[0].kind).toBe("root");
  });

  it("save is atomic: no temp file left behind", () => {
    const b = newBoard("X", "cause");
    saveBoard(file, b);
    const { readdirSync } = require("node:fs");
    expect(readdirSync(dir).filter((f: string) => f.includes(".tmp"))).toHaveLength(0);
  });

  it("load migrates an unversioned file on disk", () => {
    writeFileSync(file, JSON.stringify({
      id: "b", title: "Legacy", rootId: "r",
      nodes: [{ id: "r", label: "R", kind: "root" }], edges: [],
    }));
    const loaded = loadBoard(file);
    expect(loaded.version).toBe(1);
    expect(loaded.nodes[0].facets).toEqual({});
  });
});
