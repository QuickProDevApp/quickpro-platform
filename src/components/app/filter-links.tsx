import Link from "next/link";

export function FilterLinks({
  options,
  current,
  param,
  basePath,
  extra = {},
}: {
  options: { value: string | undefined; label: string }[];
  current: string | undefined;
  param: string;
  basePath: string;
  extra?: Record<string, string | undefined>;
}) {
  return (
    <div className="mb-4 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-subtle p-0.5 ring-1 ring-inset ring-line [scrollbar-width:none]">
      {options.map((o) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(extra)) if (v) qs.set(k, v);
        if (o.value) qs.set(param, o.value);
        const active = o.value === current;
        return (
          <Link
            key={o.label}
            href={`${basePath}${qs.size ? `?${qs}` : ""}`}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-[5px] px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
              active ? "bg-surface text-ink shadow-[0_1px_2px_rgba(13,22,38,0.08)] ring-1 ring-line" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
