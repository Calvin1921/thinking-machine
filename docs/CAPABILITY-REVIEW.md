# What would make Thinking Machine more complete?

The strongest existing idea is **inspectable reasoning shared by a person and an agent**. Its value comes from retaining alternatives, uncertainty, provenance and decisions—not merely generating a large tree. More branches can create clutter without improving a decision.

## Capabilities to highlight now

| Capability | Why it matters | How to use it |
|---|---|---|
| Human contribution alongside agents | Your context and objections can change the map, not just the prompt that generated it. | Add under a selected concept; edit reasoning and trade-offs in Thought details. |
| Explicit uncertainty | A missing fact becomes an answerable question rather than an invisible assumption. | Open question in the editor; gap proposals through the optional judge. |
| Persistent rationale and outcomes | A later reader can see why an option was chosen and what would make the alternative attractive. | Trade-off and Outcome fields; CLI rationale/resolve. |
| Several views of the same reasoning | A tree is useful for decomposition; other layouts expose different relationships. | Layout, Arrange, Overview and Focus on this. |
| CLI/MCP and a live canvas | Agents and people read and change one saved artifact. | Watch the browser while running a CLI command or connected MCP tool. |
| Provenance and recall | Prior thinking can be reused without silently treating every old claim as current fact. | CLI/MCP recall and verification/staleness commands; inspect evidence labels. |
| Guarded human saves | An agent update should not erase a person’s unsaved reasoning. | Details panel conflict comparison and atomic field updates. |

## Recommended next investments, in order

1. **Revision history and undo.** Make exploration reversible. Show who/what changed a claim and let the user restore it. This is more valuable than another generation button because current persistence does not provide recovery history.
2. **A reviewed AI proposal inside the canvas.** Select a node, ask to widen/challenge/deepen, inspect a proposed diff, and apply that exact proposal. Include cancellation, timeout and bounded retries. Avoid the existing dry-run/`--yes` second-call ambiguity.
3. **Evidence and test objects.** Attach a source excerpt, date and check result; give a proposed test a metric, threshold and outcome. Keep proposed tests distinct from observed results. The current free-text fields and status labels do not enforce this.
4. **A comparison view tied to criteria.** Compare options against the user’s criteria and explain trade-offs. Treat scores as judgments with evidence, not objective measurements invented by a model. The current grid is a layout, not this comparison feature.
5. **Relationship editing and a shareable decision brief.** Add/remove labelled dependencies through an explicit UI; export a concise record of the decision, alternatives, evidence and open questions. Avoid requiring the reviewer to explore the entire graph.
6. **Behavioral evaluation.** Test whether the judge asks useful questions, avoids unsupported conclusions, and respects a user correction across repeated prompts. Deterministic tests alone cannot establish those properties.

These are proposals, not shipped features or measured outcomes. The current pass implements the human contribution flow and UI cleanup; it does not add a hidden model call, cloud service, or automated decision-maker.
