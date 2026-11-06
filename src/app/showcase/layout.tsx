import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { showcaseMode } from "@/server/env";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The presentation preview exists only when QUICKPRO_SHOWCASE=on (D-047). */
export default function ShowcaseLayout({ children }: { children: React.ReactNode }) {
  if (!showcaseMode()) notFound();
  return children;
}
