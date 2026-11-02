import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <PageIntro eyebrow="About QuickPro" title="A local marketplace for commercial service work.">
      <p>
        QuickPro connects the businesses that keep buildings running (cleaning, pressure washing, landscaping and
        facility services) with the property managers who hire them and the local workers who staff the jobs.
      </p>
      <p>
        We are starting in Suffolk County, New York, and onboarding businesses and workers there now. Every business
        and worker profile is reviewed by QuickPro staff before it can take part.
      </p>
      <p>
        <Link href="/#how-it-works" className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
          See how it works
        </Link>
      </p>
    </PageIntro>
  );
}
