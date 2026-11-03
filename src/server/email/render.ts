// Renders a notification as an email (D-039). Pure, so it is unit tested.

export type NotificationEmail = {
  toName: string | null;
  kind: string;
  title: string;
  body: string;
  linkPath: string | null;
};

export type RenderedEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** One line, no control characters: safe for a subject header. */
function headerSafe(value: string) {
  return value.replace(/[\r\n\t\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 200);
}

export function renderNotificationEmail(n: NotificationEmail, siteUrl: string): RenderedEmail {
  const base = siteUrl.replace(/\/+$/, "");
  // Only links inside the app, as stored by the database.
  const link = n.linkPath && /^\/app(\/[A-Za-z0-9/_-]*)?$/.test(n.linkPath) ? `${base}${n.linkPath}` : `${base}/app/notifications`;
  const settings = `${base}/app/account`;
  const greeting = n.toName ? `Hi ${n.toName.split(" ")[0]},` : "Hi,";
  const subject = headerSafe(n.title);
  const text = [
    greeting,
    "",
    n.title,
    n.body ? `\n${n.body}` : "",
    "",
    `Open it in QuickPro: ${link}`,
    "",
    "—",
    "You get this email because you have notifications on QuickPro.",
    `Turn emails off in your account settings: ${settings}`,
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0d1626">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e6eb;border-radius:10px">
<tr><td style="padding:20px 24px 0;font-size:15px;font-weight:700;color:#0d1626">QuickPro</td></tr>
<tr><td style="padding:16px 24px 0;font-size:14px;color:#3b4556">${escapeHtml(greeting)}</td></tr>
<tr><td style="padding:8px 24px 0;font-size:17px;font-weight:600;line-height:1.4">${escapeHtml(n.title)}</td></tr>
${n.body ? `<tr><td style="padding:8px 24px 0;font-size:14px;line-height:1.55;color:#3b4556;white-space:pre-line">${escapeHtml(n.body)}</td></tr>` : ""}
<tr><td style="padding:20px 24px 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#13213c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 16px;border-radius:6px">Open in QuickPro</a></td></tr>
</table>
<p style="max-width:520px;margin:12px auto 0;font-size:12px;line-height:1.5;color:#6b7585">You get this email because you have notifications on QuickPro. <a href="${escapeHtml(settings)}" style="color:#6b7585">Turn emails off</a> in your account settings.</p>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}
