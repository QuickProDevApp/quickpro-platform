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
    <div className="mb-4 flex flex-wrap gap-1.5">
      {options.map((o) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(extra)) if (v) qs.set(k, v);
        if (o.value) qs.set(param, o.value);
        const active = o.value === current;
        return (
          <Link
            key={o.label}
            href={`${basePath}${qs.size ? `?${qs}` : ""}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              active ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-soft hover:border-line-strong"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
