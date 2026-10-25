import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center px-4 py-10 sm:py-16">
      <Logo />
      <main className="mt-8 w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        {children}
      </main>
    </div>
  );
}
