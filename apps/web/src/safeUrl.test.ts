// apps/web/src/safeUrl.test.ts
import { describe, it, expect } from "vitest";
import { safeHttpUrl } from "./safeUrl.js";

describe("safeHttpUrl", () => {
  it("allows https:// URLs", () => {
    expect(safeHttpUrl("https://vercel.com")).toBe("https://vercel.com");
  });

  it("allows http:// URLs", () => {
    expect(safeHttpUrl("http://x.com/p")).toBe("http://x.com/p");
  });

  it("blocks javascript: scheme", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("blocks data: scheme", () => {
    expect(safeHttpUrl("data:text/html,<script>")).toBeUndefined();
  });

  it("blocks invalid URLs", () => {
    expect(safeHttpUrl("not a url")).toBeUndefined();
  });
});
