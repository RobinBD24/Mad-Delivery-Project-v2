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
    <div className="rounded-3xl bg-white p-8 shadow-2xl sm:p-10">
      <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-6">
        <RegisterForm rolePath={rolePath} withRiderFields={withRiderFields} />
      </div>
      {footer ? <div className="mt-4 text-center text-sm text-slate-500">{footer}</div> : null}
    </div>
  );
}
