import Link from "next/link";
import { VoiceDesk } from "@/components/voice-desk";
import { viewLedger } from "@/lib/ledger";
import { currentShopId, customerName, formatWhen } from "@/lib/runtime";

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ call?: string }> }) {
  const params = await searchParams;
  const data = await viewLedger();
  const shopId = await currentShopId(data);
  const shop = data.shops.find((item) => item.id === shopId);
  const calls = data.calls
    .filter((call) => call.shopId === shopId)
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const active = calls.find((call) => call.id === params.call) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted">{shop?.name}</p>
        <h1 className="font-display text-4xl tracking-tight">From the call to paid</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Tally answers, books the visit, and waits for the tech note. The recorded call and a live microphone use the same booking function. Nothing is priced until the price book matches the note, and nothing is sent until you approve it.
        </p>
      </div>
      <VoiceDesk key={active?.id ?? "fresh"} initial={active} />
      <section>
        <h2 className="font-display text-2xl">Recent calls</h2>
        {calls.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No calls yet. Play the recorded one to put a job on the board.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {calls.map((call) => (
              <li key={call.id}>
                <Link href={`/calls?call=${call.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#f6f0e6]">
                  <div>
                    <p className="font-medium">{call.slots.customerName ?? "Open call"}</p>
                    <p className="text-xs text-muted">
                      {call.source} · {call.status}
                      {call.customerId ? ` · ${customerName(data, call.customerId)}` : ""} · {formatWhen(call.startedAt)} ET
                    </p>
                  </div>
                  <span className="text-sm text-accent">{call.invoiceId ? "Invoice" : "Open"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
