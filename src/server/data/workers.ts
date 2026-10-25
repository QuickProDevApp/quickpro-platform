import "server-only";
import { withUser } from "@/server/db/client";
import { UserFacingError } from "@/server/errors";
import type { ReviewStatus } from "@/lib/labels";
import { diffIds } from "./sets";

export type WorkerProfile = {
  user_id: string;
  headline: string;
  bio: string;
  home_service_area_id: string | null;
  home_area_name: string | null;
  max_travel_miles: number;
  has_vehicle: boolean;
  has_drivers_license: boolean;
  years_experience: number | null;
  desired_hourly_rate_cents: number | null;
  status: ReviewStatus;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  review_notes: string | null;
  created_at: Date;
};

export type AvailabilityWindow = { id: string; weekday: number; start_time: string; end_time: string };

export async function getWorkerProfile(userId: string): Promise<WorkerProfile | null> {
  const rows = await withUser(userId, (tx) => tx<WorkerProfile[]>`
    select w.*, a.name as home_area_name
    from public.worker_profiles w
    left join public.service_areas a on a.id = w.home_service_area_id
    where w.user_id = ${userId}
  `);
  return rows[0] ?? null;
}

export async function createWorkerProfile(userId: string) {
  await withUser(userId, (tx) => tx`
    insert into public.worker_profiles (user_id) values (${userId}) on conflict (user_id) do nothing
  `);
}

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

export async function updateWorkerProfile(userId: string, input: WorkerProfileInput) {
  await withUser(userId, (tx) => tx`
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
  `);
}

export function getWorkerSelections(userId: string) {
  return withUser(userId, async (tx) => {
    const skills = await tx<{ skill_id: string }[]>`select skill_id from public.worker_skills where user_id = ${userId}`;
    const areas = await tx<{ service_area_id: string }[]>`
      select service_area_id from public.worker_service_areas where user_id = ${userId}
    `;
    const availability = await tx<AvailabilityWindow[]>`
      select id, weekday, start_time::text, end_time::text
      from public.worker_availability where user_id = ${userId}
      order by weekday, start_time
    `;
    return {
      skillIds: skills.map((r) => r.skill_id),
      areaIds: areas.map((r) => r.service_area_id),
      availability,
    };
  });
}

export function setWorkerSkillsAndAreas(userId: string, skillIds: string[], areaIds: string[]) {
  return withUser(userId, async (tx) => {
    const currentSkills = await tx<{ id: string }[]>`select skill_id as id from public.worker_skills where user_id = ${userId}`;
    const skills = diffIds(
      currentSkills.map((r) => r.id),
      skillIds,
    );
    if (skills.remove.length) {
      await tx`delete from public.worker_skills where user_id = ${userId} and skill_id in ${tx(skills.remove)}`;
    }
    for (const id of skills.add) await tx`insert into public.worker_skills (user_id, skill_id) values (${userId}, ${id})`;

    const currentAreas = await tx<{ id: string }[]>`
      select service_area_id as id from public.worker_service_areas where user_id = ${userId}
    `;
    const areas = diffIds(
      currentAreas.map((r) => r.id),
      areaIds,
    );
    if (areas.remove.length) {
      await tx`delete from public.worker_service_areas where user_id = ${userId} and service_area_id in ${tx(areas.remove)}`;
    }
    for (const id of areas.add) {
      await tx`insert into public.worker_service_areas (user_id, service_area_id) values (${userId}, ${id})`;
    }
  });
}

export async function addAvailability(userId: string, weekday: number, startTime: string, endTime: string) {
  await withUser(userId, async (tx) => {
    const [{ overlaps }] = await tx<{ overlaps: boolean }[]>`
      select exists (
        select 1 from public.worker_availability
        where user_id = ${userId} and weekday = ${weekday}
          and start_time < ${endTime}::time and end_time > ${startTime}::time
      ) as overlaps
    `;
    if (overlaps) {
      throw new UserFacingError("That window overlaps one you already added for that day.");
    }
    await tx`
      insert into public.worker_availability (user_id, weekday, start_time, end_time)
      values (${userId}, ${weekday}, ${startTime}, ${endTime})
    `;
  });
}

export async function removeAvailability(userId: string, id: string) {
  await withUser(userId, (tx) => tx`delete from public.worker_availability where id = ${id} and user_id = ${userId}`);
}

export async function submitWorkerProfileForReview(userId: string) {
  await withUser(userId, (tx) => tx`select public.submit_worker_profile_for_review()`);
}
