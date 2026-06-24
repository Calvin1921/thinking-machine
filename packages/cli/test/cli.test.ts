// packages/cli/test/cli.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(__dirname, "../dist/index.js");
let dir: string, board: string, boardsDir: string;
const run = (args: string[]) =>
  execFileSync("node", [CLI, "--file", board, ...args], { encoding: "utf8" });
const runDir = (args: string[]) =>
  execFileSync("node", [CLI, "--dir", boardsDir, ...args], { encoding: "utf8" });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tm-cli-"));
  board = join(dir, "board.json");
  boardsDir = join(dir, "boards");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("tm cli", () => {
  it("init creates a board with one root", () => {
    run(["init", "My Plan", "--root-type", "objective"]);
    const b = JSON.parse(readFileSync(board, "utf8"));
    expect(b.title).toBe("My Plan");
    expect(b.nodes).toHaveLength(1);
  });

  it("add + show --json reflects the new node", () => {
    run(["init", "App", "--root-type", "objective"]);
    run(["add", "Frontend", "--parent", "root", "--kind", "branch"]);
    const out = JSON.parse(run(["show", "--json"]));
    expect(out.nodes.map((n: any) => n.label)).toContain("Frontend");
  });

  it("image attaches a url shown by show --json", () => {
    run(["init", "App", "--root-type", "objective"]);
    run(["add", "Frontend", "--parent", "root", "--kind", "branch"]);
    const fe = JSON.parse(run(["show", "--json"])).nodes.find((n: any) => n.label === "Frontend").id;
    run(["image", fe, "https://example.com/x.png"]);
    const node = JSON.parse(run(["show", "--node", fe]));
    expect(node.image).toBe("https://example.com/x.png");
  });

  it("decompose commits a JSON proposal", () => {
    run(["init", "App", "--root-type", "objective"]);
    const proposal = JSON.stringify({
      decomposition: [{ label: "FE", kind: "branch" }, { label: "BE", kind: "branch" }],
      edges: [{ fromLabel: "FE", toLabel: "BE", type: "dependency" }],
      facets: { considerations: ["scope creep"] },
    });
    run(["decompose", "root", "--json", proposal]);
    const b = JSON.parse(readFileSync(board, "utf8"));
    expect(b.nodes).toHaveLength(3);
    expect(b.edges.some((e: any) => e.type === "dependency")).toBe(true);
  });

  it("grow commits a nested subtree from JSON", () => {
    run(["init", "App", "--root-type", "objective"]);
    const input = JSON.stringify({
      nodes: [
        { label: "A", kind: "branch", children: [{ label: "B", kind: "atom" }] },
        { label: "C", kind: "branch" },
      ],
      edges: [{ fromLabel: "C", toLabel: "A", type: "dependency" }],
    });
    run(["grow", "root", "--json", input]);
    const out = JSON.parse(run(["show", "--json"]));
    expect(out.nodes.map((n: any) => n.label).sort()).toEqual(["A", "App", "B", "C"]);
    const id = (label: string) => out.nodes.find((n: any) => n.label === label).id;
    expect(out.edges).toContainEqual({ from: "root", to: id("A"), type: "decomposition" });
    expect(out.edges).toContainEqual({ from: id("A"), to: id("B"), type: "decomposition" });
    expect(out.edges).toContainEqual({ from: id("C"), to: id("A"), type: "dependency" });
  });

  it("new creates a board in --dir and ls --json reflects it", () => {
    const id = runDir(["new", "Research Plan", "--root-type", "decision"]).trim();
    expect(id).toBe("research-plan");

    const list = JSON.parse(runDir(["ls", "--json"]));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "research-plan", title: "Research Plan", rootType: "decision", nodeCount: 1 });

    // a second board with the same title gets a distinct id
    const id2 = runDir(["new", "Research Plan", "--root-type", "decision"]).trim();
    expect(id2).toBe("research-plan-2");
    expect(JSON.parse(runDir(["ls", "--json"]))).toHaveLength(2);
  });

  it("provenance sets a node's badge shown by show --node", () => {
    run(["init", "App", "--root-type", "objective"]);
    run(["provenance", "root", "drafted"]);
    const node = JSON.parse(run(["show", "--node", "root"]));
    expect(node.provenance).toBe("drafted");
  });

  it("guide on sets the board flag", () => {
    run(["init", "App", "--root-type", "objective"]);
    run(["guide", "on"]);
    const b = JSON.parse(readFileSync(board, "utf8"));
    expect(b.guideMode).toBe(true);
  });

  it("collisions reports proposed labels matching existing nodes", () => {
    run(["init", "App", "--root-type", "objective"]);
    run(["add", "Frontend", "--parent", "root", "--kind", "branch"]);
    const hits = JSON.parse(run(["collisions", "--labels", "frontend,Backend"]));
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe("frontend");
  });
});
