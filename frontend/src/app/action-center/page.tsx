"use client";

import { AnimatePresence, motion } from "framer-motion";

import { AppShell } from "@/components/AppShell";
import { Stagger, StaggerItem } from "@/components/motion";
import { useActionBoard, useDeleteAction, useMoveAction } from "@/lib/hooks";
import type { ActionCard } from "@/lib/types";

// Column order → the next stage an action advances to when clicked.
const NEXT_STATUS: Record<string, string | null> = {
  recommended: "approved",
  approved: "assigned",
  assigned: "in_progress",
  in_progress: "completed",
  completed: null,
};

/** Screen 6 — Action Center: 5-column Kanban of the mitigation workflow. */
export default function ActionCenterPage() {
  const { data, isLoading } = useActionBoard();
  const move = useMoveAction();
  const remove = useDeleteAction();

  return (
    <AppShell>
      <h1 className="mb-1 text-[22px] font-extrabold text-text">Action Center</h1>
      <p className="mb-6 text-[13px] text-muted">
        Track mitigation actions from recommendation to completion
      </p>

      {isLoading || !data ? (
        <div className="grid grid-cols-5 gap-3.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-card border border-line bg-surface" />
          ))}
        </div>
      ) : (
        <Stagger className="grid grid-cols-5 items-start gap-3.5">
          {data.columns.map((col) => (
            <StaggerItem key={col.key}>
              <div className="mb-2.5 text-xs font-bold uppercase tracking-[0.04em] text-muted">
                {col.name}
              </div>
              <div className="flex flex-col gap-2.5">
                <AnimatePresence initial={false}>
                  {col.items.map((it) => (
                    <motion.div
                      key={it.id}
                      layout
                      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
                    >
                      <ActionKanbanCard
                        card={it}
                        onAdvance={() => {
                          const next = NEXT_STATUS[it.status];
                          if (next) move.mutate({ id: it.id, status: next });
                        }}
                        onDelete={
                          it.status === "completed"
                            ? () => remove.mutate(it.id)
                            : undefined
                        }
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
                {col.items.length === 0 && (
                  <div className="rounded-card border border-dashed border-line py-6 text-center text-[11px] text-muted/60">
                    —
                  </div>
                )}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <p className="mt-6 text-[11.5px] text-muted/70">
        Tip: click a card to advance it. Completing a mitigation reduces its
        risk&apos;s score and revenue at risk on the dashboard; use ✕ to clear
        completed cards from the board.
      </p>
    </AppShell>
  );
}

function ActionKanbanCard({
  card,
  onAdvance,
  onDelete,
}: {
  card: ActionCard;
  onAdvance: () => void;
  onDelete?: () => void;
}) {
  const advanceable = NEXT_STATUS[card.status] !== null;
  return (
    <div
      onClick={advanceable ? onAdvance : undefined}
      className={`tilt-card-sm group relative rounded-panel border border-line bg-surface p-3.5 ${advanceable ? "cursor-pointer" : ""}`}
    >
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Remove from board"
          className="absolute right-2 top-2 hidden h-5 w-5 items-center justify-center rounded-md text-[11px] text-muted transition-colors hover:text-danger group-hover:flex"
          style={{ background: "rgba(148,163,184,0.08)" }}
        >
          ✕
        </button>
      )}
      <div
        className="mb-1.5 text-[10.5px] font-bold uppercase"
        style={{ color: card.priority_color }}
      >
        {card.priority}
      </div>
      <div className="text-[13px] font-semibold leading-[1.4] text-text">{card.title}</div>
      <div className="mt-2.5 text-[11.5px] text-muted">
        {card.owner}
        {card.deadline ? ` · ${card.deadline}` : ""}
      </div>
    </div>
  );
}
