import type { Metadata } from "next";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { ORG_DOCUMENT_TYPES } from "@/lib/labels";
import { requireMembership } from "@/server/actions/guards";
import { listDocuments } from "@/server/data/documents";
import { canManage } from "@/server/data/organizations";
import { deleteOrganizationDocumentAction, uploadOrganizationDocumentAction } from "../actions";

export const metadata: Metadata = { title: "Documents" };

export default async function OrganizationDocumentsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  const documents = await listDocuments(user.id, { kind: "org", orgId: org.id });
  return (
    <DocumentsPanel
      documents={documents}
      types={org.kind === "contractor" ? ORG_DOCUMENT_TYPES : ["business_license", "other"]}
      canEdit={canManage(org.my_role)}
      uploadAction={uploadOrganizationDocumentAction.bind(null, org.id)}
      deleteAction={deleteOrganizationDocumentAction.bind(null, org.id)}
      intro={
        org.kind === "contractor"
          ? "A general liability certificate of insurance is required. QuickPro staff review each document; this is not verification with your insurer."
          : "Optional. Upload anything that helps QuickPro staff confirm your organization."
      }
    />
  );
}
