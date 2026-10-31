import Link from "next/link";
import { notFound } from "next/navigation";
import { checkPayPal, markBuyerView, payAsBuyer } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { viewLedger } from "@/lib/ledger";
import { balanceCents, formatWhen } from "@/lib/runtime";
import { payLaterMessage } from "@tounkara/cash-desk";
import { formatUsd } from "@tounkara/payment-followups";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await viewLedger();
  const invoice = data.invoices.find((item) => item.id === id);
  if (!invoice) notFound();
  const shop = data.shops.find((item) => item.id === invoice.shopId);
  const customer = data.customers.find((item) => item.id === invoice.customerId);
  if (invoice.status === "sent") await markBuyerView(invoice.id);
  const fresh = (await viewLedger()).invoices.find((item) => item.id === id) ?? invoice;
  const payable = fresh.status === "sent" || fresh.status === "viewed" || fresh.status === "partial";
  const sandboxLink = invoice.gatewayMode === "sandbox" && invoice.payUrl?.startsWith("http") ? invoice.payUrl : null;
  const later = payLaterMessage(balanceCents(fresh));

  return (
    <main className="mx-auto min-h-full max-w-lg px-4 py-10">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{shop?.name}</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">{formatUsd(balanceCents(fresh))}</h1>
      <p className="mt-2 text-sm text-muted">
        {fresh.number} for {customer?.name}. {fresh.customerNote}
      </p>
      <ul className="mt-6 space-y-2 rounded-3xl border border-line bg-card p-5 text-sm">
        {fresh.lines.map((line) => (
          <li key={`${line.code}-${line.description}`} className="flex justify-between gap-3">
            <span>
              {line.name} × {line.quantity}
            </span>
            <span>{formatUsd(line.amountCents)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm">
        Status: {fresh.status}
        {fresh.paidAt ? ` · paid ${formatWhen(fresh.paidAt)} ET` : ""}
      </p>
      {later && payable ? <p className="mt-4 rounded-2xl border border-line bg-card p-4 text-sm">{later}</p> : null}
      {fresh.status === "paid" ? <p className="mt-4 text-sm text-paid">This invoice is paid. Thank you.</p> : null}
      {fresh.status === "disputed" ? <p className="mt-4 text-sm text-danger">This invoice is disputed. Reminders are paused.</p> : null}
      {payable && sandboxLink ? (
        <div className="mt-6 space-y-3">
          <a href={sandboxLink} className="inline-flex h-12 items-center rounded-full bg-accent px-5 text-[var(--accent-foreground)]">
            Pay with PayPal sandbox
          </a>
          <form action={checkPayPal}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <SubmitButton variant="outline" pendingLabel="Checking...">
              I paid in sandbox. Check the invoice.
            </SubmitButton>
          </form>
        </div>
      ) : null}
      {payable && !sandboxLink ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <form action={payAsBuyer}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="portion" value="full" />
            <SubmitButton pendingLabel="Recording...">Pay the balance</SubmitButton>
          </form>
          <form action={payAsBuyer}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="portion" value="half" />
            <SubmitButton variant="outline" pendingLabel="Recording...">
              Pay half
            </SubmitButton>
          </form>
        </div>
      ) : null}
      <p className="mt-8 text-xs text-muted">
        {sandboxLink
          ? "This link opens the PayPal sandbox payer view. Use a sandbox personal account."
          : "Mock mode records the payment on this ledger and reconciles it the same way a PayPal webhook would."}
      </p>
      <Link href="/" className="mt-6 inline-block text-sm text-accent">
        Back to the desk
      </Link>
    </main>
  );
}
