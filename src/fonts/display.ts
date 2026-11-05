import localFont from "next/font/local";

/**
 * Source Serif 4 (SIL Open Font License, see SourceSerif4-OFL.txt), the
 * display face for headings on the public site and the sign-in pages. The
 * file carries the weight and optical-size axes, so large headings get the
 * display cut. Apply `display.variable` on the page wrapper and use the
 * `font-display` utility.
 */
export const display = localFont({
  src: "./source-serif-4-latin-opsz.woff2",
  variable: "--font-source-serif",
  weight: "200 900",
  display: "swap",
  fallback: ["Georgia", "serif"],
});
