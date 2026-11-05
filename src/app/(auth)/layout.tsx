import { Logo } from "@/components/brand/logo";
import { display } from "@/fonts/display";

const sides = [
  { who: "Property owners and managers", what: "Post projects, ask contractors questions, compare quotes and pay invoices." },
  { who: "Contractors and subcontractors", what: "Quote on local projects, staff the work and bill for it." },
  { who: "Tradespeople and crew", what: "Pick up shifts nearby with the pay shown up front." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} grid min-h-dvh flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]`}>
      <div className="flex flex-col bg-surface sm:bg-canvas">
        <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-4 sm:px-6">
          <Logo />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:pt-12">
          <main className="w-full max-w-[420px] [&_form_button[type=submit]]:w-full sm:rounded-[8px] sm:border sm:border-line sm:bg-surface sm:p-8 sm:shadow-[0_1px_3px_rgba(36,43,49,0.05)]">
            {children}
          </main>
        </div>
      </div>
      <aside className="on-dark hidden flex-col justify-between bg-charcoal px-12 py-14 text-white lg:flex">
        <div>
          <p className="flex items-center gap-2 text-[12.5px] font-semibold tracking-[0.08em] text-[#e8955a] uppercase">
            <span aria-hidden className="h-[7px] w-[7px] bg-signal" />
            One account, every side of the job
          </p>
          <p className="mt-6 font-display text-[36px] leading-[1.1] font-medium tracking-[-0.02em] text-balance">
            From the first bid to the final invoice.
          </p>
        </div>
        <ul className="border-t border-white/15">
          {sides.map((s) => (
            <li key={s.who} className="border-b border-white/15 py-5">
              <p className="text-[14px] font-semibold">{s.who}</p>
              <p className="mt-1 text-[14px] leading-6 text-white/65">{s.what}</p>
            </li>
          ))}
        </ul>
        <p className="text-[12.5px] leading-5 text-white/45">
          QuickPro staff review every business and worker profile before it can take part. Suffolk County, New York.
        </p>
      </aside>
    </div>
  );
}
