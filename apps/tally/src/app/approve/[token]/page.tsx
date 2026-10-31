import Link from "next/link";
import { notFound } from "next/navigation";
import { approveFromPhone } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { viewLedger } from "@/lib/ledger";
import { formatUsd } from "@tounkara/payment-followups";

export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await viewLedger();
  const message = data.messages.find((item) => item.token === token);
  if (!message?.invoiceId) notFound();
  const invoice = data.invoices.find((item) => item.id === message.invoiceId);
  const shop = data.shops.find((item) => item.id === invoice?.shopId);
  const customer = data.customers.find((item) => item.id === invoice?.customerId);
  if (!invoice || !shop) notFound();
  const editable = invoice.status === "awaiting_approval" || invoice.status === "draft";
  const blocked = invoice.lines.some((line) => line.code.startsWith("review.unmatched") && line.amountCents <= 0);

  return (
    <main className="mx-auto min-h-full max-w-lg px-4 py-10">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{shop.name}</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">{formatUsd(invoice.subtotalCents)}</h1>
      <p className="mt-2 text-sm text-muted">
        {invoice.number} for {customer?.name}. {invoice.customerNote}
      </p>
      <p className="mt-4 text-sm">{invoice.note}</p>
      <ul className="mt-6 space-y-2 rounded-3xl border border-line bg-card p-5 text-sm">
        {invoice.lines.map((line) => (
          <li key={`${line.code}-${line.description}`} className="flex items-start justify-between gap-3">
            <span>
              {line.name} × {line.quantity}
              <span className="mt-1 block text-xs text-muted">
                {line.code.startsWith("review.unmatched") ? "Not in the price book" : "Price book"}
              </span>
            </span>
            <span>{formatUsd(line.amountCents)}</span>
          </li>
        ))}
      </ul>
      {editable && !blocked ? (
        <form action={approveFromPhone} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <SubmitButton pendingLabel="Sending...">Approve and send the PayPal invoice</SubmitButton>
        </form>
      ) : null}
      {editable && blocked ? (
        <p className="mt-6 text-sm text-danger">
          A line has no price book match. Set the dollar amount on the desk before this can send.{" "}
          <Link href={`/invoices/${invoice.id}`} className="text-accent">
            Open the invoice
          </Link>
        </p>
      ) : null}
      {!editable ? (
        <p className="mt-6 text-sm">
          This invoice is {invoice.status}.{" "}
          <Link href={`/pay/${invoice.id}`} className="text-accent">
            Customer pay page
          </Link>
        </p>
      ) : null}
      <p className="mt-8 text-xs text-muted">Sandbox or mock only. Approving sends the invoice. It does not change a price.</p>
    </main>
  );
}
