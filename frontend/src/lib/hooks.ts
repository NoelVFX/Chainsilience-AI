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

export function useScenarios(riskId: number) {
  return useQuery({
    queryKey: ["scenarios", riskId],
    queryFn: () => api.get<ScenarioResponse>(`/scenarios/${riskId}`),
    enabled: Number.isFinite(riskId),
  });
}

export function useApproveScenario(riskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scenarioId: string) =>
      api.post(`/scenarios/${riskId}/approve`, { scenario_id: scenarioId }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["actions"] }),
  });
}

export function useGenerateEmail(riskId: number) {
  return useMutation({
    mutationFn: (kind: string) =>
      api.post<EmailResponse>(`/risks/${riskId}/email`, { risk_id: riskId, kind }),
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
