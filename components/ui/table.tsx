import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  const rows = Children.map(children, (row) => {
    if (!isValidElement<{ children?: ReactNode; className?: string }>(row)) return row;
    const cells = Children.map(row.props.children, (cell, index) => {
      if (!isValidElement<{ dataLabel?: string }>(cell)) return cell;
      return cloneElement(cell, { dataLabel: headers[index] ?? "" });
    });
    return cloneElement(
      row as ReactElement<{ className?: string }>,
      {
        className: cn(
          row.props.className,
          "max-md:block max-md:overflow-hidden max-md:rounded-2xl max-md:border max-md:border-border-base max-md:bg-surface-card max-md:shadow-[var(--dashboard-shadow-panel)]",
        ),
      },
      cells,
    );
  });

  return (
    <div data-testid="responsive-table" className="scrollbar-thin min-w-0 md:overflow-x-auto">
      <table className="w-full text-left text-sm md:min-w-max">
        <thead className="bg-surface-muted/80 max-md:sr-only">
          <tr className="border-b border-border-base text-[11px] uppercase tracking-[0.4px] text-fg-subtle">
            {headers.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-3.5 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-base/80 max-md:grid max-md:gap-3 max-md:divide-y-0 max-md:p-3 [&_tr:last-child]:border-b-0">
          {rows}
        </tbody>
      </table>
    </div>
  );
}

export function Td({
  className,
  dataLabel,
  /** .mono in the mockup — tabular figures for amounts, times and ids. */
  mono = false,
  children,
}: {
  className?: string;
  /** Injected by Table so mobile row cards retain visible column identity. */
  dataLabel?: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <td
      data-label={dataLabel || undefined}
      className={cn(
        "px-3.5 py-3 align-middle text-[13px] leading-5 text-fg-base max-md:grid max-md:min-w-0 max-md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] max-md:items-center max-md:gap-3 max-md:border-b max-md:border-border-base max-md:px-4 max-md:py-2.5 max-md:text-right max-md:before:text-left max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-fg-subtle max-md:before:content-[attr(data-label)] max-md:last:border-b-0",
        !dataLabel && "max-md:flex max-md:justify-end max-md:before:hidden",
        mono && "font-mono tabular-nums",
        className,
      )}
    >
      {children}
    </td>
  );
}
