import type { Metadata } from "next";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { WEEKDAYS, formatTime } from "@/lib/labels";
import { requireUser } from "@/server/auth/session";
import { getWorkerSelections } from "@/server/data/workers";
import { addAvailabilityAction, removeAvailabilityAction } from "../actions";

export const metadata: Metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  const user = await requireUser();
  const { availability } = await getWorkerSelections(user.id);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader title="Weekly availability" description="Times are Eastern. Add a window for each part of the week you can usually work." />
        <CardBody>
          {availability.length === 0 ? (
            <EmptyState title="No availability yet">Add your first window with the form.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {WEEKDAYS.map((day, weekday) => {
                const windows = availability.filter((w) => w.weekday === weekday);
                if (windows.length === 0) return null;
                return (
                  <li key={day} className="flex flex-wrap items-start gap-4 py-3">
                    <span className="w-24 text-sm font-medium">{day}</span>
                    <ul className="flex flex-1 flex-wrap gap-2">
                      {windows.map((w) => (
                        <li key={w.id} className="flex items-center gap-1 rounded-lg border border-line py-1 pr-1 pl-3 text-sm">
                          {formatTime(w.start_time)} – {formatTime(w.end_time)}
                          <ActionForm action={removeAvailabilityAction} className="" successMessage={false}>
                            <input type="hidden" name="id" value={w.id} />
                            <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                              <span aria-hidden="true">✕</span>
                              <span className="sr-only">Remove</span>
                            </SubmitButton>
                          </ActionForm>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card className="self-start">
        <CardHeader title="Add a window" />
        <CardBody>
          <ActionForm action={addAvailabilityAction}>
            <Field name="weekday" label="Day">
              <Select name="weekday" defaultValue="1">
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field name="startTime" label="From">
                <Input name="startTime" type="time" defaultValue="08:00" step={900} />
              </Field>
              <Field name="endTime" label="To">
                <Input name="endTime" type="time" defaultValue="16:00" step={900} />
              </Field>
            </div>
            <SubmitButton pendingLabel="Adding…">Add window</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
