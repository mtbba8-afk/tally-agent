import { viewLedger } from "@/lib/ledger";
import { currentShopId, formatWhen } from "@/lib/runtime";

export default async function ActivityPage() {
  const data = await viewLedger();
  const shopId = await currentShopId(data);
  const logs = data.logs
    .filter((entry) => entry.shopId === shopId)
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Activity</h1>
      <p className="mt-2 text-sm text-muted">Every draft, send, reminder, and payment is written here. Amounts do not change after send.</p>
      {logs.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No agent activity yet.</p>
      ) : (
        <ol className="mt-6 space-y-4">
          {logs.map((entry) => (
            <li key={entry.id} className="rounded-2xl border border-line bg-card px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted">
                {formatWhen(entry.at)} ET · {entry.actor} · {entry.action.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-sm">{entry.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
