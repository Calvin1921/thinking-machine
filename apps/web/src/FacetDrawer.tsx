import { useState, useEffect } from "react";
import type { Node as BNode } from "@tm/core";
import { SEED_FACETS } from "@tm/core";
import { setFacet } from "./api.js";

export function FacetDrawer({ node, onClose, onSaved }: { node: BNode | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!node) return;
    setDraft(Object.fromEntries(SEED_FACETS.map((f) => [f, (node.facets[f] ?? []).join("\n")])));
  }, [node]);
  if (!node) return null;

  const save = async (facet: string) => {
    const items = draft[facet].split("\n").map((s) => s.trim()).filter(Boolean);
    await setFacet(node.id, facet, items, "set");
    onSaved();
  };

  return (
    <div className="drawer open">
      <button className="drawer-close" onClick={onClose}>×</button>
      <h2>{node.label}</h2>
      <div className="dsub">{node.kind === "root" ? node.rootType : node.kind}</div>
      {SEED_FACETS.map((f) => (
        <div className="facet" key={f}>
          <label>{f}</label>
          <textarea
            value={draft[f] ?? ""}
            placeholder="One thought per line…"
            onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
            onBlur={() => save(f)}
          />
        </div>
      ))}
    </div>
  );
}
