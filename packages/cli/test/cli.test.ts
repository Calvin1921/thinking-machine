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
});
