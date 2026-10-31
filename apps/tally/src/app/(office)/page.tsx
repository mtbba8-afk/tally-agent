import Link from "next/link";
import { chaseNow, setDemoClock } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { StatusPill } from "@/components/status-pill";
import { summarizeShop } from "@/lib/agent";
import { viewLedger } from "@/lib/ledger";
import { balanceCents, currentShopId, customerName, formatWhen, shopNow } from "@/lib/runtime";
import { formatUsd, selectDueInvoices } from "@tounkara/payment-followups";

export default async function DeskPage() {
  const data = await viewLedger();
  const shopId = await currentShopId(data);
  const shop = data.shops.find((item) => item.id === shopId);
  if (!shop) return null;
  const now = shopNow(shop);
  const summary = summarizeShop(data, shopId, now);
  const invoices = data.invoices.filter((invoice) => invoice.shopId === shopId);
  const waiting = invoices.filter((invoice) => invoice.status === "awaiting_approval");
  const open = invoices.filter((invoice) => ["sent", "viewed", "partial"].includes(invoice.status));
  const due = selectDueInvoices(
    open.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      sentAt: invoice.sentAt,
      remindersSent: invoice.remindersSent,
    })),
    now,
  );
  const activity = data.logs
    .filter((entry) => entry.shopId === shopId)
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight">The desk</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Finished jobs become invoices. You approve anything over {formatUsd(shop.autoSendThresholdCents)}, then PayPal collects and the agent chases day 3, 7, and 14.
          </p>
        </div>
        <Link href="/jobs/new" className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm text-[var(--accent-foreground)]">
          Log a finished job
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-3xl border border-line bg-card p-5">
          <p className="text-sm text-muted">Outstanding</p>
          <p className="font-display mt-2 text-4xl tracking-tight">{formatUsd(summary.outstandingCents)}</p>
          <p className="mt-2 text-sm text-muted">{summary.openCount} open</p>
        </article>
        <article className="rounded-3xl border border-line bg-card p-5">
          <p className="text-sm text-muted">Paid this month</p>
          <p className="font-display mt-2 text-4xl tracking-tight">{formatUsd(summary.paidThisMonthCents)}</p>
          <p className="mt-2 text-sm text-muted">{summary.paidThisMonthCount} paid in full</p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl">Needs a look</h2>
          {waiting.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing is waiting on you. New drafts land here.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {waiting.map((invoice) => (
                <li key={invoice.id} className="rounded-2xl border border-line bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{invoice.number}</p>
                      <p className="text-sm text-muted">{customerName(data, invoice.customerId)}</p>
                    </div>
                    <p className="font-display text-2xl">{formatUsd(invoice.subtotalCents)}</p>
                  </div>
                  <p className="mt-3 text-sm">{invoice.customerNote}</p>
                  <Link href={`/invoices/${invoice.id}`} className="mt-3 inline-block text-sm text-accent">
                    Review and send
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl">Reminders due</h2>
            <form action={chaseNow}>
              <SubmitButton variant="outline" pendingLabel="Sending...">
                Send due reminders
              </SubmitButton>
            </form>
          </div>
          {due.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No reminder is due at this clock.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {due.map((item) => {
                const invoice = invoices.find((row) => row.id === item.id);
                if (!invoice) return null;
                return (
                  <li key={item.id} className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3 text-sm">
                    <span>
                      {invoice.number} · {customerName(data, invoice.customerId)}
                    </span>
                    <span className="text-muted">Day {item.stage}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <form action={setDemoClock} className="mt-4 flex flex-wrap gap-2">
            <input type="hidden" name="shopId" value={shop.id} />
            <ClockButton mode="reset" label="Real clock" />
            <ClockButton mode="day3" label="Jump 3 days" />
            <ClockButton mode="day7" label="Jump 7 days" />
            <ClockButton mode="day14" label="Jump 14 days" />
          </form>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Open invoices</h2>
          <Link href="/invoices" className="text-sm text-accent">
            All invoices
          </Link>
        </div>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No open invoices. When a job is marked done, the draft shows up here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {open.map((invoice) => (
              <li key={invoice.id}>
                <Link href={`/invoices/${invoice.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#f6f0e6]">
                  <div>
                    <p className="font-medium">{customerName(data, invoice.customerId)}</p>
                    <p className="text-xs text-muted">
                      {invoice.number}
                      {invoice.sentAt ? ` · sent ${formatWhen(invoice.sentAt)} ET` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill status={invoice.status} />
                    <span className="font-medium">{formatUsd(balanceCents(invoice))}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Agent activity</h2>
          <Link href="/activity" className="text-sm text-accent">
            Full log
          </Link>
        </div>
        <ul className="mt-3 space-y-3">
          {activity.map((entry) => (
            <li key={entry.id} className="text-sm">
              <span className="text-muted">{formatWhen(entry.at)} ET · {entry.actor}</span>
              <p>{entry.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ClockButton({ mode, label }: { mode: string; label: string }) {
  return (
    <button type="submit" name="mode" value={mode} className="rounded-full border border-line bg-card px-3 py-1.5 text-xs">
      {label}
    </button>
  );
}
