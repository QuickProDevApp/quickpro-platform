import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 pt-16 pb-24 sm:px-8 sm:pt-24">{children}</main>
      <SiteFooter />
    </div>
  );
}
