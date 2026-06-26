// packages/core/test/board.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBoard, saveBoard, newBoard, mutate } from "../src/board.js";
import { addNode, setNodeDescription } from "../src/ops.js";

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
    expect(readdirSync(dir).filter((f: string) => f.includes(".tmp"))).toHaveLength(0);
  });

  it("load migrates an unversioned file and folds legacy facets into description", () => {
    writeFileSync(file, JSON.stringify({
      id: "b", title: "Legacy", rootId: "r",
      nodes: [{ id: "r", label: "R", kind: "root", facets: { definition: ["the core"], risks: ["a", "b"] } }],
      edges: [],
    }));
    const loaded = loadBoard(file);
    expect(loaded.version).toBe(1);
    expect(loaded.nodes[0]).not.toHaveProperty("facets");   // old field dropped
    expect(loaded.nodes[0].description).toBe("the core\nrisks: a; b");  // folded, nothing lost
  });
});

describe("mutate / withLock", () => {
  it("applies fn's changes and persists them to disk", () => {
    saveBoard(file, newBoard("Idea", "objective"));
    const returned = mutate(file, (b) => addNode(b, { label: "Step one", parentId: "root", kind: "branch" }));
    expect(returned.nodes.map((n) => n.label)).toContain("Step one");
    // The change must be on disk, not just in the returned value.
    const onDisk = loadBoard(file);
    expect(onDisk.nodes.map((n) => n.label)).toContain("Step one");
    expect(onDisk.nodes).toHaveLength(2);
  });

  it("composes sequential mutations: the second sees the first's result", () => {
    saveBoard(file, newBoard("Idea", "objective"));
    mutate(file, (b) => addNode(b, { label: "Step", parentId: "root", kind: "atom" }));
    mutate(file, (b) => setNodeDescription(b, "root", "second mutation"));
    const onDisk = loadBoard(file);
    expect(onDisk.nodes).toHaveLength(2);                       // first mutation persisted
    expect(onDisk.nodes[0].description).toBe("second mutation"); // second saw + extended it
  });
});
