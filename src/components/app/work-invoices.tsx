import "server-only";
import { WorkInvoices } from "@/components/app/invoices";
import { createInvoiceAction } from "@/server/actions/invoices";
import { listWorkInvoices, type InvoiceContext } from "@/server/data/invoices";

/** Invoices on a project or subcontract, for either business on it. */
export async function WorkInvoicesSection({
  userId,
  context,
  targetId,
  orgId,
  issuerOrgId,
  issuerName,
  canAct,
}: {
  userId: string;
  context: InvoiceContext;
  targetId: string;
  /** The viewer's business. */
  orgId: string;
  /** The business that does the work and bills for it. */
  issuerOrgId: string;
  issuerName: string;
  /** The viewer can dispatch for their business. */
  canAct: boolean;
}) {
  const invoices = await listWorkInvoices(userId, context, targetId);
  const issuer = orgId === issuerOrgId;
  return (
    <WorkInvoices
      invoices={invoices}
      href={(id) => `/app/org/${orgId}/invoices/${id}`}
      createAction={issuer && canAct ? createInvoiceAction.bind(null, orgId, context, targetId) : undefined}
      payer={!issuer}
      issuerName={issuerName}
    />
  );
}
