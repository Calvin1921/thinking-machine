import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheKey, cacheSubtree, lookupCache, lookupCacheEntry } from "../src/library.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tm-lib-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("library", () => {
  it("cacheKey normalizes a topic to a slug", () => {
    expect(cacheKey("Web Hosting!")).toBe("web-hosting");
  });

  it("round-trips a cached subtree by topic", () => {
    const payload = { nodes: [{ label: "Vercel", kind: "atom" }], sources: ["https://vercel.com"] };
    cacheSubtree(dir, "Hosting", payload);
    expect(lookupCache(dir, "hosting")).toEqual(payload);   // case-insensitive via slug
  });

  it("returns null on a cache miss", () => {
    expect(lookupCache(dir, "nothing-here")).toBeNull();
  });

  it("stores and surfaces the originating context on reuse", () => {
    cacheSubtree(dir, "Hosting", { nodes: [{ label: "Vercel" }] }, "static blog");
    expect(lookupCache(dir, "hosting")).toEqual({ nodes: [{ label: "Vercel" }] });        // unchanged
    expect(lookupCacheEntry(dir, "hosting")).toEqual({ context: "static blog", payload: { nodes: [{ label: "Vercel" }] } });
  });

  it("lookupCacheEntry returns null on a miss", () => {
    expect(lookupCacheEntry(dir, "nope")).toBeNull();
  });

  it("context is optional (back-compat with 3-arg cacheSubtree)", () => {
    cacheSubtree(dir, "Plain", { a: 1 });
    expect(lookupCacheEntry(dir, "plain")).toEqual({ context: undefined, payload: { a: 1 } });
  });
});
