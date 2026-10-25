import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Checkbox, SubmitButton } from "@/components/ui/form";
import { requireMembership } from "@/server/actions/guards";
import { canManage, getContractorCapabilities } from "@/server/data/organizations";
import { listCategories, listServiceAreas } from "@/server/data/reference";
import { saveCapabilitiesAction } from "../actions";

export const metadata: Metadata = { title: "Services and areas" };

export default async function ServicesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (org.kind !== "contractor") notFound();
  const editable = canManage(org.my_role);
  const [caps, categories, areas] = await Promise.all([
    getContractorCapabilities(user.id, org.id),
    listCategories(user.id),
    listServiceAreas(user.id, org.market_id),
  ]);

  return (
    <ActionForm action={saveCapabilitiesAction.bind(null, org.id)} className="space-y-6">
      <fieldset disabled={!editable} className="space-y-6">
        <Card>
          <CardHeader title="Service categories" description="The commercial work your business performs." />
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {categories.map((c) => (
              <Checkbox
                key={c.id}
                name="categoryId"
                value={c.id}
                defaultChecked={caps.categoryIds.includes(c.id)}
                label={
                  <>
                    <span className="block font-medium">{c.name}</span>
                    <span className="block text-xs text-muted">{c.description}</span>
                  </>
                }
              />
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Service areas in ${org.market_name}`} description="Towns where you can take jobs." />
          <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((a) => (
              <Checkbox key={a.id} name="areaId" value={a.id} defaultChecked={caps.areaIds.includes(a.id)} label={a.name} />
            ))}
          </CardBody>
        </Card>
        {editable ? <SubmitButton>Save services and areas</SubmitButton> : null}
      </fieldset>
    </ActionForm>
  );
}
