import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-medium text-brand">404</p>
      <h1 className="mt-2 text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-sm text-muted">It may have moved, or you may not have access to it.</p>
      <LinkButton href="/app" className="mt-6">
        Go to your dashboard
      </LinkButton>
    </div>
  );
}
