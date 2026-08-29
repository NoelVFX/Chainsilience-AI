// React Query hooks — the single place components fetch/mutate server state.
"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api, setToken } from "@/lib/api";
import type {
  ActionBoardResponse,
  ActionCard,
  DashboardResponse,
  EmailResponse,
  IngestResult,
  RiskCard,
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

export interface RequestOtpResult {
  sent: boolean;
  delivered: boolean;
  expires_in: number;
  dev_code?: string | null;
}

/** Ask the backend to email a 6-digit sign-up verification code. */
export function useRequestOtp() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<RequestOtpResult>("/auth/request-otp", { email }),
  });
}

/** Verify the code the user entered; unlocks account registration. */
export function useVerifyOtp() {
  return useMutation({
    mutationFn: (vars: { email: string; code: string }) =>
      api.post<{ verified: boolean }>("/auth/verify-otp", vars),
  });
}

export interface ForgotPasswordResult {
  message: string;
  dev_reset_url?: string | null;
}

/** Request a password-reset link be emailed to the address. */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<ForgotPasswordResult>("/auth/forgot-password", { email }),
  });
}

/** Set a new password using the token from the emailed reset link. */
export function useResetPassword() {
  return useMutation({
    mutationFn: (vars: { token: string; new_password: string }) =>
      api.post<{ reset: boolean }>("/auth/reset-password", vars),
  });
}

export interface BillingStatus {
  plan: string;
  active: boolean;
  entitled: boolean;
  gate_enabled: boolean;
  stripe_configured: boolean;
}

/** Current company's plan + whether the paywall gate is active. */
export function useBillingStatus(enabled = true) {
  return useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => api.get<BillingStatus>("/billing/status"),
    enabled,
  });
}

/** Start a Stripe Checkout session for a plan; returns the redirect URL. */
export function useCreateCheckout() {
  return useMutation({
    mutationFn: (plan: string) =>
      api.post<{ url: string }>("/billing/checkout", { plan }),
  });
}

/** Confirm a returning checkout and activate the plan. */
export function useVerifyCheckout() {
  return useMutation({
    mutationFn: (sessionId: string) =>
      api.post<BillingStatus>("/billing/verify", { session_id: sessionId }),
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
    // The backend poller scrapes fresh news every minute — keep the dashboard
    // (KPIs, top risks, disruption map, recent news) live without a manual pull.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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
    queryFn: () => api.get<ScenarioResponse>(`/scenarios/${riskId}?priority=${priority}`),
    enabled: Number.isFinite(riskId),
    // Keep showing the current ranking while a new priority re-fetches.
    placeholderData: (prev) => prev,
  });
}

export function useRefreshScenarios(riskId: number, priority = "balanced") {
  const qc = useQueryClient();
  return useMutation({
    // refresh=true regenerates + persists a new option set on the backend.
    mutationFn: () =>
      api.get<ScenarioResponse>(`/scenarios/${riskId}?priority=${priority}&refresh=true`),
    onSuccess: (data) => {
      // Update every cached priority view for this risk (they share one set).
      qc.setQueryData(["scenarios", riskId, priority], data);
      qc.invalidateQueries({ queryKey: ["scenarios", riskId] });
    },
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

export function useApproveScenarioAndNavigate(riskId: number) {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (scenarioId: string) =>
      api.post<ApproveResult>(`/scenarios/${riskId}/approve`, { scenario_id: scenarioId }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["actions"] });
      if (result.approved) {
        router.push("/action-center");
      }
    },
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

export function useRisks() {
  return useQuery({
    queryKey: ["risks"],
    queryFn: () => api.get<RiskCard[]>("/risks"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
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