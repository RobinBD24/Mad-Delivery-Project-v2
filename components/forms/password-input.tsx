"use client";

import { useState, type InputHTMLAttributes } from "react";

import { Icon } from "@/components/layout/icons";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide eye toggle.
 * Drop-in replacement for `<Input type="password" />`; keeps all native input
 * props (name, required, disabled, defaultValue, autoComplete, …) so it slots
 * into existing `<Field>` wrappers and uncontrolled form actions unchanged.
 * Each instance manages its own visibility state.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("common.hidePassword") : t("common.showPassword")}
        aria-pressed={visible}
        disabled={props.disabled}
        className={cn(
          "absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3 text-fg-subtle",
          "hover:text-fg-muted focus:text-fg-muted focus:outline-2 focus:outline-brand-500/20",
          "disabled:cursor-not-allowed disabled:text-slate-300",
        )}
      >
        <Icon name={visible ? "eye-off" : "eye"} />
      </button>
    </div>
  );
}
