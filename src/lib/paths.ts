/** Only allow redirects to paths inside the app, never to another origin. */
export function safeNextPath(value: unknown, fallback = "/app"): string {
  if (typeof value !== "string") return fallback;
  // Browsers drop tabs and newlines from URLs, so "/\t/evil.example" would
  // become "//evil.example". Refuse control characters and spaces outright.
  if (/[\u0000-\u0020\u007f]/.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
