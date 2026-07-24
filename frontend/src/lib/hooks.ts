// React Query hooks — the single place components fetch/mutate server state.
"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api, setToken } from "@/lib/api";
import type {
  ActionBoardResponse,
  ActionCard,
  DashboardResponse,
  EmailResponse,
  IngestResult,
  RiskDetail,
  ScenarioResponse,
  TokenResponse,
} from "@/lib/types";

export function useLogin() {
  return useMutation({
    mutationFn: (creds: { email: string; password: string }) =>
      api.post<TokenResponse>("/auth/login", creds),
    onSuccess: (data) => setToken(data.access_token),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (payload: {
      email: string;
      password: string;
      full_name?: string;
      company_name?: string;
    }) => api.post<TokenResponse>("/auth/register", payload),
    onSuccess: (data) => setToken(data.access_token),
  });
}

export function useOnboarding() {
  return useMutation({
    mutationFn: (payload: Record<string, string>) =>
      api.post("/company/onboarding", payload),
  });
}

export function useUploadTwinCsv() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload<{ created: number; edges_created: number; data_quality_score: number }>(
        "/company/twin/upload",
        form,
      );
    },
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardResponse>("/dashboard"),
  });
}

export function useRiskDetail(riskId: number) {
  return useQuery({
    queryKey: ["risk", riskId],
    queryFn: () => api.get<RiskDetail>(`/risks/${riskId}`),
    enabled: Number.isFinite(riskId),
  });
}

export function useScenarios(riskId: number, priority = "balanced") {
  return useQuery({
    queryKey: ["scenarios", riskId, priority],
    queryFn: () =>
      api.get<ScenarioResponse>(`/scenarios/${riskId}?priority=${priority}`),
    enabled: Number.isFinite(riskId),
    // Keep showing the current ranking while a new priority re-fetches.
    placeholderData: (prev) => prev,
  });
}

export interface ApproveResult {
  approved: boolean;
  status: string;
  message: string;
  action_id?: number;
  recommended_added?: number;
}

export function useApproveScenario(riskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scenarioId: string) =>
      api.post<ApproveResult>(`/scenarios/${riskId}/approve`, { scenario_id: scenarioId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["actions"] }),
  });
}

export function useActionBoard() {
  return useQuery({
    queryKey: ["actions"],
    queryFn: () => api.get<ActionBoardResponse>("/actions"),
  });
}

export function useMoveAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch<ActionCard>(`/actions/${id}`, { status }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["actions"] });
      if (vars.status === "completed") {
        // Completing a mitigation reduces the linked risk's metrics — refresh
        // the dashboard KPIs and any risk detail views.
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        qc.invalidateQueries({ queryKey: ["risk"] });
      }
    },
  });
}

export function useDeleteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/actions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["actions"] }),
  });
}

export function useGenerateEmail(riskId: number) {
  return useMutation({
    mutationFn: (kind: string) =>
      api.post<EmailResponse>(`/risks/${riskId}/email`, { risk_id: riskId, kind }),
  });
}

export function useSaveEmailDraft(riskId: number) {
  return useMutation({
    mutationFn: (draft: { kind: string; subject: string; body: string }) =>
      api.put<EmailResponse>(`/risks/${riskId}/email`, draft),
  });
}

export function useIngestNews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<IngestResult>("/news/ingest"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["actions"] });
    },
  });
}
