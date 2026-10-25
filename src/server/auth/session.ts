import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { withUser } from "@/server/db/client";
import { createSupabaseServerClient } from "./supabase";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isAdmin: boolean;
};

/**
 * Resolves the signed-in user, validating the session with Supabase Auth
 * (getUser contacts the auth server; it does not trust the cookie alone).
 * Cached for the duration of one request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const userId = data.user.id;
  const rows = await withUser(userId, (tx) => tx<{ email: string; full_name: string; phone: string | null; platform_role: string }[]>`
    select email, full_name, phone, platform_role from public.profiles where id = ${userId}
  `);
  const profile = rows[0];
  if (!profile) return null;
  return {
    id: userId,
    email: profile.email,
    fullName: profile.full_name,
    phone: profile.phone,
    isAdmin: profile.platform_role === "admin",
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  // Not found rather than forbidden, so staff pages do not reveal themselves.
  if (!user.isAdmin) notFound();
  return user;
}
