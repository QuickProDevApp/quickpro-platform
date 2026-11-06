import type { Metadata } from "next";
import { Ecosystem } from "@/components/landing/ecosystem";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingMotion } from "@/components/landing/motion";
import { FinalCta, Trust, WorkersBand } from "@/components/landing/sections";
import { Services } from "@/components/landing/services";
import { demoMode, showcaseMode } from "@/server/env";

export const metadata: Metadata = {
  title: { absolute: "QuickPro · Find the right crew. Get it done." },
  description:
    "Discover contractors and skilled workers for projects big or small in Suffolk County, NY. Post a project, compare quotes, hire and pay in one place.",
};

/** The public landing page (D-048). Its components live in src/components/landing. */
export default function HomePage() {
  const disclosure = showcaseMode()
    ? "Presentation preview: businesses and people shown are samples. Nothing is saved."
    : demoMode()
      ? "Demo environment: businesses and people shown are examples. Card payments run in test mode."
      : "Illustrations use sample businesses and people.";
  return (
    <LandingMotion>
      <div className="landing flex min-h-full flex-col bg-white text-qp-navy">
        {showcaseMode() || demoMode() ? (
          <div role="note" aria-label={showcaseMode() ? "Presentation preview" : "Demo environment"} className="bg-qp-navy text-[12.5px] text-white/80">
            <p className="mx-auto flex max-w-[1240px] items-center justify-center gap-2 px-5 py-2 text-center sm:px-8">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-qp-cyan" />
              <span>
                <span className="font-semibold text-white">{showcaseMode() ? "Presentation preview." : "Demo environment."}</span>{" "}
                {showcaseMode() ? "Sample businesses and people; nothing is saved." : "Example records; card payments in test mode."}
                {showcaseMode() ? (
                  <a href="/showcase" className="ml-2 font-semibold text-qp-cyan underline-offset-4 hover:underline">
                    Tour the screens
                  </a>
                ) : null}
              </span>
            </p>
          </div>
        ) : null}
        <LandingHeader />
        <main className="flex-1">
          <Hero />
          <Services />
          <HowItWorks />
          <Ecosystem />
          <WorkersBand />
          <Trust />
          <FinalCta />
        </main>
        <LandingFooter disclosure={disclosure} />
      </div>
    </LandingMotion>
  );
}
