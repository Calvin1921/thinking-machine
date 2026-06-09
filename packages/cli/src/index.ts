#!/usr/bin/env node
import { Command } from "commander";
import { existsSync } from "node:fs";
import {
  newBoard, loadBoard, saveBoard, mutate,
  addNode, linkNodes, setFacet, promoteFacetItem, decompose, setNodeImage, setNodeStatus, setBoardLayout,
  addSection, setSectionNote, setSectionLayout, growSubtree,
  listBoards, createBoard,
} from "@tm/core";

const program = new Command();
program.name("tm").description("Thinking Machine board CLI")
  .option("-f, --file <path>", "board file", "board.json")
  .option("--dir <path>", "boards directory (for ls/new)", "boards");

const file = () => program.opts().file as string;
const dir = () => program.opts().dir as string;
const out = (obj: unknown) => process.stdout.write(JSON.stringify(obj, null, 2) + "\n");

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
  .action((from, to, opts) => { mutate(file(), (b) => linkNodes(b, from, to, opts.type)); });

program.command("facet <id> <facet> <mode> [items...]")
  .description("mode = set|add")
  .action((id, facet, mode, items) => { mutate(file(), (b) => setFacet(b, id, facet, items, mode)); });

program.command("image <id> <url>")
  .description("attach an image url to a node (empty url clears it)")
  .action((id, url) => { mutate(file(), (b) => setNodeImage(b, id, url)); });

program.command("status <id> <status>")
  .description("set node status: todo|running|passed|failed|blocked (use 'none' to clear)")
  .action((id, status) => { mutate(file(), (b) => setNodeStatus(b, id, status === "none" ? "" : status)); });

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
  .description("set the text body of a note section")
  .action((sectionId, text) => { mutate(file(), (b) => setSectionNote(b, sectionId, (text as string[]).join(" "))); });

program.command("section-layout <sectionId> <type>")
  .description("set a graph section's layout: tree|funnel")
  .action((sectionId, type) => { mutate(file(), (b) => setSectionLayout(b, sectionId, type)); });

program.command("promote <id> <facet> <index>")
  .action((id, facet, index) => { mutate(file(), (b) => promoteFacetItem(b, id, facet, Number(index))); });

program.command("decompose <id>")
  .requiredOption("--json <proposal>", "JSON {decomposition, edges?, facets?}")
  .action((id, opts) => { mutate(file(), (b) => decompose(b, id, JSON.parse(opts.json))); });

program.command("grow <id>")
  .description("grow a whole nested subtree under <id> in one shot")
  .requiredOption("--json <input>", "JSON GrowInput {nodes:[{label,kind,facets?,children?}], edges?}")
  .action((id, opts) => { mutate(file(), (b) => growSubtree(b, id, JSON.parse(opts.json))); });

try { program.parse(); }
catch (err) { process.stderr.write(`Error: ${(err as Error).message}\n`); process.exit(1); }
