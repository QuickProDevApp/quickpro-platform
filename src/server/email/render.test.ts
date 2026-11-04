import { describe, expect, it } from "vitest";
import { renderNotificationEmail } from "./render";

describe("notification emails", () => {
  it("link into the app and to the email setting", () => {
    const e = renderNotificationEmail(
      { toName: "Wendy Alvarez", kind: "job.offered", title: "You're offered: Lobby floors", body: "Saturday 7:00 AM", linkPath: "/app/worker/jobs/abc" },
      "https://quickpro.example/",
    );
    expect(e.subject).toBe("You're offered: Lobby floors");
    expect(e.text).toContain("Hi Wendy,");
    expect(e.text).toContain("Open it in QuickPro: https://quickpro.example/app/worker/jobs/abc");
    expect(e.text).toContain("https://quickpro.example/app/account");
    expect(e.html).toContain('href="https://quickpro.example/app/worker/jobs/abc"');
  });

  it("escape HTML, keep subjects to one line, and refuse links outside the app", () => {
    const e = renderNotificationEmail(
      { toName: null, kind: "job.message", title: "New message\r\nBcc: x@y.z", body: "<script>alert(1)</script> & co", linkPath: "https://evil.example" },
      "http://localhost:3000",
    );
    expect(e.subject).toBe("New message Bcc: x@y.z");
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co");
    expect(e.html).toContain('href="http://localhost:3000/app/notifications"');
    expect(e.text).toContain("Hi,");
  });
});
