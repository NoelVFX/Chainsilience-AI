// The WebMCP tool surface for ChainSight.
//
// Each tool wraps the same typed `api` client the UI uses and, after a
// mutation, invalidates the matching React Query keys — so when the user's
// agent acts, the dashboard / simulator / action board that's on screen
// re-renders live. One workflow, driven by either the human or the agent.

import type { QueryClient } from "@tanstack/react-query";

import { api, getToken, ApiError } from "@/lib/api";
import type {
  ActionBoardResponse,
  ActionCard,
  DashboardResponse,
  EmailResponse,
  IngestResult,
  RiskCard,
  RiskDetail,
  ScenarioResponse,
} from "@/lib/types";

export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown>;
}

// --- input narrowing (no `any`) -------------------------------------------

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
}

function reqNum(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) throw new ApiError(400, `'${field}' must be a number.`);
  return n;
}

function reqStr(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, `'${field}' is required.`);
  }
  return value;
}

const ACTION_STATUSES = ["recommended", "approved", "assigned", "in_progress", "completed"] as const;

// Turn a thrown error into a structured payload the agent can reason about,
// instead of an exception it can't see.
async function guard<T>(fn: () => Promise<T>): Promise<T | { error: string; status?: number }> {
  if (!getToken()) {
    return { error: "Not signed in. Sign in with the demo account first, then I can drive the workspace." };
  }
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, status: err.status };
    return { error: err instanceof Error ? err.message : "Unknown error." };
  }
}

// --- tools ----------------------------------------------------------------

export function createTools(qc: QueryClient): WebMCPTool[] {
  return [
    {
      name: "getDashboard",
      description:
        "Read the risk dashboard: KPI tiles, the ranked top-risk cards, the live news feed, a one-line action summary, and disruption map points. Start here to understand the current supply-chain risk picture.",
      inputSchema: { type: "object", properties: {} },
      execute: () => guard(() => api.get<DashboardResponse>("/dashboard")),
    },
    {
      name: "listRisks",
      description: "List every detected risk as summary cards (id, title, supplier, severity, impact). Use the id with getRisk or simulateScenarios.",
      inputSchema: { type: "object", properties: {} },
      execute: () => guard(() => api.get<RiskCard[]>("/risks")),
    },
    {
      name: "getRisk",
      description:
        "Get the full explainable breakdown for one risk: the weighted scoring factors, AI reasoning, the cascade event chain, predicted-impact tiles, score and confidence.",
      inputSchema: {
        type: "object",
        properties: { riskId: { type: "number", description: "Risk id from listRisks/getDashboard." } },
        required: ["riskId"],
      },
      execute: (input) =>
        guard(() => api.get<RiskDetail>(`/risks/${reqNum(asRecord(input).riskId, "riskId")}`)),
    },
    {
      name: "ingestNews",
      description:
        "Run the live intelligence pipeline: pull the next headline, extract the disruption event, match it against the company's Digital Twin, score risk, predict impact, and generate recommended actions. Returns how many items were ingested/matched and any new risk ids. Refreshes the dashboard and action board.",
      inputSchema: { type: "object", properties: {} },
      execute: () =>
        guard(async () => {
          const result = await api.post<IngestResult>("/news/ingest");
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["risks"] });
          qc.invalidateQueries({ queryKey: ["actions"] });
          return result;
        }),
    },
    {
      name: "simulateScenarios",
      description:
        "Generate and rank mitigation scenarios for a risk (e.g. No Action, Switch Supplier, Air Freight, Increase Safety Stock), each with risk reduction, cost, recovery time, and financial impact. `priority` reweights the ranking.",
      inputSchema: {
        type: "object",
        properties: {
          riskId: { type: "number" },
          priority: {
            type: "string",
            enum: ["balanced", "cost", "speed", "risk"],
            description: "How to rank the options. Defaults to 'balanced'.",
          },
        },
        required: ["riskId"],
      },
      execute: (input) =>
        guard(() => {
          const r = asRecord(input);
          const riskId = reqNum(r.riskId, "riskId");
          const priority = typeof r.priority === "string" ? r.priority : "balanced";
          return api.get<ScenarioResponse>(`/scenarios/${riskId}?priority=${encodeURIComponent(priority)}`);
        }),
    },
    {
      name: "approveScenario",
      description:
        "Approve one mitigation scenario for a risk. This commits it into the Action Center as recommended actions. Returns the approval result and new action id. Refreshes the action board and dashboard.",
      inputSchema: {
        type: "object",
        properties: {
          riskId: { type: "number" },
          scenarioId: { type: "string", description: "The scenario `id` from simulateScenarios." },
        },
        required: ["riskId", "scenarioId"],
      },
      execute: (input) =>
        guard(async () => {
          const r = asRecord(input);
          const riskId = reqNum(r.riskId, "riskId");
          const scenarioId = reqStr(r.scenarioId, "scenarioId");
          const result = await api.post(`/scenarios/${riskId}/approve`, { scenario_id: scenarioId });
          qc.invalidateQueries({ queryKey: ["actions"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          return result;
        }),
    },
    {
      name: "getActionBoard",
      description: "Read the mitigation Action Center as a 5-stage Kanban (recommended, approved, assigned, in_progress, completed) with the cards in each column.",
      inputSchema: { type: "object", properties: {} },
      execute: () => guard(() => api.get<ActionBoardResponse>("/actions")),
    },
    {
      name: "advanceAction",
      description:
        "Move a mitigation action to a new Kanban stage. Completing an action reduces the linked risk and updates the dashboard KPIs.",
      inputSchema: {
        type: "object",
        properties: {
          actionId: { type: "number" },
          status: { type: "string", enum: [...ACTION_STATUSES] },
        },
        required: ["actionId", "status"],
      },
      execute: (input) =>
        guard(async () => {
          const r = asRecord(input);
          const actionId = reqNum(r.actionId, "actionId");
          const status = reqStr(r.status, "status");
          if (!ACTION_STATUSES.includes(status as (typeof ACTION_STATUSES)[number])) {
            return { error: `'status' must be one of: ${ACTION_STATUSES.join(", ")}.` };
          }
          const result = await api.patch<ActionCard>(`/actions/${actionId}`, { status });
          qc.invalidateQueries({ queryKey: ["actions"] });
          if (status === "completed") {
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            qc.invalidateQueries({ queryKey: ["risk"] });
          }
          return result;
        }),
    },
    {
      name: "generateMitigationEmail",
      description:
        "Draft a business communication for a risk (e.g. a supplier notice or an executive briefing). Returns subject and body. `kind` selects the type of message.",
      inputSchema: {
        type: "object",
        properties: {
          riskId: { type: "number" },
          kind: { type: "string", description: "Message type, e.g. 'supplier' or 'executive'. Defaults to 'supplier'." },
        },
        required: ["riskId"],
      },
      execute: (input) =>
        guard(() => {
          const r = asRecord(input);
          const riskId = reqNum(r.riskId, "riskId");
          const kind = typeof r.kind === "string" ? r.kind : "supplier";
          return api.post<EmailResponse>(`/risks/${riskId}/email`, { risk_id: riskId, kind });
        }),
    },
  ];
}
