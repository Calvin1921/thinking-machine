# Presentation audit — 2026-09-11

Scope: tracked Thinking Machine repository at `f15368b`, checked against fetched `origin/main`. Local unfinished changes were excluded by using an isolated clone and branch. This is a presentation audit and focused code inspection, not a security certification or full accessibility audit.

## Findings and changes

| Finding | Change |
|---|---|
| Opening required readers to decode decision-mapping terminology and a long CLI example. | Lead with the user problem, a concrete support-pilot decision, and a before/after value table. |
| Screenshot had no reproducible fixture or short account-free walkthrough. | Add fictional fixture, isolated demo launcher, real UI captures, and a timed 90-second narration. |
| Architecture arrived before an easy way to experience the outcome. | Move quick start and plain-language AI/MCP explanation ahead of architecture. |
| “Confident children over missing information is unrepresentable” overstated the schema. | Explain that structural validity cannot establish truth or prevent unsupported reasoning. |
| Verification wording could imply automatic fact-checking. | State that provenance/source checks are supplied by callers. |
| A dry run could be mistaken for approval of the exact later commit. | Document that `--yes` runs the model again; provide exact-proposal guidance separately. |
| README hardcoded an outdated 158-test count. | Keep commands and evidence links in README; record this run's 160 passing tests here. |
| Evaluation document could be read as implemented release infrastructure. | Label the document explicitly as targets/planned harness, not measured results. |
| Default `tmind ui` kills listeners on its chosen port. | New demo launcher starts the sidecar directly, without killing other listeners. Existing CLI behavior is unchanged. |

## Verification

- Locked dependency installation with pnpm 11.26.0; local runtime Node 25.9.0. CI specifies Node 22; this session did not separately rerun under Node 22.
- Full workspace build and web typecheck passed.
- 160 tests passed: core 83, CLI 19, MCP 18, web 40. Expected invalid-input stderr appeared in the passing CLI rejection test.
- Browser smoke: fictional board opened; all four cards and their text rendered; CLI `resolve` appeared via live updates without page reload; quality gap remained open.
- Demo relaunch preserved the recorded outcome; explicit reset restored the fixture. Screenshots visually inspected.
- Tracked text scanned for common absolute home paths, email addresses, private-key markers, and common credential patterns; no matches in the checked snapshot. This is a pattern scan of current files, not an exhaustive secrets/history audit. Original Git history was preserved.
- No real customer, employer, or personal board data was copied. All new board content is fictional. No external model call or business-impact measurement was performed.

## Remaining product limits

The local sidecar is not an authenticated service. The model adapter has no explicit timeout/retry budget. Caller-supplied outcomes do not enforce a test threshold. Accessibility features exist but full assistive-technology conformance is unverified. The proposed behavioral eval harness and roadmap capabilities should remain framed as future work.

## Interactive contribution follow-up

The canvas now supports contextual additions and a multi-field thought editor, with an explicit save and same-field conflict handling. The UI uses consistent canvas controls and a responsive details panel. See [usage](USAGE.md) for commands, expected results, and limits; [capability review](CAPABILITY-REVIEW.md) separates shipped behavior from future opportunities.

Validation: 169 tests passed (core 87, CLI 19, MCP 18, web 45); production build and web typecheck passed. Browser checks covered adding a child, editing reasoning and a question, persistence after reload, rejecting a concurrent same-field edit without losing the draft, resolving that conflict, subtree focus, and a 390-pixel mobile viewport. No live model response was tested. Recording remains deferred.
