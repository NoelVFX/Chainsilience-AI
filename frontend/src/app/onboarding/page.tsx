"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AmbientOrbs } from "@/components/AmbientOrbs";
import { FadeUp } from "@/components/motion";
import { ApiError, getToken } from "@/lib/api";
import {
  useOnboarding,
  useRegister,
  useRequestOtp,
  useUploadTwinCsv,
  useVerifyOtp,
} from "@/lib/hooks";

/**
 * Screen 2 — Company Onboarding. Creates a real account (email + password) and
 * the company profile that seeds the Digital Twin. New accounts must verify a
 * 6-digit code emailed to the sign-up address before the account is created.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const register = useRegister();
  const onboarding = useOnboarding();
  const uploadCsv = useUploadTwinCsv();
  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "form" collects the account + company; "otp" collects the emailed code.
  const [phase, setPhase] = useState<"form" | "otp">("form");
  const [otpCode, setOtpCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  // Whether the visitor already has a session (evaluated client-side only, to
  // avoid a hydration mismatch). With a session we skip account creation + OTP.
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

  // Countdown for the "Resend code" button.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  function validateAccount(): boolean {
    if (!/^\S+@\S+\.\S+$/.test(account.email)) {
      setError("Please enter a valid sign-up email address.");
      return false;
    }
    if (account.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return false;
    }
    return true;
  }

  // Build the company + twin. Shared by the verified-signup path and the
  // already-signed-in path.
  async function completeOnboarding() {
    await onboarding.mutateAsync(form);
    if (file) {
      try {
        await uploadCsv.mutateAsync(file);
      } catch {
        /* non-fatal: the profile-bootstrapped twin still works */
      }
    }
    router.push("/dashboard");
  }

  // Form step: either email a code (new account) or skip straight through
  // (already authenticated).
  async function handlePrimary() {
    setError(null);

    if (hasSession) {
      setBusy(true);
      try {
        await completeOnboarding();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!validateAccount()) return;
    setBusy(true);
    try {
      const res = await requestOtp.mutateAsync(account.email.trim());
      setDevCode(res.dev_code ?? null);
      setOtpCode("");
      setResendIn(30);
      setPhase("otp");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError("This email is already registered — sign in instead.");
      } else {
        setError(e instanceof ApiError ? e.message : "Couldn't send the code. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  // OTP step: verify the code, then create the account and build the twin.
  async function handleVerifyAndComplete() {
    setError(null);
    if (otpCode.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      await verifyOtp.mutateAsync({ email: account.email.trim(), code: otpCode });
      await register.mutateAsync({
        email: account.email.trim(),
        password: account.password,
        company_name: form.company_name,
      });
      await completeOnboarding();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError("This email is already registered — sign in instead.");
      } else {
        setError(e instanceof ApiError ? e.message : "Verification failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0 || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await requestOtp.mutateAsync(account.email.trim());
      setDevCode(res.dev_code ?? null);
      setOtpCode("");
      setResendIn(30);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't resend the code. Please try again.");
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

          {phase === "otp" ? (
            <OtpStep
              email={account.email.trim()}
              code={otpCode}
              onCode={setOtpCode}
              onVerify={handleVerifyAndComplete}
              onResend={handleResend}
              onBack={() => {
                setPhase("form");
                setError(null);
              }}
              onSubmitEnter={handleVerifyAndComplete}
              busy={busy}
              resendIn={resendIn}
              devCode={devCode}
              error={error}
            />
          ) : (
            <>
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

              <button
                onClick={handlePrimary}
                disabled={busy}
                className="btn-primary mt-6 w-full py-3.5"
              >
                {hasSession
                  ? busy
                    ? "Building Digital Twin…"
                    : "Build Digital Twin & Continue"
                  : busy
                    ? "Sending code…"
                    : "Create account & verify email"}
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
            </>
          )}
        </div>
      </FadeUp>
    </div>
  );
}

interface OtpStepProps {
  email: string;
  code: string;
  onCode: (v: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onBack: () => void;
  onSubmitEnter: () => void;
  busy: boolean;
  resendIn: number;
  devCode: string | null;
  error: string | null;
}

function OtpStep({
  email,
  code,
  onCode,
  onVerify,
  onResend,
  onBack,
  onSubmitEnter,
  busy,
  resendIn,
  devCode,
  error,
}: OtpStepProps) {
  return (
    <>
      <div className="mt-6 text-2xl font-extrabold text-text">Verify your email</div>
      <div className="mb-6 text-[13px] text-muted">
        We sent a 6-digit code to{" "}
        <span className="font-semibold text-text">{email}</span>. Enter it below to finish
        creating your account.
      </div>

      <OtpInput value={code} onChange={onCode} disabled={busy} onEnter={onSubmitEnter} />

      {devCode && (
        <div
          className="mt-4 rounded-control border px-4 py-2.5 text-center text-[12px] font-semibold"
          style={{
            background: "rgba(251,191,36,0.1)",
            borderColor: "rgba(251,191,36,0.35)",
            color: "#fbbf24",
          }}
        >
          Dev mode — no email service is configured. Your code is{" "}
          <span className="font-mono font-bold tracking-widest">{devCode}</span>.
        </div>
      )}

      {error && (
        <div
          className="mt-4 rounded-control border px-4 py-2.5 text-[12.5px] font-semibold"
          style={{
            background: "rgba(248,113,113,0.1)",
            borderColor: "rgba(248,113,113,0.35)",
            color: "#f87171",
          }}
        >
          {error}
        </div>
      )}

      <button
        onClick={onVerify}
        disabled={busy || code.length !== 6}
        className="btn-primary mt-6 w-full py-3.5"
      >
        {busy ? "Verifying & building…" : "Verify & complete setup"}
      </button>

      <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
        <span
          onClick={onBack}
          className="cursor-pointer font-semibold text-muted hover:text-text"
        >
          ← Change details
        </span>
        {resendIn > 0 ? (
          <span>Resend code in {resendIn}s</span>
        ) : (
          <span
            onClick={onResend}
            className="cursor-pointer font-semibold text-cyan"
          >
            Resend code
          </span>
        )}
      </div>
    </>
  );
}

/** Six segmented single-digit inputs with auto-advance, backspace, and paste. */
function OtpInput({
  value,
  onChange,
  disabled,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onEnter?: () => void;
}) {
  const LEN = 6;
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const setChar = (i: number, ch: string) => {
    const arr = value.split("");
    while (arr.length < LEN) arr.push("");
    arr[i] = ch;
    onChange(arr.join("").slice(0, LEN));
  };

  return (
    <div className="flex justify-center gap-2.5">
      {Array.from({ length: LEN }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ""}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "");
            if (!d) {
              setChar(i, "");
              return;
            }
            setChar(i, d[d.length - 1]);
            if (i < LEN - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onEnter?.();
              return;
            }
            if (e.key === "Backspace" && !value[i] && i > 0) {
              e.preventDefault();
              setChar(i - 1, "");
              refs.current[i - 1]?.focus();
            }
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < LEN - 1) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const d = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LEN);
            if (d) {
              onChange(d);
              refs.current[Math.min(d.length, LEN - 1)]?.focus();
            }
          }}
          className="h-14 w-12 rounded-control border border-line-strong bg-inset text-center text-2xl font-bold text-text outline-none transition-colors focus:border-cyan"
          style={{ caretColor: "#22d3ee" }}
        />
      ))}
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
