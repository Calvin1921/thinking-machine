# Optional AI and agent setup

Start with the [account-free demo](../README.md#try-it-yourself-no-ai-account-needed). Run commands below from the built clone. The web canvas does not itself call a model.

## Install the skill with one command

```bash
npx skills@latest add Calvin1921/thinking-machine --skill thinking-machine
```

To target Codex explicitly in the current project:

```bash
npx skills@latest add Calvin1921/thinking-machine --skill thinking-machine --agent codex
```

Use `--agent claude-code` for Claude Code, or add `--global` for installation across projects. `--list` previews available skills without installing. Use a current Node.js version supported by the installer (the version checked during this update requires Node 22.20.0 or newer).

The skill teaches the agent how to use Thinking Machine. It does not bundle the application, add `tmind` to PATH, or configure MCP. Build the application using the quick start, then connect MCP below or let the agent use `node packages/cli/dist/index.js` from your built clone. An installed skill directory is not an application clone.

Installer reference: [vercel-labs/skills](https://github.com/vercel-labs/skills#readme).

## Ask the AI judge for a proposal

Install and authenticate Claude Code separately; `claude` must be on PATH. This uses your configured model service and may incur usage costs. Use only demo-safe boards when presenting.

```bash
node packages/cli/dist/index.js --dir boards/demo -f boards/demo/support-pilot.json grow-auto quality-gap --no-recall
```

Default is a dry run: a proposal or gap is printed without saving. `--no-recall` excludes other boards from the prompt. Without it, related notes under `--dir` can become model context.

Adding `--yes` invokes the model again and applies that new result. It does **not** approve the exact dry-run output. For an exact reviewed subtree, save a `{ "nodes": [...] }` proposal to a JSON file and use `grow <id> --json-file <file>`; the core validates it before mutation. A gap can be recorded with `gap <id> --kind reality --question "..."`.

## Connect an MCP client

Configure a stdio server whose command is `node`, whose argument is the built `packages/mcp/dist/index.js` in your clone, and whose `TM_BOARDS_DIR` environment variable points to your demo directory. Resolve these paths locally in your client configuration; do not commit machine-specific paths or account settings.

The MCP server exposes board operations; the connected agent chooses which tools to call. The CLI judge and the MCP client are distinct ways to drive the same core. Board data passed to an AI client follows that client's provider/data settings; local storage does not mean model inference is offline.

The repository's [thinking-machine skill](../skill/thinking-machine/SKILL.md) provides the command vocabulary and decomposition method. The tracked `.claude/skills/` symlink makes that skill available when working from the clone.

## Useful commands

```bash
# Your own board; the printed slug identifies the new file under boards.
node packages/cli/dist/index.js --dir boards new "Choose a rollout strategy" --root-type decision

# Inspect the fictional demo as text (also useful without the canvas).
node packages/cli/dist/index.js -f boards/demo/support-pilot.json show --json

# Record an unanswered question.
node packages/cli/dist/index.js -f boards/demo/support-pilot.json gap quality-gap \
  --kind reality --question "How many synthetic drafts pass human review?"
```

For the complete command vocabulary, use `node packages/cli/dist/index.js --help` or `<command> --help`. `verify` records supplied provenance/source information; it does not perform a source check on its own.
