import type { Tx } from "@/server/db/rls";
import { diffIds } from "@/server/data/sets";

export type WorkerProfileInput = {
  headline: string;
  bio: string;
  homeServiceAreaId: string | null;
  maxTravelMiles: number;
  hasVehicle: boolean;
  hasDriversLicense: boolean;
  yearsExperience: number | null;
  desiredHourlyRate: number | null;
};

async function replaceSet(tx: Tx, table: "worker_skills" | "worker_service_areas", column: "skill_id" | "service_area_id", userId: string, desired: string[]) {
  const current = await tx<{ id: string }[]>`
    select ${tx(column)} as id from ${tx("public." + table)} where user_id = ${userId}
  `;
  const { add, remove } = diffIds(
    current.map((r) => r.id),
    desired,
  );
  if (remove.length) {
    await tx`delete from ${tx("public." + table)} where user_id = ${userId} and ${tx(column)} in ${tx(remove)}`;
  }
  for (const id of add) {
    await tx`insert into ${tx("public." + table)} (user_id, ${tx(column)}) values (${userId}, ${id})`;
  }
}

/**
 * Saves the profile fields, skills and preferred towns together. Call inside
 * one transaction (withUser) so a failure in any part leaves all of them as
 * they were.
 */
export async function saveWorkerProfile(
  tx: Tx,
  userId: string,
  input: WorkerProfileInput,
  skillIds: string[],
  areaIds: string[],
) {
  const updated = await tx`
    update public.worker_profiles set
      headline = ${input.headline},
      bio = ${input.bio},
      home_service_area_id = ${input.homeServiceAreaId},
      max_travel_miles = ${input.maxTravelMiles},
      has_vehicle = ${input.hasVehicle},
      has_drivers_license = ${input.hasDriversLicense},
      years_experience = ${input.yearsExperience},
      desired_hourly_rate_cents = ${input.desiredHourlyRate}
    where user_id = ${userId}
  `;
  if (updated.count !== 1) throw new Error("Worker profile not found.");
  await replaceSet(tx, "worker_skills", "skill_id", userId, skillIds);
  await replaceSet(tx, "worker_service_areas", "service_area_id", userId, areaIds);
}
