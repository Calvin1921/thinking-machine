import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// @tm/core's barrel re-exports server-only file I/O (loadBoard/mutate) that import
// node:fs. The frontend only uses the pure parts (SEED_FACETS, types, in-memory ops),
// so those fs-backed functions tree-shake away — but Rollup still has to resolve the
// `node:fs` named imports. Provide a browser stub so resolution succeeds; the stubbed
// functions are never called in the bundle.
function nodeFsStub(): Plugin {
  const id = "\0virtual:node-fs-stub";
  const names = ["readFileSync", "writeFileSync", "renameSync", "openSync", "closeSync", "unlinkSync", "existsSync"];
  const unreachable = "() => { throw new Error('node:fs is not available in the browser'); }";
  return {
    name: "node-fs-stub",
    enforce: "pre",
    resolveId: (source) => (source === "node:fs" ? id : null),
    load: (loaded) => (loaded === id ? names.map((n) => `export const ${n} = ${unreachable};`).join("\n") : null),
  };
}

export default defineConfig({
  plugins: [nodeFsStub(), react()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
