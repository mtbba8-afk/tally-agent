import Link from "next/link";
import { viewLedger } from "@/lib/ledger";
import { currentShopId, formatWhen } from "@/lib/runtime";

export default async function DisputesPage() {
  const data = await viewLedger();
  const shopId = await currentShopId(data);
  const packets = data.disputes
    .filter((packet) => packet.shopId === shopId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Disputes</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          When PayPal flags a dispute, Tally drafts a response from the job note, the price book lines, and the call. You approve it before anything is submitted.
        </p>
      </div>
      {packets.length === 0 ? (
        <p className="text-sm text-muted">No dispute packets. Open a sent invoice and simulate a dispute webhook to draft one.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {packets.map((packet) => {
            const invoice = data.invoices.find((item) => item.id === packet.invoiceId);
            return (
              <li key={packet.id}>
                <Link href={`/disputes/${packet.id}`} className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-[#f6f0e6]">
                  <div>
                    <p className="font-medium">{invoice?.number ?? packet.invoiceId}</p>
                    <p className="text-sm text-muted">{packet.reason}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p>{packet.status === "approved" ? "Approved" : "Needs you"}</p>
                    <p className="text-xs text-muted">{formatWhen(packet.createdAt)} ET</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
