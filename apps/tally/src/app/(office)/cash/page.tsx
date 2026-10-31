import Link from "next/link";
import { CashGrid, type CashGridRow } from "@/components/cash-grid";
import { viewLedger } from "@/lib/ledger";
import { balanceCents, currentShopId, customerName, shopNow } from "@/lib/runtime";
import { buildReceivables, cashForecast, formatUsd } from "@tounkara/cash-desk";

export default async function CashPage() {
  const data = await viewLedger();
  const shopId = await currentShopId(data);
  const shop = data.shops.find((item) => item.id === shopId);
  const now = shopNow(shop);
  const rows = buildReceivables(
    data.invoices
      .filter((invoice) => invoice.shopId === shopId)
      .map((invoice) => ({
        invoiceId: invoice.id,
        number: invoice.number,
        customer: customerName(data, invoice.customerId),
        status: invoice.status,
        sentAt: invoice.sentAt,
        balanceCents: balanceCents(invoice),
        remindersSent: invoice.remindersSent,
      })),
    now,
  );
  const forecast = cashForecast(rows);
  const gridRows: CashGridRow[] = rows.map((row) => ({
    customer: row.customer,
    number: row.number,
    invoiceId: row.invoiceId,
    status: row.status,
    bucket: row.bucket,
    ageDays: row.ageDays,
    balance: formatUsd(row.balanceCents),
    expected: row.forecastDate,
    callToday: row.callToday ? "Yes" : "",
    reason: row.reason,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Cash</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Who owes {shop?.name}, how old it is, and what is likely to land. The forecast uses age and reminder stage. It is a planning view, not a promise.
          </p>
        </div>
        <Link href="/disputes" className="text-sm text-accent">
          Dispute packets
        </Link>
      </div>
      <section className="grid gap-4 sm:grid-cols-3">
        <Card label="Expected in 7 days" value={formatUsd(forecast.next7Cents)} />
        <Card label="Expected in 14 days" value={formatUsd(forecast.next14Cents)} />
        <Card label="Expected in 30 days" value={formatUsd(forecast.next30Cents)} />
      </section>
      <section className="rounded-3xl border border-line bg-card p-5">
        <h2 className="font-display text-2xl">Who to call today</h2>
        {forecast.callList.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nobody is past the early reminder window.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {forecast.callList.map((row) => (
              <li key={row.invoiceId}>
                <Link href={`/invoices/${row.invoiceId}`} className="text-accent">
                  {row.customer}
                </Link>{" "}
                owes {formatUsd(row.balanceCents)} on {row.number}. {row.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
      <CashGrid rows={gridRows} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-3xl border border-line bg-card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display mt-2 text-3xl tracking-tight">{value}</p>
    </article>
  );
}
