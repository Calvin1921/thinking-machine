#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  newBoard, loadBoard, saveBoard, mutate,
  addNode, linkNodes, setNodeDescription, decompose, setNodeImage, setNodeStatus, setBoardLayout,
  addSection, setSectionNote, setSectionLayout, growSubtree,
  listBoards, createBoard,
  setNodeProvenance, setGuideMode, detectCollisions,
  setVerification, markStale, cacheSubtree, lookupCache, setNodeRationale, lookupCacheEntry,
  setAltFraming, runGrowFlow, applyJudgeResult, setNodeGap, resolveNode,
  type JudgeResult, type GrowNode, GrowInputSchema, DecomposeInputSchema, recall, recallContext,
} from "@tm/core";
import { claudeCliJudge } from "./judge-cli.js";

const program = new Command();
// Single-source-of-truth defaults: when TM_BOARDS_DIR is set (globally or per
// project), `ls`/`new`/cache resolve to that ONE central store regardless of CWD,
// so thinking accumulates in one place. Library mirrors the MCP convention
// (<boards>/library) unless TM_LIB_DIR overrides. Env unset => legacy CWD-relative.
const ENV_BOARDS = process.env.TM_BOARDS_DIR;
const DEFAULT_DIR = ENV_BOARDS ?? "boards";
const DEFAULT_LIB = process.env.TM_LIB_DIR ?? (ENV_BOARDS ? join(ENV_BOARDS, "library") : "library");
// Positional options let `note`/`facet` pass through text starting with "-"
// (e.g. "- bullet"). Side effect: program options (-f/--dir) must come BEFORE
// the subcommand name (tm -f board.json note …).
program.name("tm").description("Thinking Machine board CLI")
  .enablePositionalOptions()
  .option("-f, --file <path>", "board file", "board.json")
  .option("--dir <path>", "boards directory (for ls/new)", DEFAULT_DIR)
  .option("--lib <path>", "library directory (for cache-put/cache-get)", DEFAULT_LIB);

const file = () => program.opts().file as string;
const dir = () => program.opts().dir as string;
const lib = () => program.opts().lib as string;
const out = (obj: unknown) => process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
const nowIso = () => new Date().toISOString();

/** Kill whatever is LISTENING on a port (a stale ui server), so `tmind ui` can restart cleanly.
 *  Only listeners — never a client connection (e.g. a Vite dev proxy connected to the port). */
