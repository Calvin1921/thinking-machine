#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import {
  newBoard, loadBoard, saveBoard, mutate,
  addNode, linkNodes, setFacet, promoteFacetItem, decompose, setNodeImage, setNodeStatus, setBoardLayout,
  addSection, setSectionNote, setSectionLayout, growSubtree,
  listBoards, createBoard,
  setNodeProvenance, setGuideMode, detectCollisions,
  setVerification, markStale, cacheSubtree, lookupCache, setNodeRationale, lookupCacheEntry,
} from "@tm/core";

const program = new Command();
// Positional options let `note`/`facet` pass through text starting with "-"
// (e.g. "- bullet"). Side effect: program options (-f/--dir) must come BEFORE
// the subcommand name (tm -f board.json note …).
program.name("tm").description("Thinking Machine board CLI")
  .enablePositionalOptions()
  .option("-f, --file <path>", "board file", "board.json")
  .option("--dir <path>", "boards directory (for ls/new)", "boards")
  .option("--lib <path>", "library directory (for cache-put/cache-get)", "library");

const file = () => program.opts().file as string;
const dir = () => program.opts().dir as string;
const lib = () => program.opts().lib as string;
const out = (obj: unknown) => process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
const nowIso = () => new Date().toISOString();

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
  .action((label, opts) => { mutate(file(), (b) => addNode(b, { label, parentId: opts.parent, kind: opts.kind })); });

program.command("link <from> <to>")
  .option("--type <type>", "decomposition|dependency", "dependency")
  .option("--label <verb>", "relationship verb shown on the edge, e.g. 'blocks', 'feeds'")
  .action((from, to, opts) => { mutate(file(), (b) => linkNodes(b, from, to, opts.type, opts.label)); });

program.command("facet <id> <facet> <mode> [items...]")
  .description("mode = set|add. Items may start with '-' (e.g. \"- bullet\"); they pass through as text.")
  .passThroughOptions()
  .action((id, facet, mode, items) => { mutate(file(), (b) => setFacet(b, id, facet, items, mode)); });

program.command("image <id> <url>")
  .description("attach an image url to a node (empty url clears it)")
  .action((id, url) => { mutate(file(), (b) => setNodeImage(b, id, url)); });

program.command("status <id> <status>")
  .description("set node status: todo|running|passed|failed|blocked (use 'none' to clear)")
  .action((id, status) => { mutate(file(), (b) => setNodeStatus(b, id, status === "none" ? "" : status)); });

program.command("provenance <id> <value>")
  .description("set node provenance: drafted|verified|informed-opinion|stale (use 'none' to clear)")
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
  .description("set board layout: tree|funnel")
  .action((type) => { mutate(file(), (b) => setBoardLayout(b, type)); });

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

program.command("promote <id> <facet> <index>")
  .action((id, facet, index) => { mutate(file(), (b) => promoteFacetItem(b, id, facet, Number(index))); });

/** Read a proposal from --json or --json-file (exactly one must be given). */
const proposalOf = (opts: { json?: string; jsonFile?: string }): unknown => {
  if (opts.json && opts.jsonFile) throw new Error("--json and --json-file are mutually exclusive");
  if (!opts.json && !opts.jsonFile) throw new Error("one of --json or --json-file is required");
  return JSON.parse(opts.json ?? readFileSync(opts.jsonFile!, "utf8"));
};

program.command("decompose <id>")
  .option("--json <proposal>", "JSON {decomposition, edges?, facets?}")
  .option("--json-file <path>", "read the proposal JSON from a file instead of --json")
  .action((id, opts) => { mutate(file(), (b) => decompose(b, id, proposalOf(opts) as Parameters<typeof decompose>[2])); });

program.command("grow <id>")
  .description("grow a whole nested subtree under <id> in one shot")
  .option("--json <input>", "JSON GrowInput {nodes:[{label,kind,facets?,children?}], edges?}")
  .option("--json-file <path>", "read the GrowInput JSON from a file instead of --json")
  .action((id, opts) => { mutate(file(), (b) => growSubtree(b, id, proposalOf(opts) as Parameters<typeof growSubtree>[2])); });

program.command("logo <id> <domain>")
  .description("set a node's image to a site favicon (Google s2). Accepts a bare domain or a pasted URL; 'none' clears.")
  .action((id, domain) => {
    if (domain === "none") { mutate(file(), (b) => setNodeImage(b, id, "")); return; }
    const host = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0];
    mutate(file(), (b) => setNodeImage(b, id, `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`));
  });

program.command("verify <id>")
  .description("record a verification result on a node")
  .requiredOption("--provenance <v>", "drafted|verified|informed-opinion|stale")
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

try { program.parse(); }
catch (err) { process.stderr.write(`Error: ${(err as Error).message}\n`); process.exit(1); }
