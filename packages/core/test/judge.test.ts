import { describe, it, expect } from "vitest";
import { newBoard } from "../src/board.js";
import { addNode } from "../src/ops.js";
import { growContext, buildJudgePrompt, runGrowFlow, type Judge } from "../src/judge.js";

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

  it("runGrowFlow commits whatever the injected judge proposes, under the node", async () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "Backend", parentId: "root", kind: "branch" });
    const backend = b.nodes.find((n) => n.label === "Backend")!;
    // A deterministic judge stands in for the LLM — proves the flow is pure given a judge.
    const scripted: Judge = {
      async propose() {
        return {
          nodes: [
            { label: "API", kind: "atom", description: "the http surface" },
            { label: "DB", kind: "atom", description: "persistence" },
          ],
          edges: [{ fromLabel: "API", toLabel: "DB", type: "dependency", label: "reads" }],
        };
      },
    };
    const { board: next, proposal } = await runGrowFlow(b, backend.id, scripted);
    expect(proposal.nodes).toHaveLength(2);
    const api = next.nodes.find((n) => n.label === "API")!;
    const db = next.nodes.find((n) => n.label === "DB")!;
    expect(api && db).toBeTruthy();
    // children hang off Backend by decomposition; the cross-link is a dependency
    expect(next.edges).toContainEqual({ from: backend.id, to: api.id, type: "decomposition" });
    expect(next.edges).toContainEqual({ from: api.id, to: db.id, type: "dependency", label: "reads" });
  });
});
