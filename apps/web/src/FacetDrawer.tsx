import { useState, useEffect } from "react";
import type { Node as BNode } from "@tm/core/schema";
import { SEED_FACETS } from "@tm/core/schema";
import { setFacet, setImage } from "./api.js";

export function FacetDrawer({ boardId, node, onClose, onSaved }: { boardId: string; node: BNode | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [image, setImageDraft] = useState("");
  useEffect(() => {
    if (!node) return;
    setDraft(Object.fromEntries(SEED_FACETS.map((f) => [f, (node.facets[f] ?? []).join("\n")])));
    setImageDraft(node.image ?? "");
  }, [node]);
  if (!node) return null;

  const save = async (facet: string) => {
    const items = draft[facet].split("\n").map((s) => s.trim()).filter(Boolean);
    await setFacet(boardId, node.id, facet, items, "set");
    onSaved();
  };

  const saveImage = async () => {
    const url = image.trim();
    if (url === (node.image ?? "")) return;
    await setImage(boardId, node.id, url);
    onSaved();
  };

  return (
    <div className="drawer open">
      <button className="drawer-close" onClick={onClose}>×</button>
      <h2>{node.label}</h2>
      <div className="dsub">{node.kind === "root" ? node.rootType : node.kind}</div>
      <div className="facet">
        <label>image url</label>
        <input
          className="facet-input"
          value={image}
          placeholder="https://…"
          onChange={(e) => setImageDraft(e.target.value)}
          onBlur={saveImage}
        />
      </div>
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
