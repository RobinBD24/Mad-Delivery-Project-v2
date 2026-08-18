"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/layout/icons";
import { loginAction, type AuthFormState } from "@/lib/auth/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { BD_PHONE_RE } from "@/lib/validation/limits";
import { required, type Rule } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const initialState: AuthFormState = { error: null, fieldErrors: {} };

const USERNAME_RE = /^[A-Za-z0-9._-]{3,}$/;

/** The one field accepts a mobile number OR a username — same rule the server
 * applies when it resolves the account (lib/auth/actions.ts). */
const identifierShape: Rule = (value) => {
  const v = value.trim();
  if (!v) return null; // `required` reports the empty case
  return BD_PHONE_RE.test(v) || USERNAME_RE.test(v) ? null : { key: "auth.identifierError" };
};

const RULES: FieldRules = {
  // Login never rejects on password length — the server decides. Only "filled in".
  identifier: [required, identifierShape],
  password: [required],
};

export function LoginForm({
  expired,
  reset,
  callbackUrl,
}: {
  expired?: boolean;
  reset?: boolean;
  /** PHASE O — where to land after login; validated server-side. */
  callbackUrl?: string;
}) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const { t } = useTranslation();

  // Controlled values — a failed submission (client OR server) never clears them.
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { errors, formProps } = useFormValidation(RULES, {
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  /** Design's ripple on press. */
  function ripple(ev: React.MouseEvent<HTMLButtonElement>) {
    const btn = ev.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const span = document.createElement("span");
    span.className = "ripple";
    span.style.width = span.style.height = `${size}px`;
    span.style.left = `${ev.clientX - rect.left - size / 2}px`;
    span.style.top = `${ev.clientY - rect.top - size / 2}px`;
    btn.appendChild(span);
    setTimeout(() => span.remove(), 650);
  }

  /** Invalid wins; a filled field with no error shows the design's tick. */
  const fieldClass = (error: string | undefined, value: string) => {
    if (error) return "field is-invalid";
    return value.length > 0 ? "field is-valid" : "field";
  };

  const banner = state.error
    ? { tone: state.code === "pending" ? "warning" : "error", text: state.error }
    : reset
      ? { tone: "success", text: t("auth.resetSuccess") }
      : expired
        ? { tone: "info", text: t("auth.sessionExpired") }
        : null;

  return (
    <>
      <form className="auth-form" action={formAction} {...formProps}>
        {/* The server re-validates this: an off-site or non-page value is
            discarded in favour of the role's own home. */}
        <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
        <div className="form-head">
          <h2>{t("auth.welcomeBack")}</h2>
          <p>{t("auth.loginSubtitleDesign")}</p>
        </div>

        {banner ? (
          <div className={`auth-alert auth-alert--${banner.tone}`} role="alert">
            <Icon name={banner.tone === "success" ? "circle-check" : "bell"} />
            <span>{banner.text}</span>
          </div>
        ) : null}

        {/* Mobile number OR username */}
        <div className={fieldClass(errors.identifier, identifier)} data-field="identifier">
          <input
            type="text"
            id="identifier"
            name="identifier"
            autoComplete="username"
            placeholder=" "
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            aria-invalid={Boolean(errors.identifier)}
            aria-describedby={errors.identifier ? "identifier-error" : undefined}
          />
          <label htmlFor="identifier">{t("auth.identifierLabel")}</label>
          <Icon name="mobile" className="field__icon size-3.5" />
          <span className="field__status">
            <Icon name="circle-check" className="size-4" />
          </span>
          <span id="identifier-error" className="field__error" role="alert">
            {errors.identifier ?? ""}
          </span>
        </div>

        {/* Password */}
        <div className={fieldClass(errors.password, password)} data-field="password">
          <input
            type={showPassword ? "text" : "password"}
            id="password"
            name="password"
            autoComplete="current-password"
            placeholder=" "
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
          />
          <label htmlFor="password">{t("auth.passwordLabel")}</label>
          <Icon name="lock" className="field__icon size-3.5" />
          <button
            type="button"
            className="field__toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
          >
            <Icon name={showPassword ? "eye-off" : "eye"} className="size-4" />
          </button>
          <span id="password-error" className="field__error" role="alert">
            {errors.password ?? ""}
          </span>
        </div>

        <div className="form-row">
          <label className="checkbox">
            <input type="checkbox" name="remember" id="remember" />
            <span className="checkbox__box">
              <Icon name="check" className="size-2.5" />
            </span>
            {t("auth.rememberMe")}
          </label>
          <Link href="/forgot-password" className="link-btn">
            {t("auth.forgotPassword")}
          </Link>
        </div>

        <button
          type="submit"
          className={`btn-primary${pending ? " is-loading" : ""}`}
          // Disabled ONLY while the request is in flight (prevents a double
          // submit). An incomplete form still submits, so the user is told what
          // is wrong instead of facing a dead button with no explanation.
          disabled={pending}
          onClick={ripple}
        >
          <span className="btn-primary__label">{t("auth.loginButton")}</span>
          <span className="btn-primary__loader" aria-hidden>
            <svg viewBox="0 0 50 14" className="route-spinner">
              <path d="M2 12 Q 12 2, 22 12 T 42 12" />
              <circle r="3" className="route-spinner__dot">
                <animateMotion dur="1.1s" repeatCount="indefinite" path="M2 12 Q 12 2, 22 12 T 42 12" />
              </circle>
            </svg>
          </span>
        </button>

        <div className="divider">
          <span>{t("auth.orContinueWith")}</span>
        </div>

        {/*
          Social sign-in is rendered per the design but no OAuth provider is
          configured (no Facebook/Google app id + secret). Rather than fake a
          success toast, the buttons state plainly that it is unavailable.
        */}
        <div className="social-row">
          <button
            type="button"
            className="btn-social btn-social--fb"
            onClick={(e) => {
              ripple(e);
              showToast(t("auth.socialUnavailable"));
            }}
          >
            <Icon name="facebook" /> {t("auth.facebook")}
          </button>
          <button
            type="button"
            className="btn-social btn-social--gmail"
            onClick={(e) => {
              ripple(e);
              showToast(t("auth.socialUnavailable"));
            }}
          >
            <Icon name="google" /> {t("auth.gmail")}
          </button>
        </div>

        <p className="switch-text">
          {t("auth.noAccount")}{" "}
          {/* Customer registration lives at /register (/register/customer is a legacy redirect). */}
          <Link href="/register" className="switch-link">
            {t("auth.registerNow")}
          </Link>
        </p>
      </form>

      <div className={`toast${toast ? " is-visible" : ""}`} role="status" aria-live="polite">
        <Icon name="bell" />
        <span>{toast}</span>
      </div>
    </>
  );
}
