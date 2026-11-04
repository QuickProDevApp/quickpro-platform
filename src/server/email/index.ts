import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { withMailer } from "@/server/db/client";
import { env } from "@/server/env";
import { deliverPendingEmails, type EmailTransport } from "./deliver";

// Notification email (D-039): the configured transport, and a throttled
// drain the app runs after requests and a scheduler can call.

let transport: EmailTransport | null | undefined;

function getTransport(): EmailTransport | null {
  if (transport !== undefined) return transport;
  const e = env();
  if (e.EMAIL_DRIVER === "smtp") {
    const smtp = nodemailer.createTransport(e.SMTP_URL!);
    transport = {
      async send(m) {
        await smtp.sendMail({ from: m.from, to: m.to, subject: m.subject, text: m.text, html: m.html });
      },
    };
  } else if (e.EMAIL_DRIVER === "log") {
    const dir = path.resolve(e.EMAIL_LOG_DIR);
    transport = {
      async send(m) {
        await mkdir(dir, { recursive: true });
        const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
        await writeFile(path.join(dir, name), JSON.stringify(m, null, 2));
      },
    };
  } else {
    transport = null;
  }
  return transport;
}

/** Whether notification emails are being sent at all (a provider is configured). */
export function emailDeliveryEnabled() {
  return env().EMAIL_DRIVER !== "none";
}

let running: Promise<DeliveryResult> | null = null;
let again = false;
type DeliveryResult = { claimed: number; sent: number; failed: number };
const none: DeliveryResult = { claimed: 0, sent: 0, failed: 0 };

/**
 * Sends queued emails. One drain at a time per server process; a request
 * that arrives during a drain makes it go round once more, so nothing queued
 * meanwhile waits for the next request. Never throws: a mail outage must not
 * break a page.
 */
export async function deliverEmailsSoon(): Promise<DeliveryResult> {
  const t = getTransport();
  if (!t) return none;
  if (running) {
    again = true;
    return running;
  }
  const e = env();
  const deps = { run: withMailer, transport: t, from: e.EMAIL_FROM, siteUrl: e.NEXT_PUBLIC_SITE_URL };
  running = (async () => {
    const total = { ...none };
    try {
      let rounds = 0;
      let full = false;
      do {
        again = false;
        const r = await deliverPendingEmails(deps, 20);
        full = r.claimed === 20;
        total.claimed += r.claimed;
        total.sent += r.sent;
        total.failed += r.failed;
      } while ((again || full) && ++rounds < 10);
    } catch (error) {
      console.error("Notification email delivery failed", error);
    }
    return total;
  })().finally(() => {
    running = null;
  });
  return running;
}
