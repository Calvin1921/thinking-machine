import { useState } from "react";
import { addNode } from "./api.js";

export function QuickAdd({ boardId, rootId, onAdded }: { boardId: string; rootId: string; onAdded: () => void }) {
  const [text, setText] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = text.trim();
    if (!label) return;
    await addNode(boardId, label, rootId, "atom"); // dump as a loose atom under root; reorganize later
    setText("");
    onAdded();
  };
  return (
    <form className="quickadd" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Dump a thought…  (Enter)" />
    </form>
  );
}
