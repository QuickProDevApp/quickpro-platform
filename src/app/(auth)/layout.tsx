import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface sm:bg-canvas">
      <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-4 sm:px-6">
        <Logo />
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:pt-12">
        <main className="w-full max-w-[400px] [&_form_button[type=submit]]:w-full sm:rounded-xl sm:border sm:border-line sm:bg-surface sm:p-8 sm:shadow-[0_1px_3px_rgba(13,22,38,0.04)]">
          {children}
        </main>
      </div>
    </div>
  );
}
