import Link from "next/link";
import { viewLedger } from "@/lib/ledger";
import { currentShopId, customerName, formatWhen } from "@/lib/runtime";

export default async function JobsPage() {
  const data = await viewLedger();
  const shopId = await currentShopId(data);
  const jobs = data.jobs
    .filter((job) => job.shopId === shopId)
    .slice()
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Jobs</h1>
          <p className="mt-2 text-sm text-muted">A finished job is a note from the tech. Tally turns it into a draft.</p>
        </div>
        <Link href="/jobs/new" className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm text-[var(--accent-foreground)]">
          Log a finished job
        </Link>
      </div>
      {jobs.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No jobs yet for this shop.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {jobs.map((job) => {
            const invoice = data.invoices.find((item) => item.jobId === job.id);
            return (
              <li key={job.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{customerName(data, job.customerId)}</p>
                    <p className="mt-1 text-sm">{job.notes}</p>
                    <p className="mt-1 text-xs text-muted">{job.completedAt ? formatWhen(job.completedAt) : "Open"} ET</p>
                  </div>
                  {invoice ? (
                    <Link href={`/invoices/${invoice.id}`} className="text-sm text-accent">
                      {invoice.number}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
