# Contributing

Issues and small, focused PRs are welcome. This is a single-maintainer project — expect
review to prioritize keeping the core small over adding surface area (see the non-goals
in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before proposing new infrastructure).

## Setup

Follow [Install & develop](README.md#install--develop) in the README: clone,
`pnpm install`, `pnpm -r build`, `pnpm -r test`. Node >=22 and pnpm >=11.

## Making a change

- One feature or fix per branch, PR'd against `main`.
- Tests live in each package's `test/` directory (`apps/web` colocates `*.test.ts`
  beside source) and use real systems — temp-dir board stores (`mkdtemp`), no mocks.
- Pure logic goes in `packages/core`, with `schema.ts` and the pure graph ops kept
  browser-safe; anything touching `fs` stays segregated in core's persistence modules
  or in the CLI/MCP/sidecar adapters (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).
- Any board-schema change must be additive, bump the schema `version`, and extend
  `migrate()` — existing boards must keep loading (there is a regression test for this).
- Before opening the PR: `pnpm -r build && pnpm -r test` green, and if you touched
  `apps/web`, `pnpm --filter @tm/web typecheck` too. CI runs the same.

## Bugs and questions

Open a GitHub issue with the command (or UI action) you ran, what you expected, and
what happened. For judge/LLM behavior, include the board JSON if you can — it's the
whole reproduction.

By contributing you agree your contributions are licensed under the repo's
[MIT license](LICENSE).
