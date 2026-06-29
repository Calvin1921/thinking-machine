// The headless SdkJudge adapter: drives Claude via the `claude -p` CLI. Side-effects (spawn,
// parse) live here in the surface, never in core. This is the zero-extra-auth adapter the
// parity probe validated; swapping in the Anthropic Agent SDK later is just another Judge.
import { spawn } from "node:child_process";
import { buildJudgePrompt, type Judge, type GrowContext, type GrowProposal } from "@tm/core";

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", prompt], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(new Error(`could not run 'claude' (is the CLI installed and on PATH?): ${e.message}`)));
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`claude exited ${code}: ${err || out}`))));
  });
}

/** Pull the JSON object out of the model's reply (tolerant of stray prose or ```json fences). */
function parseProposal(raw: string): GrowProposal {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{"), end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  let obj: unknown;
  try {
    obj = JSON.parse(s);
  } catch (e) {
    throw new Error(`judge did not return valid JSON: ${(e as Error).message}\n--- raw (first 500 chars) ---\n${raw.slice(0, 500)}`);
  }
  if (!obj || !Array.isArray((obj as GrowProposal).nodes)) throw new Error("judge JSON is missing a nodes[] array");
  return obj as GrowProposal;
}

export const claudeCliJudge: Judge = {
  async propose(ctx: GrowContext): Promise<GrowProposal> {
    return parseProposal(await runClaude(buildJudgePrompt(ctx)));
  },
};
