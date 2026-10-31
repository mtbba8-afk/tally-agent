import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { viewLedger } from "@/lib/ledger";
import { balanceCents, currentShopId, customerName, formatWhen } from "@/lib/runtime";
import { formatUsd } from "@tounkara/payment-followups";

export default async function InvoicesPage() {
  const data = await viewLedger();
  const shopId = await currentShopId(data);
  const invoices = data.invoices
    .filter((invoice) => invoice.shopId === shopId)
    .slice()
    .sort((a, b) => b.number.localeCompare(a.number));

  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Invoices</h1>
      <p className="mt-2 text-sm text-muted">Outstanding and paid, from the same ledger the agent uses.</p>
      {invoices.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No invoices yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sent</th>
                <th className="px-4 py-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${invoice.id}`} className="text-accent">
                      {invoice.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{customerName(data, invoice.customerId)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={invoice.status} />
                  </td>
                  <td className="px-4 py-3 text-muted">{invoice.sentAt ? `${formatWhen(invoice.sentAt)} ET` : "Not sent"}</td>
                  <td className="px-4 py-3 text-right">{formatUsd(invoice.status === "paid" ? 0 : balanceCents(invoice))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
