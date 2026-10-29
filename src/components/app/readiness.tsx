import Link from "next/link";
import type { ReadinessItem } from "@/server/data/organizations";

export function ReadinessList({ items }: { items: ReadinessItem[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.label} className="flex items-center justify-between gap-3 py-2.5">
          <span className="flex items-center gap-3 text-sm">
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                item.done ? "bg-ok text-white" : "border border-line-strong text-transparent"
              }`}
            >
              ✓
            </span>
            <span className={item.done ? "text-ink" : "text-ink-soft"}>
              {item.label}
              <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
            </span>
          </span>
          {!item.done ? (
            <Link href={item.href} className="text-sm font-medium text-brand hover:underline">
              Add
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
