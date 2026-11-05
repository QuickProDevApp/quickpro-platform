import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <PageIntro eyebrow="About QuickPro" title="A local marketplace for construction and the trades.">
      <p>
        QuickPro connects the property owners and managers who commission commercial work with the contractors who build
        and maintain it (general construction, carpentry, drywall and paint, flooring, masonry and concrete, and
        commercial services such as cleaning and landscaping) and with the local tradespeople and crew who staff each job.
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
