import { describe, it, expect } from "vitest";
import { newBoard } from "../src/board.js";
import { addNode } from "../src/ops.js";
import { growContext, buildJudgePrompt, runGrowFlow, parseJudgeResult, type Judge } from "../src/judge.js";

describe("judge port", () => {
  it("growContext gathers label, rootType, ancestor path and domainHint from the board", () => {
    let b = newBoard("Ship the app", "decision");
    b = { ...b, domainHint: "petopia" };
    b = addNode(b, { label: "Frontend", parentId: "root", kind: "branch" });
    const child = b.nodes.find((n) => n.label === "Frontend")!;
    const ctx = growContext(b, child.id);
    expect(ctx.label).toBe("Frontend");
    expect(ctx.rootType).toBe("decision");
    expect(ctx.ancestorPath).toEqual(["Ship the app", "Frontend"]);
    expect(ctx.domainHint).toBe("petopia");
  });

  it("buildJudgePrompt embeds the heuristics + this node's context", () => {
    const prompt = buildJudgePrompt({ label: "Pricing", rootType: "decision", ancestorPath: ["Launch", "Pricing"], domainHint: "saas", recall: [] });
    expect(prompt).toContain("MECE");
    expect(prompt).toContain('ROOT: "Pricing"');
    expect(prompt).toContain("ROOT TYPE: decision");
    expect(prompt).toContain("Launch > Pricing");
  });

  it("adds the non-decision over-expansion discipline only for non-decision roots", () => {
    const concept = buildJudgePrompt({ label: "What converts", rootType: "concept", ancestorPath: ["What converts"], recall: [] });
    const decision = buildJudgePrompt({ label: "Ship or not", rootType: "decision", ancestorPath: ["Ship or not"], recall: [] });
    expect(concept).toContain("NON-DECISION discipline");
    expect(concept).toContain("ONE overall crux");
    expect(decision).not.toContain("NON-DECISION discipline");
  });

  it("runGrowFlow commits a judge's commit arm under the node", async () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "Backend", parentId: "root", kind: "branch" });
    const backend = b.nodes.find((n) => n.label === "Backend")!;
    // A deterministic judge stands in for the LLM — proves the flow is pure given a judge.
    const scripted: Judge = {
      async propose() {
        return {
          kind: "commit" as const,
          nodes: [
            { label: "API", kind: "atom" as const, description: "the http surface" },
            { label: "DB", kind: "atom" as const, description: "persistence" },
          ],
          edges: [{ fromLabel: "API", toLabel: "DB", type: "dependency" as const, label: "reads" }],
        };
      },
    };
    const { board: next, result } = await runGrowFlow(b, backend.id, scripted);
    expect(result.kind).toBe("commit");
    const api = next.nodes.find((n) => n.label === "API")!;
    const db = next.nodes.find((n) => n.label === "DB")!;
    expect(api && db).toBeTruthy();
    // children hang off Backend by decomposition; the cross-link is a dependency
    expect(next.edges).toContainEqual({ from: backend.id, to: api.id, type: "decomposition" });
    expect(next.edges).toContainEqual({ from: api.id, to: db.id, type: "dependency", label: "reads" });
  });

  it("runGrowFlow records a judge's gap arm on the node instead of inventing children", async () => {
    let b = newBoard("Grow revenue", "objective");
    b = addNode(b, { label: "Pricing", parentId: "root", kind: "branch" });
    const pricing = b.nodes.find((n) => n.label === "Pricing")!;
    const honest: Judge = {
      async propose() {
        return { kind: "gap" as const, gap: { kind: "reality" as const, question: "What do current users pay today?" } };
      },
    };
    const { board: next, result } = await runGrowFlow(b, pricing.id, honest);
    expect(result.kind).toBe("gap");
    const after = next.nodes.find((n) => n.id === pricing.id)!;
    expect(after.gap).toEqual({ kind: "reality", question: "What do current users pay today?" });
    // no children were fabricated
    expect(next.nodes).toHaveLength(b.nodes.length);
  });

  it("parseJudgeResult strict-parses raw judge JSON and accepts the legacy bare {nodes} shape as a commit", () => {
    const legacy = parseJudgeResult({ nodes: [{ label: "A", kind: "atom" }] });
    expect(legacy.kind).toBe("commit");
    const gap = parseJudgeResult({ kind: "gap", gap: { kind: "structure", question: "Which parts?" } });
    expect(gap.kind).toBe("gap");
    expect(() => parseJudgeResult({ kind: "commit", nodes: [{ label: "", kind: "atom" }] })).toThrow();
    expect(() => parseJudgeResult("prose, not an object")).toThrow();
  });

  it("buildJudgePrompt carries the commit-or-gap contract", () => {
    const prompt = buildJudgePrompt({ label: "Pricing", ancestorPath: ["Pricing"], recall: [] });
    expect(prompt).toContain('"gap"');
    expect(prompt).toMatch(/intent\|structure\|reality/);
    expect(prompt.toLowerCase()).toContain("do not invent");
  });
});
