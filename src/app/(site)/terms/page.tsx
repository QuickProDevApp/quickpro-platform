import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "Terms of service" };

export default function Page() {
  return (
    <PageIntro eyebrow="Terms of service" title="Terms of service">
      <p>
        QuickPro is in early access in Suffolk County, New York. Our terms of service are being
        finalized and will be published here before QuickPro opens to the public.
      </p>
    </PageIntro>
  );
}
