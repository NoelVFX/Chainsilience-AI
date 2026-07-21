"use client";

import { useEffect, useState } from "react";

import { useGenerateEmail, useSaveEmailDraft } from "@/lib/hooks";

const KINDS = [
  { id: "customer", label: "Customer" },
  { id: "supplier", label: "Supplier" },
  { id: "executive", label: "Executive" },
  { id: "procurement", label: "Procurement" },
];

/**
 * AI email generator modal. Loads a saved draft for the selected recipient if
 * one exists (otherwise drafts a fresh one with the AI). Editing is controlled,
 * and "Save Draft" persists the exact edited content so reopening restores it.
 */
export function EmailModal({ riskId, onClose }: { riskId: number; onClose: () => void }) {
  const load = useGenerateEmail(riskId);
  const save = useSaveEmailDraft(riskId);

  const [kind, setKind] = useState("customer");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  // Load the (saved or freshly generated) email whenever the recipient changes.
  useEffect(() => {
    let active = true;
    load
      .mutateAsync(kind)
      .then((res) => {
        if (!active) return;
        setSubject(res.subject);
        setBody(res.body);
        setIsSaved(res.saved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function handleSave() {
    await save.mutateAsync({ kind, subject, body });
    setIsSaved(true);
  }

  const loading = load.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(4,8,16,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-[620px] max-w-full rounded-panel border border-line bg-surface p-6"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-bold text-text">Generate Mitigation Email</span>
            {isSaved && !loading && (
              <span className="rounded-md px-2 py-0.5 text-[10.5px] font-semibold"
                style={{ background: "rgba(52,211,153,0.14)", color: "#34d399" }}>
                Saved draft
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-muted hover:text-text">✕</button>
        </div>

        <div className="mb-4 flex gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className="rounded-control border px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                borderColor: kind === k.id ? "rgba(34,211,238,0.5)" : "rgba(148,163,184,0.18)",
                color: kind === k.id ? "#22d3ee" : "#8b98b3",
                background: kind === k.id ? "rgba(34,211,238,0.08)" : "transparent",
              }}
            >
              {k.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="h-52 animate-pulse rounded-control bg-inset" />
        ) : (
          <>
            <div className="mb-1.5 text-[11px] font-semibold text-muted">Subject</div>
            <input
              className="panel-input mb-3"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setIsSaved(false);
              }}
            />
            <div className="mb-1.5 text-[11px] font-semibold text-muted">Body</div>
            <textarea
              className="panel-input min-h-[220px] resize-y font-sans leading-[1.6]"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setIsSaved(false);
              }}
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={onClose} className="btn-ghost px-4 py-2">Close</button>
              <button
                className="btn-primary px-4 py-2"
                onClick={handleSave}
                disabled={save.isPending || isSaved}
              >
                {save.isPending ? "Saving…" : isSaved ? "Saved ✓" : "Save Draft"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
