# Thinking Machine: 80-second demo

**[Watch the video](walkthrough.mp4)** · [Captions](walkthrough.srt) · [Reviewer brief](REVIEWER-BRIEF.md) · [Usage guide](../USAGE.md)

A concise, silent walkthrough with visible captions, recorded from the real application using **OpenScreen**. Browser chrome is cropped out; pauses are trimmed and an editorial capability card closes the video. No application behavior is simulated in the edit. One recording covers this project.

**Takeaway:** keep AI-assisted reasoning inspectable and editable, with human judgment and missing evidence visible.

## What you see

| Time | Demonstration | Why it matters |
|---|---|---|
| 0–8s | A decision, two options, and an unanswered quality question | The recommendation retains its context and alternative. |
| 8–26s | Add “Who reviews difficult replies?” beneath the reviewed pilot | The user can challenge and extend the reasoning. |
| 26–44s | Enter reasoning, a trade-off, and an open question; save and arrange | Human contributions persist as part of the board. |
| 44–52s | Focus on the reviewed-pilot branch | Explore a concern in depth without losing the larger map. |
| 52–62s | Return to the map; a CLI update appears live | The UI and external tools share core graph operations. |
| 62–72s | A recorded next step alongside unanswered questions | Choosing a direction does not imply the evidence is complete. |
| 72–80s | Product, AI integration, and full-stack capability card | Connect the product demonstration to implementation evidence. |

This handcrafted board is fictional. No support tickets are included or evaluated, and no live model call occurs. The 20-ticket test and 18-draft threshold are illustrative. `PASSED` on the root means a decision was recorded through `resolve`; it does **not** mean reply quality passed a test.

## Reproduce the walkthrough

Follow the [quick start](../../README.md#try-it-yourself-no-ai-account-needed). Run `pnpm demo:reset` only when ready to replace edits to the demo board. Open the fictional board at http://localhost:8791 and select **Fit view**.

Select **Human-reviewed pilot** and add **Who reviews difficult replies?**. Select the new thought and enter:

- **Your reasoning:** Review time may erase the benefit of faster drafts.
- **Trade-off / choose this if:** Choose this if trained reviewers can handle escalations.
- **Open question:** Which replies need specialist review?

Save, close the details, and choose **Arrange**. Select the pilot and choose **Focus on this** to explore its branch. Return with **Whole board**. In a second terminal at the clone root, run:

```bash
node packages/cli/dist/index.js -f boards/demo/support-pilot.json resolve root \
  "Try a human-reviewed pilot; measure quality before automatic sending."
```

The outcome arrives without a reload. The separate quality question and human concern remain open.

## Assets and recording notes

- [Starting board](support-pilot.png) and [saved outcome](support-pilot-outcome.png): current application captures from this recording.
- [Interactive editor](interactive-thinking.png): a separate real UI capture.
- [Source fixture](../../examples/support-pilot.json) and [demo launcher](../../scripts/demo.mjs).
- [Caption file](walkthrough.srt): text alternative for the silent MP4.

The shareable video is 1920 × 1080, H.264 MP4, 80 seconds, with burned-in captions and no audio track. OpenScreen captured only the dedicated demo window. Raw recordings and editor projects stay outside the repository because they contain machine-specific paths. The exported video contains no account chrome, personal boards, terminal prompts, or credentials. Captions and the closing capability card were added in post-production.

For an optional technical follow-up, use [agent setup](../AGENTS-AND-CLI.md) to demonstrate a real MCP client or model proposal separately. Model output and latency vary. The default judge call is a dry run; rerunning with `--yes` generates and commits a new proposal rather than approving the exact earlier proposal.
