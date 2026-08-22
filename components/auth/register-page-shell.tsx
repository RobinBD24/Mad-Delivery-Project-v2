import type { ReactNode } from "react";

import { RegisterForm } from "@/components/auth/register-form";

export function RegisterPageShell({
  title,
  subtitle,
  rolePath,
  withRiderFields = false,
  footer,
}: {
  title: string;
  subtitle: string;
  rolePath: string;
  withRiderFields?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-surface-card p-8 shadow-2xl ring-1 ring-border-base/60 sm:p-10">
      {/* Brand accent bar */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-brand-400 to-brand-300" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-fg-base">{title}</h1>
      <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>
      <div className="mt-7">
        <RegisterForm rolePath={rolePath} withRiderFields={withRiderFields} />
      </div>
      {footer ? <div className="mt-5 text-center text-sm text-fg-muted">{footer}</div> : null}
    </div>
  );
}
