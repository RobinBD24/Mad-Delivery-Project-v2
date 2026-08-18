"use client";

/**
 * Root fatal-error boundary. It replaces the root layout (and the i18n
 * provider), so it can't use `useTranslation()` — it reads the locale cookie
 * directly and falls back to a tiny inline dictionary. Default: Bangla.
 */
const STRINGS = {
  bn: {
    title: "কিছু একটা ভুল হয়েছে",
    desc: "একটি অপ্রত্যাশিত সমস্যা হয়েছে। আবার চেষ্টা করুন।",
    retry: "আবার চেষ্টা করুন",
  },
  en: {
    title: "Something went wrong",
    desc: "An unexpected error occurred. Please try again.",
    retry: "Try again",
  },
};

function readLocale(): "bn" | "en" {
  if (typeof document === "undefined") return "bn";
  const match = document.cookie.match(/(?:^|;\s*)mad_locale=(bn|en)/);
  return match ? (match[1] as "bn" | "en") : "bn";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const s = STRINGS[readLocale()];
  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            textAlign: "center",
            padding: "1rem",
            color: "#334155",
          }}
        >
          <div style={{ fontSize: "2.5rem" }}>⚠️</div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{s.title}</h1>
          <p style={{ maxWidth: "24rem", color: "#64748b", fontSize: "0.9rem" }}>{s.desc}</p>
          {error.digest ? <p style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Ref: {error.digest}</p> : null}
          <button
            onClick={reset}
            style={{
              background: "#e11d48",
              color: "#fff",
              border: "none",
              borderRadius: "0.75rem",
              padding: "0.6rem 1.2rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {s.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
