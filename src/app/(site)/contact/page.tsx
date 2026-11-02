import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <PageIntro eyebrow="Contact" title="Talk to the QuickPro team.">
      <p>
        QuickPro is in early access in Suffolk County, New York. A support email address and phone line will be listed
        here before QuickPro opens to the public.
      </p>
      <p>
        Registration questions are answered in the app: QuickPro staff leave their review notes on your business or
        worker profile.
      </p>
      <p>
        <Link href="/sign-in" className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
          Log in
        </Link>{" "}
        or{" "}
        <Link href="/sign-up" className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
          create an account
        </Link>
        .
      </p>
    </PageIntro>
  );
}
