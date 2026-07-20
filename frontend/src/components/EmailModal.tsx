"use client";

import { useEffect } from "react";

import { useGenerateEmail } from "@/lib/hooks";

const KINDS = [
  { id: "customer", label: "Customer" },
  { id: "supplier", label: "Supplier" },
  { id: "executive", label: "Executive" },
  { id: "procurement", label: "Procurement" },
];

/** AI email generator modal — drafts an editable communication for a risk. */
export function EmailModal({ riskId, onClose }: { riskId: number; onClose: () => void }) {
  const generate = useGenerateEmail(riskId);

  useEffect(() => {
    generate.mutate("customer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const email = generate.data;

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
          <div className="text-[15px] font-bold text-text">Generate Mitigation Email</div>
          <button onClick={onClose} className="text-muted hover:text-text">✕</button>
        </div>

        <div className="mb-4 flex gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => generate.mutate(k.id)}
              className="rounded-control border px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                borderColor:
                  email?.kind === k.id ? "rgba(34,211,238,0.5)" : "rgba(148,163,184,0.18)",
                color: email?.kind === k.id ? "#22d3ee" : "#8b98b3",
                background: email?.kind === k.id ? "rgba(34,211,238,0.08)" : "transparent",
              }}
            >
              {k.label}
            </button>
          ))}
        </div>

        {generate.isPending || !email ? (
          <div className="h-52 animate-pulse rounded-control bg-inset" />
        ) : (
          <>
            <div className="mb-1.5 text-[11px] font-semibold text-muted">Subject</div>
            <input className="panel-input mb-3" defaultValue={email.subject} key={`s-${email.kind}`} />
            <div className="mb-1.5 text-[11px] font-semibold text-muted">Body</div>
            <textarea
              className="panel-input min-h-[220px] resize-y font-sans leading-[1.6]"
              defaultValue={email.body}
              key={`b-${email.kind}`}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="btn-ghost px-4 py-2">Close</button>
              <button className="btn-primary px-4 py-2" onClick={onClose}>
                Save Draft
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
