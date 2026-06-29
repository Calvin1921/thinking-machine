import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newBoard } from "../src/board.js";
import { addNode, setNodeDescription } from "../src/ops.js";
import { recall, recallContext } from "../src/recall.js";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "tm-recall-"));
  // Board 1: a strong LABEL hit for "pricing"
  let b1 = newBoard("SaaS launch", "objective");
  b1 = addNode(b1, { label: "Pricing strategy", parentId: "root", kind: "branch" });
  writeFileSync(join(dir, "saas-launch.json"), JSON.stringify(b1));
  // Board 2: only a DESCRIPTION hit for "pricing" (weaker than a label hit)
  let b2 = newBoard("Newsletter", "objective");
  b2 = addNode(b2, { label: "Monetization", parentId: "root", kind: "branch" });
  const mon = b2.nodes.find((n) => n.label === "Monetization")!;
  b2 = setNodeDescription(b2, mon.id, "how pricing and tiers affect conversion");
  writeFileSync(join(dir, "newsletter.json"), JSON.stringify(b2));
  // Board 3: unrelated — must NOT surface
  let b3 = newBoard("Dog grooming", "concept");
  b3 = addNode(b3, { label: "Brushing", parentId: "root", kind: "atom" });
  writeFileSync(join(dir, "dog-grooming.json"), JSON.stringify(b3));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("recall", () => {
  it("ranks a label hit above a description-only hit and excludes unrelated boards", () => {
    const hits = recall(dir, "pricing");
    expect(hits.length).toBe(2); // dog-grooming excluded
    expect(hits[0].label).toBe("Pricing strategy"); // label hit (3) outranks desc hit (1)
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(hits.some((h) => h.boardTitle === "Dog grooming")).toBe(false);
  });

  it("includes the ancestor path and a snippet, and excludeBoardId drops a board", () => {
    const hits = recall(dir, "pricing", { excludeBoardId: "saas-launch" });
    expect(hits.every((h) => h.boardId !== "saas-launch")).toBe(true);
    const h = hits[0];
    expect(h.path).toContain(">"); // root > node
    expect(recallContext(hits)[0]).toContain(h.boardTitle);
  });

  it("returns nothing for an all-stopword / empty topic", () => {
    expect(recall(dir, "the a of")).toEqual([]);
    expect(recall(dir, "")).toEqual([]);
  });
});
