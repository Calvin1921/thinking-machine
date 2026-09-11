# Thinking Machine — reviewer brief

Thinking Machine turns an open-ended decision into a map of options, reasoning, trade-offs, and unanswered questions. A person can contribute directly; an AI agent can update the same board through MCP. The result is a decision record that keeps the next step and its assumptions together.

[Watch the 80-second demo](walkthrough.mp4) · [Try it](../../README.md#try-it-yourself-no-ai-account-needed) · [Engineering evidence](../../README.md#engineering-evidence)

| Area | What this project demonstrates |
|---|---|
| Product engineering | A concrete workflow from uncertainty to a reviewable next step, with human input throughout. |
| AI engineering | MCP integration, an optional model judge, structured graph mutations, and explicit boundaries between plausible claims and evidence. |
| Full-stack engineering | An interactive React canvas, HTTP API, live updates, validated local persistence, and conflict handling in the details editor. |
| Engineering judgment | Automated tests, CI, failure feedback, responsive editing, and documented limitations. |

The recorded example is fictional and deterministic. It shows browser interaction and a live CLI update, not a model generating a response. It does not demonstrate measured business impact. The application is local and single-user. The verified implementation passed 169 tests, its production build, and web typecheck.
