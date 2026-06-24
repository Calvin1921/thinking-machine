import { useState, useEffect } from "react";
import type { Node as BNode } from "@tm/core/schema";
import { SEED_FACETS } from "@tm/core/schema";
import { setFacet, setImage, setStatus } from "./api.js";
import { RefText } from "./refLinks.js";
import { safeHttpUrl } from "./safeUrl.js";

const STATUSES = ["todo", "running", "passed", "failed", "blocked"] as const;

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
      {(node.provenance || node.rationale || node.sources?.length) && (
        <div className="verif">
          {node.provenance && (
            <span className={`t-prov prov-${node.provenance}`}>{node.provenance}</span>
          )}
          {node.contentKind && <span className="verif-kind">{node.contentKind}</span>}
          {node.verifiedAt && <span className="verif-at">checked {node.verifiedAt.slice(0, 10)}</span>}
          {node.volatility && <span className="verif-vol">TTL: {node.volatility}</span>}
          {node.rationale && <div className="verif-rationale">{node.rationale}</div>}
          {node.sources?.length ? (
            <ul className="verif-sources">
              {node.sources.map((s) => {
                const href = safeHttpUrl(s);
                return <li key={s}>{href ? <a href={href} target="_blank" rel="noreferrer">{s}</a> : <span>{s}</span>}</li>;
              })}
            </ul>
          ) : null}
        </div>
      )}
      <div className="facet">
        <label>status</label>
        <select
          className="facet-input"
          value={node.status ?? ""}
          onChange={async (e) => { await setStatus(boardId, node.id, e.target.value); onSaved(); }}
        >
          <option value="">— none —</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
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
          {(draft[f] ?? "").includes("[[") && (
            <div className="facet-refs"><RefText text={draft[f]} /></div>
          )}
        </div>
      ))}
    </div>
  );
}
