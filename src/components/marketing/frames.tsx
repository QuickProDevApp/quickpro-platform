import Image from "next/image";

/**
 * Product screens from the running QuickPro app, captured with example data
 * (scripted, see docs/design.md). Frames are deliberately quiet: a hairline
 * border, a soft shadow, no fake browser chrome.
 */
export function ScreenFrame({
  src,
  alt,
  width,
  height,
  priority = false,
  className = "",
  sizes = "(min-width: 1024px) 720px, 100vw",
  zoomOnPhones = true,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
  sizes?: string;
  /** On narrow screens, show the top-left of the screen at a readable size instead of the whole thing shrunk. */
  zoomOnPhones?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[10px] border border-ink/10 bg-surface shadow-[0_1px_2px_rgba(13,22,38,0.04),0_24px_48px_-24px_rgba(13,22,38,0.22)] ${className}`}
    >
      <div className={zoomOnPhones ? "aspect-[5/4] overflow-hidden sm:aspect-auto" : undefined}>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes={zoomOnPhones ? `(max-width: 639px) 180vw, ${sizes}` : sizes}
          className={`block h-auto ${zoomOnPhones ? "w-[180%] max-w-none sm:w-full sm:max-w-full" : "w-full"}`}
        />
      </div>
    </div>
  );
}

export function PhoneFrame({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`rounded-[34px] bg-ink p-[7px] shadow-[0_30px_60px_-28px_rgba(13,22,38,0.45)] ring-1 ring-ink/80 ${className}`}
    >
      {/* The top of the screen, at a phone's proportions without the empty space below short lists. */}
      <div className="aspect-[390/640] overflow-hidden rounded-[27px] bg-surface">
        <Image src={src} alt={alt} width={1170} height={1992} priority={priority} sizes="(min-width: 1024px) 300px, 70vw" className="block h-auto w-full" />
      </div>
    </div>
  );
}
