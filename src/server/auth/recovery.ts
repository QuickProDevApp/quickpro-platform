import "server-only";
import { cookies } from "next/headers";

/**
 * Marks a session that was just created from a password-reset link, so the
 * reset page can set a new password without asking for the old one. It is
 * set only by /auth/confirm after Supabase accepts the link, is httpOnly and
 * lasts 15 minutes. Every other password change needs the current password.
 */
export const RECOVERY_COOKIE = "qp_recovery";

export async function markRecoverySession() {
  (await cookies()).set(RECOVERY_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
}

export async function isRecoverySession() {
  return (await cookies()).get(RECOVERY_COOKIE)?.value === "1";
}

export async function clearRecoverySession() {
  (await cookies()).delete(RECOVERY_COOKIE);
}
