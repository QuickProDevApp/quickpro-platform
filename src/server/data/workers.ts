import "server-only";
import { withUser } from "@/server/db/client";
import { UserFacingError } from "@/server/errors";
import type { ReviewStatus } from "@/lib/labels";
import { saveWorkerProfile, type WorkerProfileInput } from "@/server/queries/workers";

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
  rereview_reason: string | null;
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

export type { WorkerProfileInput } from "@/server/queries/workers";

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

/** Profile fields, skills and preferred towns in one transaction. */
export async function saveWorkerProfileAndSelections(
  userId: string,
  input: WorkerProfileInput,
  skillIds: string[],
  areaIds: string[],
) {
  await withUser(userId, (tx) => saveWorkerProfile(tx, userId, input, skillIds, areaIds));
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
