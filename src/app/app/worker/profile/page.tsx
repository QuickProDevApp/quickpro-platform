import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { requireUser } from "@/server/auth/session";
import { listOpenServiceAreas, listSkills } from "@/server/data/reference";
import { getWorkerProfile, getWorkerSelections } from "@/server/data/workers";
import { updateWorkerProfileAction } from "../actions";

export const metadata: Metadata = { title: "Worker profile" };

export default async function WorkerProfilePage() {
  const user = await requireUser();
  const [profile, selections, areas, skills] = await Promise.all([
    getWorkerProfile(user.id),
    getWorkerSelections(user.id),
    listOpenServiceAreas(user.id),
    listSkills(user.id),
  ]);
  if (!profile) return null;

  const groups = new Map<string, (typeof skills)[number][]>();
  for (const s of skills) {
    const key = s.category_name ?? "General";
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  return (
    <ActionForm action={updateWorkerProfileAction} className="space-y-6">
      <Card>
        <CardHeader title="About you" />
        <CardBody className="space-y-4">
          <Field name="headline" label="Headline" hint="For example: Floor care tech, 5 years in commercial buildings">
            <Input name="headline" defaultValue={profile.headline} maxLength={120} />
          </Field>
          <Field name="bio" label="Experience">
            <Textarea name="bio" defaultValue={profile.bio} maxLength={2000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="yearsExperience" label="Years of experience">
              <Input name="yearsExperience" inputMode="numeric" defaultValue={profile.years_experience ?? ""} />
            </Field>
            <Field name="desiredHourlyRate" label="Desired hourly pay ($)" hint="What you are looking for. Pay is set per shift.">
              <Input
                name="desiredHourlyRate"
                inputMode="decimal"
                defaultValue={profile.desired_hourly_rate_cents ? (profile.desired_hourly_rate_cents / 100).toFixed(2) : ""}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Where you can work" />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="homeServiceAreaId" label="Home town">
              <Select name="homeServiceAreaId" defaultValue={profile.home_service_area_id ?? ""}>
                <option value="">Choose a town</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="maxTravelMiles" label="How far will you travel? (miles)">
              <Input name="maxTravelMiles" inputMode="numeric" defaultValue={profile.max_travel_miles} />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Checkbox name="hasVehicle" defaultChecked={profile.has_vehicle} label="I have reliable transportation" />
            <Checkbox name="hasDriversLicense" defaultChecked={profile.has_drivers_license} label="I have a valid driver's license" />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Preferred towns</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {areas.map((a) => (
                <Checkbox key={a.id} name="areaId" value={a.id} defaultChecked={selections.areaIds.includes(a.id)} label={a.name} />
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Skills"
          description={
            profile.status === "approved"
              ? "Choose the work you can do without close supervision. Adding a skill sends your profile back to QuickPro staff for review; removing one does not."
              : "Choose the work you can do without close supervision."
          }
        />
        <CardBody className="space-y-5">
          {[...groups.entries()].map(([group, list]) => (
            <div key={group}>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">{group}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((s) => (
                  <Checkbox key={s.id} name="skillId" value={s.id} defaultChecked={selections.skillIds.includes(s.id)} label={s.name} />
                ))}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <SubmitButton>Save profile</SubmitButton>
    </ActionForm>
  );
}
