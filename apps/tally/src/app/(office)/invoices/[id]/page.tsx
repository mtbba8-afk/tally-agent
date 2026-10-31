import Link from "next/link";
import { notFound } from "next/navigation";
import { approveAndSend, checkPayPal, setDemoClock, simulateDisputeWebhook, simulatePaidWebhook, voidInvoice } from "@/app/actions";
import { StatusPill } from "@/components/status-pill";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { viewLedger } from "@/lib/ledger";
import { balanceCents, customerName, formatWhen } from "@/lib/runtime";
import { formatUsd } from "@tounkara/payment-followups";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await viewLedger();
  const invoice = data.invoices.find((item) => item.id === id);
  if (!invoice) notFound();
  const shop = data.shops.find((item) => item.id === invoice.shopId);
  const customer = data.customers.find((item) => item.id === invoice.customerId);
  const editable = invoice.status === "awaiting_approval" || invoice.status === "draft";
  const reminders = data.logs.filter((entry) => entry.invoiceId === invoice.id && entry.action === "reminder_sent");
  const approval = data.messages.find((message) => message.invoiceId === invoice.id && message.token);
  const packet = data.disputes.find((item) => item.invoiceId === invoice.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{shop?.name}</p>
          <h1 className="font-display text-4xl tracking-tight">{invoice.number}</h1>
          <p className="mt-1 text-sm">{customerName(data, invoice.customerId)}</p>
        </div>
        <StatusPill status={invoice.status} />
      </div>

      <section className="rounded-3xl border border-line bg-card p-5">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">Job note</p>
        <p className="mt-2">{invoice.note}</p>
        <p className="mt-4 text-xs uppercase tracking-[0.14em] text-muted">Customer line</p>
        <p className="mt-2">{invoice.customerNote}</p>
        <p className="mt-4 text-xs text-muted">Confidence: {invoice.confidence}</p>
      </section>

      {editable ? (
        <form action={approveAndSend} className="space-y-4 rounded-3xl border border-line bg-card p-5">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <h2 className="font-display text-2xl">Check the lines</h2>
          <p className="text-sm text-muted">Unit prices stay on the price book. You can change quantity. A line the book did not recognize needs a dollar amount.</p>
          <ul className="space-y-3">
            {invoice.lines.map((line) => (
              <li key={line.code} className="grid items-end gap-3 sm:grid-cols-[1fr_6rem_7rem]">
                <div>
                  <p className="font-medium">{line.name}</p>
                  <p className="text-xs text-muted">
                    {line.code.startsWith("review.unmatched")
                      ? "Not in the price book. Enter the dollar amount."
                      : `Price book · ${formatUsd(line.unitPriceCents)} each`}
                  </p>
                </div>
                <label className="text-xs text-muted">
                  Qty
                  <Input name={`qty_${line.code}`} type="number" min="0" step="0.5" defaultValue={line.quantity} />
                </label>
                {line.code.startsWith("review.unmatched") ? (
                  <label className="text-xs text-muted">
                    Dollars
                    <Input name={`dollars_${line.code}`} type="number" min="0" step="0.01" defaultValue="0" />
                  </label>
                ) : (
                  <p className="pb-2 text-right font-medium">{formatUsd(line.amountCents)}</p>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-3xl">{formatUsd(invoice.subtotalCents)}</p>
            <SubmitButton pendingLabel="Sending...">Approve and send</SubmitButton>
          </div>
          {invoice.sendError ? <p className="text-sm text-danger">{invoice.sendError}</p> : null}
        </form>
      ) : (
        <section className="rounded-3xl border border-line bg-card p-5">
          <ul className="space-y-2 text-sm">
            {invoice.lines.map((line) => (
              <li key={`${line.code}-${line.quantity}`} className="flex justify-between gap-3">
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
          <div className="mt-4 flex items-end justify-between border-t border-line pt-4">
            <div>
              <p className="text-xs text-muted">Balance</p>
              <p className="font-display text-3xl">{formatUsd(balanceCents(invoice))}</p>
            </div>
            <p className="text-sm text-muted">Total {formatUsd(invoice.subtotalCents)}</p>
          </div>
        </section>
      )}

      {editable ? (
        <form action={voidInvoice}>
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <SubmitButton variant="ghost" pendingLabel="Voiding...">
            Void this draft
          </SubmitButton>
        </form>
      ) : null}

      {approval ? (
        <p className="text-sm">
          Approval text is on the{" "}
          <Link href="/phone" className="text-accent">
            owner phone
          </Link>
          . The same link is{" "}
          <Link href={`/approve/${approval.token}`} className="text-accent">
            here
          </Link>
          .
        </p>
      ) : null}
      {packet ? (
        <p className="text-sm">
          <Link href={`/disputes/${packet.id}`} className="text-accent">
            Open the dispute response
          </Link>
        </p>
      ) : null}

      {invoice.sentAt ? (
        <section className="rounded-3xl border border-line bg-card p-5 text-sm">
          <h2 className="font-display text-2xl">Collection</h2>
          <p className="mt-2 text-muted">Sent {formatWhen(invoice.sentAt)} ET via {invoice.gatewayMode === "sandbox" ? "PayPal sandbox" : "the mock gateway"}.</p>
          {invoice.paypalInvoiceId ? <p className="mt-1">PayPal id: {invoice.paypalInvoiceId}</p> : null}
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href={`/pay/${invoice.id}`} className="text-accent">
              Open the pay page
            </Link>
            {invoice.payUrl?.includes("paypal.com") ? (
              <a href={invoice.payUrl} className="text-accent">
                PayPal payer link
              </a>
            ) : null}
          </div>
          {invoice.gatewayMode === "sandbox" ? (
            <form action={checkPayPal} className="mt-4">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <SubmitButton variant="outline" pendingLabel="Checking...">
                Check PayPal for payment
              </SubmitButton>
            </form>
          ) : null}
          <h3 className="mt-6 font-medium">Reminders already sent</h3>
          {reminders.length === 0 ? (
            <p className="mt-2 text-muted">None yet. Day 3, 7, and 14 run from the desk, or move the demo clock and send them.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {reminders.map((entry) => (
                <li key={entry.id}>
                  <span className="text-muted">{formatWhen(entry.at)} ET</span>
                  <p>{entry.detail}</p>
                </li>
              ))}
            </ul>
          )}
          {shop && invoice.sentAt ? (
            <form action={setDemoClock} className="mt-4 flex flex-wrap gap-2">
              <input type="hidden" name="shopId" value={shop.id} />
              <input type="hidden" name="anchor" value={invoice.sentAt} />
              <button className="rounded-full border border-line px-3 py-1.5 text-xs" name="mode" value="day3" type="submit">
                Clock to day 3
              </button>
              <button className="rounded-full border border-line px-3 py-1.5 text-xs" name="mode" value="day7" type="submit">
                Clock to day 7
              </button>
              <button className="rounded-full border border-line px-3 py-1.5 text-xs" name="mode" value="day14" type="submit">
                Clock to day 14
              </button>
              <button className="rounded-full border border-line px-3 py-1.5 text-xs" name="mode" value="reset" type="submit">
                Real clock
              </button>
            </form>
          ) : null}
          {customer ? <p className="mt-4 text-muted">Payer email on the invoice: {customer.email}</p> : null}
          {invoice.status !== "paid" && invoice.status !== "void" && invoice.status !== "disputed" ? (
            <form action={simulatePaidWebhook} className="mt-4">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <SubmitButton variant="outline" pendingLabel="Recording...">
                Replay a PayPal paid webhook
              </SubmitButton>
            </form>
          ) : null}
          {invoice.status !== "disputed" && invoice.status !== "void" ? (
            <form action={simulateDisputeWebhook} className="mt-3">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <SubmitButton variant="ghost" pendingLabel="Drafting...">
                Simulate a dispute webhook
              </SubmitButton>
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