function freePortListeners(port: string): number {
  if (!/^\d{1,5}$/.test(port)) return 0; // only a numeric port reaches the shell — no injection surface
  try {
    let pids: string[];
    if (process.platform === "win32") {
      const o = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
      pids = [...new Set(o.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((x): x is string => !!x))];
      for (const pid of pids) { try { execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" }); } catch { /* gone */ } }
    } else {
      const o = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
      pids = o.trim().split(/\s+/).filter(Boolean);
      for (const pid of pids) { try { process.kill(Number(pid)); } catch { /* gone */ } }
    }
    return pids.length;
  } catch {
    return 0; // nothing listening, or lsof/netstat unavailable — fine, the new server will just bind
  }
}

/** Render a judge result for the dry-run confirm step: the proposed outline, or the gap. */
const printResult = (r: JudgeResult) => {
  if (r.kind === "gap") {
    process.stdout.write(`⚑ GAP (${r.gap.kind}): ${r.gap.question}\n`);
    return;
  }
  const walk = (nodes: GrowNode[], depth: number) => {
    for (const n of nodes) {
      process.stdout.write(`${"  ".repeat(depth)}• ${n.label} [${n.kind}]${n.description ? ` — ${n.description}` : ""}\n`);
      if (n.children?.length) walk(n.children, depth + 1);
    }
  };
  walk(r.nodes, 0);
  for (const e of r.edges ?? []) process.stdout.write(`  ↳ ${e.fromLabel} —${e.label ?? e.type}→ ${e.toLabel}\n`);
};

program.command("init <title>")
  .option("--root-type <type>", "objective|cause|decision|concept", "objective")
  .action((title, opts) => {
    if (existsSync(file())) throw new Error(`${file()} already exists`);
    saveBoard(file(), newBoard(title, opts.rootType));
  });

program.command("ls")
  .description("list boards in --dir")
  .option("--json", "machine-readable output")
  .action((opts) => {
    const boards = listBoards(dir());
    if (opts.json) { out(boards); return; }
    for (const b of boards) {
      process.stdout.write(`${b.id}  [${b.rootType ?? "?"}]  ${b.title}  (${b.nodeCount} nodes)\n`);
    }
  });

program.command("new <title>")
  .description("create a new board in --dir")
  .requiredOption("--root-type <type>", "objective|cause|decision|concept")
  .action((title, opts) => {
    const id = createBoard(dir(), title, opts.rootType);
    process.stdout.write(`${id}\n`);
  });

program.command("show")
  .option("--node <id>", "show a single node")
  .option("--json", "machine-readable output")
  .action((opts) => {
    const b = loadBoard(file());
    if (opts.node) { const n = b.nodes.find((x) => x.id === opts.node); if (!n) throw new Error("no such node"); out(n); return; }
    if (opts.json) { out(b); return; }
    process.stdout.write(`${b.title} (${b.nodes.length} nodes, ${b.edges.length} edges)\n`);
    for (const n of b.nodes) process.stdout.write(`  ${n.id} [${n.kind}] ${n.label}\n`);
  });

program.command("add <label>")
  .requiredOption("--parent <id>", "parent node id")
  .option("--kind <kind>", "branch|atom", "branch")
  .option("--desc <text>", "the node's body text")
  .action((label, opts) => {
    let id = "";
    mutate(file(), (b) => {
      const before = new Set(b.nodes.map((n) => n.id));
      const nb = addNode(b, { label, parentId: opts.parent, kind: opts.kind, description: opts.desc });
      id = nb.nodes.find((n) => !before.has(n.id))!.id;
      return nb;
    });
    process.stdout.write(`${id}\n`);   // print the created id so callers never guess the slug
  });

program.command("link <from> <to>")
  .option("--type <type>", "decomposition|dependency", "dependency")
  .option("--label <verb>", "relationship verb shown on the edge, e.g. 'blocks', 'feeds'")
  .action((from, to, opts) => { mutate(file(), (b) => linkNodes(b, from, to, opts.type, opts.label)); });

program.command("describe <id> <text...>")
  .description("set a node's body text (empty clears it). Text may start with '-'.")
  .passThroughOptions()
  .action((id, text) => { mutate(file(), (b) => setNodeDescription(b, id, (text as string[]).join(" "))); });

program.command("image <id> <url>")
  .description("attach an image url to a node (empty url clears it)")
  .action((id, url) => { mutate(file(), (b) => setNodeImage(b, id, url)); });

program.command("status <id> <status>")
  .description("set node status: todo|running|passed|failed|blocked (use 'none' to clear)")
  .action((id, status) => { mutate(file(), (b) => setNodeStatus(b, id, status === "none" ? "" : status)); });

program.command("provenance <id> <value>")
  .description("set node provenance: drafted|verified|refuted|informed-opinion|stale (use 'none' to clear)")
  .action((id, value) => { mutate(file(), (b) => setNodeProvenance(b, id, value === "none" ? "" : value)); });

program.command("guide <state>")
  .description("turn Guide posture on|off for this board")
  .action((state) => { mutate(file(), (b) => setGuideMode(b, state === "on")); });

program.command("collisions")
  .description("print proposed labels that collide with existing nodes: --labels \"A,B,C\"")
  .requiredOption("--labels <csv>", "comma-separated proposed labels")
  .action((opts) => {
    const labels = (opts.labels as string).split(",").map((s) => s.trim()).filter(Boolean);
    out(detectCollisions(loadBoard(file()), labels));
  });

program.command("layout <type>")
  .description("set board layout: tree|funnel|grid|timeline|radial|concentric; pass --alt to record the Pathfinder alternative in the same step")
  .option("--alt <layout>", "alternative layout (the road not taken) — set it together with the default")
  .option("--alt-intent <s>", "the main idea that would justify the alternative")
  .option("--alt-divergence <n>", "how different the alt's message is, 0..1 (shown only if >= 0.35)", "0.5")
  .action((type, opts) => {
    mutate(file(), (b) => {
      const withLayout = setBoardLayout(b, type);
      return opts.alt
        ? setAltFraming(withLayout, { layout: opts.alt, intent: opts.altIntent ?? "", divergence: Number(opts.altDivergence) })
        : withLayout;
    });
  });

program.command("framing-alt <layout>")
  .description("Pathfinder: set the alternative framing (the road not taken); 'none' clears")
  .option("--intent <s>", "the main idea that would justify this alternative")
  .option("--divergence <n>", "how different the alt's message is, 0..1 (shown only if >= 0.35)", "0.5")
  .action((layout, opts) => {
    mutate(file(), (b) => layout === "none"
      ? setAltFraming(b, null)
      : setAltFraming(b, { layout, intent: opts.intent ?? "", divergence: Number(opts.divergence) }));
  });

program.command("section <title>")
  .description("add a section: --kind graph|note, graph takes --layout tree|funnel. Prints the new section id.")
  .requiredOption("--kind <kind>", "graph|note")
  .option("--layout <layout>", "graph section layout: tree|funnel")
  .action((title, opts) => {
    const b = mutate(file(), (bb) => addSection(bb, { title, kind: opts.kind, layout: opts.layout }));
    process.stdout.write(`${b.sections!.at(-1)!.id}\n`);
  });

program.command("note <sectionId> <text...>")
  .description("set (or append) the text body of a note section. Text may start with '-' (e.g. \"- bullet\"). --mode must come BEFORE <sectionId>: tm note --mode add s1 \"more\"")
  .option("--mode <mode>", "set|add (add appends with a newline)", "set")
  .passThroughOptions()
  .action((sectionId, text, opts) => { mutate(file(), (b) => setSectionNote(b, sectionId, (text as string[]).join(" "), opts.mode)); });

program.command("section-layout <sectionId> <type>")
  .description("set a graph section's layout: tree|funnel")
  .action((sectionId, type) => { mutate(file(), (b) => setSectionLayout(b, sectionId, type)); });


/** Read a proposal from --json or --json-file (exactly one must be given). */
const proposalOf = (opts: { json?: string; jsonFile?: string }): unknown => {
  if (opts.json && opts.jsonFile) throw new Error("--json and --json-file are mutually exclusive");
  if (!opts.json && !opts.jsonFile) throw new Error("one of --json or --json-file is required");
  return JSON.parse(opts.json ?? readFileSync(opts.jsonFile!, "utf8"));
};


program.command("decompose <id>")
  .option("--json <proposal>", "JSON {decomposition:[{label,kind,description?}], edges?}")
  .option("--json-file <path>", "read the proposal JSON from a file instead of --json")
  .action((id, opts) => { mutate(file(), (b) => decompose(b, id, DecomposeInputSchema.parse(proposalOf(opts)))); });

program.command("grow <id>")
  .description("grow a whole nested subtree under <id> in one shot")
  .option("--json <input>", "JSON GrowInput {nodes:[{label,kind,description?,children?}], edges?}")
  .option("--json-file <path>", "read the GrowInput JSON from a file instead of --json")
  .action((id, opts) => {
    // Strict-validate at the boundary: a hallucinated/malformed proposal fails loud here,
    // matching the MCP surface, instead of being as-cast onto the board.
    const input = GrowInputSchema.parse(proposalOf(opts));
    mutate(file(), (b) => growSubtree(b, id, input));
  });

program.command("gap <id>")
  .description("plant a frontier flag on <id>: the honest 'can't map past here' + the unblocking question")
  .option("--kind <kind>", "intent|structure|reality", "reality")
  .option("--question <text>", "the one question that unblocks this node")
  .option("--clear", "remove the gap flag instead")
  .action((id, opts) => {
    if (opts.clear) { mutate(file(), (b) => setNodeGap(b, id, null)); return; }
    if (!opts.question) throw new Error("gap: --question is required (or use --clear)");
    mutate(file(), (b) => setNodeGap(b, id, { kind: opts.kind, question: opts.question }));
  });

program.command("resolve <id> <outcome...>")
  .description("close a node: record the outcome, set the verdict, clear any open gap")
  .option("--status <status>", "passed|failed", "passed")
  .action((id, outcome, opts) => {
    mutate(file(), (b) => resolveNode(b, id, (outcome as string[]).join(" "), opts.status));
  });

program.command("recall <topic>")
  .description("cross-board memory: find prior thinking related to <topic> across the store")
  .option("--limit <n>", "max hits", "8")
  .action((topic, opts) => {
    const hits = recall(dir(), topic, { limit: Number(opts.limit) });
    if (!hits.length) { process.stdout.write("(no related prior thinking found)\n"); return; }
    for (const h of hits) process.stdout.write(`• [${h.boardTitle}] ${h.path}  (${h.score})\n${h.snippet ? `    ${h.snippet}\n` : ""}`);
  });

program.command("recall-hook")
  .description("Claude Code UserPromptSubmit hook: read the prompt from stdin JSON, surface related accumulated knowledge. Gated so it stays quiet unless there's a strong, relevant hit.")
  .option("--min-words <n>", "skip prompts shorter than this (control words like 'go ahead')", "5")
  .option("--min-coverage <n>", "only inject hits sharing at least this many distinct terms with the prompt (≥2 = real topical overlap, not one coincidental word)", "2")
  .action((opts) => {
    let raw = "";
    try { raw = readFileSync(0, "utf8"); } catch { return; }       // no stdin → nothing to do
    let prompt = "";
    try { prompt = (JSON.parse(raw).prompt as string) ?? ""; } catch { prompt = raw; }
    if (prompt.trim().split(/\s+/).filter(Boolean).length < Number(opts.minWords)) return;
    const hits = recall(dir(), prompt, { limit: 4 }).filter((h) => h.coverage >= Number(opts.minCoverage));
    if (!hits.length) return;                                        // quiet unless ≥2 terms genuinely overlap
    process.stdout.write("📎 Related prior thinking from your boards (point-in-time notes; provenance shown per line — treat anything not ✓verified as unchecked draft, not fact):\n");
    for (const h of hits) {
      const prov = h.provenance === "verified" ? "✓verified" : h.provenance ?? "unverified";
      process.stdout.write(`• (${prov}) [${h.boardTitle}] ${h.path}${h.snippet ? ` — ${h.snippet}` : ""}\n`);
    }
  });

program.command("grow-auto <id>")
  .description("headless: an embedded judge (claude -p) proposes a subtree under <id>; prints it, --yes to commit")
  .option("--yes", "commit the proposal (default is a dry-run that only prints it)")
  .option("--no-recall", "skip the cross-board recall step")
  .action(async (id, opts) => {
    const board = loadBoard(file());
    const node = board.nodes.find((n) => n.id === id);
    // Recall-first: surface prior thinking on this node's topic and feed it to the judge.
    const hits = opts.recall !== false && node ? recall(dir(), node.label, { limit: 6 }) : [];
    if (hits.length) {
      process.stdout.write(`📎 ${hits.length} related from your other boards:\n`);
      for (const h of hits) process.stdout.write(`   • [${h.boardTitle}] ${h.path}\n`);
      process.stdout.write("\n");
    }
    const { result } = await runGrowFlow(board, id, claudeCliJudge, { recall: recallContext(hits) });
    printResult(result);
    // Commit against the CURRENT board under lock — the snapshot above is only judge context;
    // saving it directly would clobber any edit made during the (slow) LLM call.
    if (opts.yes) { mutate(file(), (b) => applyJudgeResult(b, id, result)); process.stdout.write("\n✓ committed.\n"); }
    else process.stdout.write("\n(dry-run — re-run with --yes to commit)\n");
  });

program.command("logo <id> <domain>")
  .description("set a node's image to a site favicon (Google s2). Accepts a bare domain or a pasted URL; 'none' clears.")
  .action((id, domain) => {
    if (domain === "none") { mutate(file(), (b) => setNodeImage(b, id, "")); return; }
    const host = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0];
    mutate(file(), (b) => setNodeImage(b, id, `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`));
  });

program.command("verify <id>")
  .description("record a verification result on a node")
  .requiredOption("--provenance <v>", "drafted|verified|refuted|informed-opinion|stale")
  .option("--kind <kind>", "factual|subjective")
  .option("--sources <csv>", "comma-separated source URLs")
  .option("--volatility <v>", "static|weeks|volatile")
  .option("--at <iso>", "verification timestamp (defaults to now)")
  .action((id, opts) => {
    const sources = opts.sources ? (opts.sources as string).split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    mutate(file(), (b) => setVerification(b, id, {
      provenance: opts.provenance, contentKind: opts.kind, sources,
      verifiedAt: opts.at ?? nowIso(), volatility: opts.volatility,
    }));
  });

program.command("refresh-stale")
  .description("downgrade verified nodes past their TTL to 'stale'")
  .option("--at <iso>", "current time (defaults to now)")
  .action((opts) => { mutate(file(), (b) => markStale(b, opts.at ?? nowIso())); });

program.command("cache-put <topic>")
  .description("store a verified subtree payload in the library under <topic>")
  .requiredOption("--json <payload>", "JSON payload to cache")
  .option("--context <text>", "originating context for this cache entry")
  .action((topic, opts) => { cacheSubtree(lib(), topic, JSON.parse(opts.json), opts.context); });

program.command("cache-get <topic>")
  .description("print the cached payload for <topic> (or null)")
  .action((topic) => { out(lookupCache(lib(), topic)); });

program.command("rationale <id> <text...>")
  .description("set a node's 'pick this if X' rationale (use 'none' to clear). Text may start with '-'.")
  .passThroughOptions()
  .action((id, text) => {
    const joined = (text as string[]).join(" ");
    mutate(file(), (b) => setNodeRationale(b, id, joined === "none" ? "" : joined));
  });

program.command("cache-entry <topic>")
  .description("print the cached entry {context, payload} for <topic> (or null)")
  .action((topic) => { out(lookupCacheEntry(lib(), topic)); });

program.command("ui")
  .description("start the web canvas (serves boards in --dir) and open it in the browser")
  .option("--dir <path>", "boards directory to serve (defaults to the current directory)", ".")
  .option("--port <port>", "port to serve on", "8787")
  .option("--no-open", "do not open the browser")
  .action((opts) => {
    // This file runs from <repo>/packages/cli/dist/index.js; the web app is a sibling package.
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const webDir = join(repoRoot, "apps", "web");
    const dist = join(webDir, "dist");
    if (!existsSync(dist)) {
      process.stderr.write(`UI bundle not found at ${dist}\nBuild it once with:  pnpm --filter @tm/web build\n`);
      process.exit(1);
    }
    const boardsDir = resolve(opts.dir);
    // Free the port first: kill any stale ui server still listening, so re-running `tmind ui`
    // restarts cleanly instead of crashing with EADDRINUSE.
    const killed = freePortListeners(String(opts.port));
    if (killed) process.stdout.write(`↻ stopped a previous ui server on :${opts.port}, restarting…\n`);
    const child = spawn("node", ["--import", "tsx", join(webDir, "server", "sidecar.ts")], {
      cwd: webDir,
      env: { ...process.env, TM_BOARDS_DIR: boardsDir, TM_WEB_DIST: dist, TM_UI_PORT: String(opts.port) },
      stdio: ["inherit", "pipe", "inherit"],
    });
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    let opened = false;
    child.stdout.on("data", (buf: Buffer) => {
      process.stdout.write(buf);
      const m = buf.toString().match(/http:\/\/localhost:\d+/);
      if (!opened && m) {
        opened = true;
        process.stdout.write(`Serving boards from ${boardsDir}  (Ctrl-C to stop)\n`);
        if (opts.open) spawn(opener, [m[0]], { stdio: "ignore", detached: true }).unref();
      }
    });
    child.on("exit", (code) => process.exit(code ?? 0));
  });

program.parseAsync()
  .catch((err) => { process.stderr.write(`Error: ${(err as Error).message}\n`); process.exit(1); });
