import Image from "next/image";
import Link from "next/link";

/** The QuickPro Q mark (the supplied logo artwork) with the wordmark. */
export function LandingLogo({ size = 34 }: { size?: number }) {
  return (
    <Link href="/" aria-label="QuickPro home" className="group inline-flex items-center gap-2.5 rounded-md">
      <Image
        src="/brand/quickpro-q.png"
        alt=""
        width={size}
        height={size}
        priority
        className="transition-transform duration-300 ease-out group-hover:-rotate-6"
      />
      <span className="text-[20px] font-bold tracking-[-0.035em] text-qp-navy">QuickPro</span>
    </Link>
  );
}
