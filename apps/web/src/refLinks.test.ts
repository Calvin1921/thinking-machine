// apps/web/src/refLinks.test.ts
import { describe, it, expect } from "vitest";
import { parseRefs } from "./refLinks.js";

describe("parseRefs", () => {
  it("returns a single text segment when there are no refs", () => {
    expect(parseRefs("plain old text")).toEqual([{ kind: "text", text: "plain old text" }]);
  });

  it("splits text around a ref", () => {
    expect(parseRefs("see [[auth-flow]] for details")).toEqual([
      { kind: "text", text: "see " },
      { kind: "ref", boardId: "auth-flow" },
      { kind: "text", text: " for details" },
    ]);
  });

  it("handles refs at the start and end", () => {
    expect(parseRefs("[[a]] mid [[b-2]]")).toEqual([
      { kind: "ref", boardId: "a" },
      { kind: "text", text: " mid " },
      { kind: "ref", boardId: "b-2" },
    ]);
  });

  it("handles adjacent refs with no text between", () => {
    expect(parseRefs("[[one]][[two]]")).toEqual([
      { kind: "ref", boardId: "one" },
      { kind: "ref", boardId: "two" },
    ]);
  });

  it("leaves invalid tokens as text", () => {
    // uppercase, leading dash, empty, unclosed
    expect(parseRefs("[[Foo]]")).toEqual([{ kind: "text", text: "[[Foo]]" }]);
    expect(parseRefs("[[-bad]]")).toEqual([{ kind: "text", text: "[[-bad]]" }]);
    expect(parseRefs("[[]]")).toEqual([{ kind: "text", text: "[[]]" }]);
    expect(parseRefs("oops [[open")).toEqual([{ kind: "text", text: "oops [[open" }]);
  });

  it("returns no segments for an empty string", () => {
    expect(parseRefs("")).toEqual([]);
  });
});
