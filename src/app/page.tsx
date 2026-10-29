import { Logo } from "@/components/brand/logo";
import { LinkButton } from "@/components/ui/button";

const steps = [
  {
    title: "Register your business",
    body: "List your services and the Suffolk County towns you cover, and upload your certificate of insurance.",
  },
  {
    title: "Get reviewed by our team",
    body: "QuickPro staff review every business and worker profile before they can take part.",
  },
  {
    title: "Fill the work you win",
    body: "When a job needs more hands than you have, we help you find qualified local people to staff it.",
  },
];

const categories = ["Commercial cleaning", "Pressure washing", "Landscaping", "Facility services"];

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col bg-surface">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            <LinkButton href="/sign-in" variant="ghost">
              Sign in
            </LinkButton>
            <LinkButton href="/sign-up">Get started</LinkButton>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-navy text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1.2fr_1fr] md:py-24">
            <div>
              <p className="text-sm font-medium tracking-wide text-blue-200 uppercase">Now onboarding in Suffolk County, NY</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                Take on more commercial work without turning jobs away.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-blue-100">
                QuickPro connects local service companies with flexible, qualified labor and the tools to coordinate
                every job, so smaller crews can say yes to bigger opportunities.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <LinkButton href="/sign-up?as=contractor" className="bg-white !text-navy hover:bg-blue-50">
                  Register your business
                </LinkButton>
                <LinkButton
                  href="/sign-up?as=worker"
                  variant="secondary"
                  className="border-white/30 bg-transparent !text-white hover:bg-white/10"
                >
                  Find local work
                </LinkButton>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-sm font-medium text-blue-100">Launch categories</p>
              <ul className="mt-4 space-y-3">
                {categories.map((c) => (
                  <li key={c} className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-3 text-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                    {c}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-blue-200">
                Nassau County and more categories will follow once Suffolk is running well.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">How it works for contractors</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="rounded-xl border border-line p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-3xl text-sm text-muted">
            QuickPro is in early access. Staffing requests and job coordination tools are rolling out to approved
            businesses first. Property managers and facilities teams can register now; our team will reach out as
            service requests open in your area.
          </p>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted sm:px-6">
          <span>© {new Date().getFullYear()} QuickPro</span>
          <LinkButton href="/sign-up?as=customer" variant="ghost" size="sm">
            Register a property or facility
          </LinkButton>
        </div>
      </footer>
    </div>
  );
}
