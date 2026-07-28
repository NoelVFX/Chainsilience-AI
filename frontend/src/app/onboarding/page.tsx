"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AmbientOrbs } from "@/components/AmbientOrbs";
import { FadeUp } from "@/components/motion";
import { ApiError, getToken } from "@/lib/api";
import { useOnboarding, useRegister, useUploadTwinCsv } from "@/lib/hooks";

/**
 * Screen 2 — Company Onboarding. Creates a real account (email + password) and
 * the company profile that seeds the Digital Twin, so the user can sign back in
 * later and see their own company's data (all assets are company-scoped).
 */
export default function OnboardingPage() {
  const router = useRouter();
  const register = useRegister();
  const onboarding = useOnboarding();
  const uploadCsv = useUploadTwinCsv();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether the visitor already has a session (evaluated client-side only, to
  // avoid a hydration mismatch). With a session we skip account creation.
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => setHasSession(Boolean(getToken())), []);

  const [account, setAccount] = useState({ email: "", password: "" });
  const [form, setForm] = useState({
    company_name: "Acme Semiconductor Inc.",
    industry: "Semiconductors",
    countries: "Taiwan, USA, Vietnam",
    risk_tolerance: "Balanced",
    primary_products: "Processor X200, Sensor Array M4",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleContinue() {
    setError(null);

    // Validate the sign-up credentials before doing any work.
    if (!hasSession) {
      if (!/^\S+@\S+\.\S+$/.test(account.email)) {
        setError("Please enter a valid sign-up email address.");
        return;
      }
      if (account.password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
    }

    setBusy(true);
    try {
      if (!hasSession) {
        // Create the real user account — these are the credentials the user
        // signs in with from now on.
        await register.mutateAsync({
          email: account.email.trim(),
          password: account.password,
          company_name: form.company_name,
        });
      }
      await onboarding.mutateAsync(form);
      // Optional: enrich the bootstrapped twin with the uploaded supply-chain CSV.
      if (file) {
        try {
          await uploadCsv.mutateAsync(file);
        } catch {
          /* non-fatal: the profile-bootstrapped twin still works */
        }
      }
      router.push("/dashboard");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError("This email is already registered — sign in instead.");
      } else {
        setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <AmbientOrbs variant="auth" />

      <FadeUp y={22} className="relative z-10 w-[720px] max-w-full">
      <div
        className="rounded-panel border border-line bg-surface p-11"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "linear-gradient(135deg,#22d3ee,#3b82f6)",
            }}
          />
          <div className="text-[17px] font-extrabold text-text">Chainsilience AI</div>
        </div>

        <div className="mt-6 text-2xl font-extrabold text-text">Set up your company</div>
        <div className="mb-6 text-[13px] text-muted">
          This builds your Digital Twin — the model of your supply chain we use to
          reason about risk.
        </div>

        {!hasSession && (
          <>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.04em] text-cyan">
              Your account
            </div>
            <div className="mb-5 grid grid-cols-2 gap-4">
              <Field label="Sign-up Email">
                <input
                  type="email"
                  className="panel-input"
                  placeholder="you@company.com"
                  value={account.email}
                  onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  className="panel-input"
                  placeholder="At least 6 characters"
                  value={account.password}
                  onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
                />
              </Field>
            </div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.04em] text-cyan">
              Company profile
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Company Name">
            <input
              className="panel-input"
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
            />
          </Field>
          <Field label="Industry">
            <select
              className="panel-input"
              value={form.industry}
              onChange={(e) => set("industry", e.target.value)}
            >
              <option>Semiconductors</option>
              <option>Manufacturing</option>
              <option>Logistics</option>
              <option>Consumer Electronics</option>
            </select>
          </Field>
          <Field label="Countries of Operation">
            <input
              className="panel-input"
              value={form.countries}
              onChange={(e) => set("countries", e.target.value)}
            />
          </Field>
          <Field label="Risk Tolerance">
            <select
              className="panel-input"
              value={form.risk_tolerance}
              onChange={(e) => set("risk_tolerance", e.target.value)}
            >
              <option>Conservative</option>
              <option>Balanced</option>
              <option>Aggressive</option>
            </select>
          </Field>
        </div>

        <div className="mb-1.5 mt-[18px] text-xs font-semibold text-muted">
          Primary Products
        </div>
        <input
          className="panel-input"
          value={form.primary_products}
          onChange={(e) => set("primary_products", e.target.value)}
        />

        <div className="mb-2 mt-[18px] text-xs font-semibold text-muted">
          Supply Chain Data
        </div>
        <label className="dropzone block cursor-pointer rounded-panel border-[1.5px] border-dashed border-line-strong bg-inset p-[22px] text-center">
          <div className="text-[13px] font-semibold text-text">
            {file ? `Selected: ${file.name}` : "Drop CSV file here (optional)"}
          </div>
          <div className="mt-1 font-mono text-xs text-muted">
            columns: key,type,name,country,dependency_share,coverage_days,…
          </div>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {error && (
          <div
            className="mt-4 rounded-control border px-4 py-2.5 text-[12.5px] font-semibold"
            style={{
              background: "rgba(248,113,113,0.1)",
              borderColor: "rgba(248,113,113,0.35)",
              color: "#f87171",
            }}
          >
            {error}{" "}
            {error.includes("sign in") && (
              <span
                onClick={() => router.push("/login")}
                className="cursor-pointer font-bold text-cyan underline"
              >
                Go to sign in
              </span>
            )}
          </div>
        )}

        <button onClick={handleContinue} disabled={busy} className="btn-primary mt-6 w-full py-3.5">
          {busy ? "Building Digital Twin…" : "Build Digital Twin & Continue"}
        </button>
        {!hasSession && (
          <div className="mt-3 text-center text-[12px] text-muted">
            Already have an account?{" "}
            <span
              onClick={() => router.push("/login")}
              className="cursor-pointer font-semibold text-cyan"
            >
              Sign in
            </span>
          </div>
        )}
      </div>
      </FadeUp>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-muted">{label}</div>
      {children}
    </div>
  );
}
