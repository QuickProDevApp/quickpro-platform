import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Page() {
  return (
    <PageIntro eyebrow="Privacy policy" title="Privacy policy">
      <p>
        QuickPro is in early access in Suffolk County, New York. Our privacy policy is being
        finalized and will be published here before QuickPro opens to the public.
      </p>
    </PageIntro>
  );
}
