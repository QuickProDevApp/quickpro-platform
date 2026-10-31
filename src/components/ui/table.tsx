import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Data tables. Rows can link to a detail page: put a RowLink in the first
 * cell and the whole row becomes clickable without nesting interactive
 * elements. Wrap in a Card; tables scroll sideways on narrow screens.
 */
export function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm" aria-label={label}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-line bg-subtle/60">{children}</tr>
    </thead>
  );
}

export function Th({ children, align = "left", className = "" }: { children?: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <th
      scope="col"
      className={`h-9 px-4 text-xs font-medium whitespace-nowrap text-muted first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5 ${
        align === "right" ? "text-right" : ""
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function Tr({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <tr className="relative transition-colors hover:bg-subtle/60" data-testid={testId}>
      {children}
    </tr>
  );
}

export function Td({ children, align = "left", className = "" }: { children?: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td
      className={`px-4 py-3 align-middle first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5 ${align === "right" ? "text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/** A link that covers its whole table row. */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand">
      {children}
    </Link>
  );
}
