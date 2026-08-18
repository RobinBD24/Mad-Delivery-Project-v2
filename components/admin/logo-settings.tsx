"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { FieldError } from "@/components/ui/field-error";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors } from "@/lib/validation/contract";
import { IMAGE_MIME_TYPES } from "@/lib/validation/limits";
import { validateImageFile } from "@/lib/validation/rules";

/**
 * Super-admin global company logo manager (req #3). Uploads/replaces or clears
 * the single logo used across every surface. RBAC is enforced by the API
 * (super admin only); this UI is only shown on the super-admin settings page.
 */
export function LogoSettings({ initialUrl }: { initialUrl: string | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Same MIME/extension/size limits the API enforces on the way in. */
  function checkFile(candidate: File | null): string | null {
    const problem = validateImageFile(candidate, true);
    return problem ? t(problem.key, problem.vars) : null;
  }

  async function upload() {
    // Client validation FIRST — nothing is sent while it fails, and the chosen
    // file stays selected so the user can see exactly what was rejected.
    const clientError = checkFile(file);
    if (clientError) {
      setFileError(clientError);
      setSuccess(null);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setFileError(null);
    setSuccess(null);
    try {
      const body = new FormData();
      body.set("logo", file as File);
      const res = await fetch("/api/admin/settings/logo", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (!res.ok) {
        // The API answers with a field map; `logo` lands under the file input.
        const { fieldErrors, formError } = parseFieldErrors(data, t("logo.uploadFailed"));
        setFileError(fieldErrors.logo ?? null);
        setError(fieldErrors.logo ? null : formError);
        return;
      }
      setUrl(data.url ?? null);
      // Cleared ONLY after a confirmed success.
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setSuccess(t("logo.updated"));
      router.refresh();
    } catch {
      setError(t("logo.uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    setFileError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/settings/logo", { method: "DELETE" });
      if (!res.ok) throw new Error(t("logo.removeFailed"));
      setUrl(null);
      setSuccess(t("logo.removed"));
      router.refresh();
      return { error: null, success: t("logo.removed") };
    } catch (e) {
      const message = e instanceof Error ? e.message : t("logo.removeFailed");
      setError(message);
      return { error: message };
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Alert tone="error" message={error} />
      <Alert tone="success" message={success} />
      <div className="flex items-center gap-3">
        <span className="flex size-14 items-center justify-center overflow-hidden rounded-xl bg-surface-muted">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={t("logo.current")}
              width={56}
              height={56}
              loading="lazy"
              decoding="async"
              className="size-14 object-contain"
            />
          ) : (
            <span className="text-xs text-fg-subtle">{t("logo.none")}</span>
          )}
        </span>
        <p className="text-xs text-fg-muted">{t("logo.hint")}</p>
      </div>
      <div>
        <input
          id="logo-file"
          aria-label={t("logo.fileLabel")}
          ref={inputRef}
          type="file"
          accept={IMAGE_MIME_TYPES.join(",")}
          aria-invalid={Boolean(fileError)}
          aria-describedby={fileError ? "logo-file-error" : undefined}
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            setFile(picked);
            // Re-check as soon as the choice changes, so the message clears the
            // moment a valid file is picked.
            setFileError(picked ? checkFile(picked) : null);
          }}
          className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <FieldError id="logo-file-error" message={fileError} />
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={upload} disabled={busy}>
          {busy ? <Spinner className="size-4" /> : null}
          {url ? t("logo.replace") : t("logo.upload")}
        </Button>
        {url ? (
          <ConfirmModal
            trigger={
              <Button type="button" variant="outline" disabled={busy}>
                {t("logo.remove")}
              </Button>
            }
            title={t("logo.removeTitle")}
            description={t("logo.removeMessage")}
            confirmLabel={t("logo.confirmRemove")}
            action={remove}
          />
        ) : null}
      </div>
    </div>
  );
}
