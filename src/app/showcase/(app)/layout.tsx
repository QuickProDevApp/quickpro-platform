import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ViewSwitcher } from "@/showcase/view-switcher";

/** The signed-in look, for sample screens only (D-047). Nobody is signed in. */
export default function ShowcaseAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo />
          <Link href="/showcase" className="text-[13.5px] font-medium text-muted hover:text-ink">
            All screens
          </Link>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
          <ViewSwitcher />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
