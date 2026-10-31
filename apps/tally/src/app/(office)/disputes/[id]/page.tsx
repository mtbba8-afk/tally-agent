import Link from "next/link";
import { notFound } from "next/navigation";
import { approveDispute } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { viewLedger } from "@/lib/ledger";
import { customerName, formatWhen } from "@/lib/runtime";

export default async function DisputePacketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await viewLedger();
  const packet = data.disputes.find((item) => item.id === id);
  if (!packet) notFound();
  const invoice = data.invoices.find((item) => item.id === packet.invoiceId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted">{invoice ? customerName(data, invoice.customerId) : "Customer"}</p>
        <h1 className="font-display text-4xl tracking-tight">{invoice?.number ?? "Dispute"}</h1>
        <p className="mt-2 text-sm text-muted">
          {packet.reason} · {packet.status === "approved" ? `Approved ${packet.approvedAt ? formatWhen(packet.approvedAt) : ""} ET` : "Waiting for you"}
        </p>
      </div>
      <section className="rounded-3xl border border-line bg-card p-5">
        <h2 className="font-display text-2xl">Draft response</h2>
        <p className="mt-3 text-sm leading-6">{packet.narrative}</p>
      </section>
      <section className="rounded-3xl border border-line bg-card p-5">
        <h2 className="font-display text-2xl">Evidence</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {packet.evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      {packet.status === "awaiting_approval" ? (
        <form action={approveDispute}>
          <input type="hidden" name="packetId" value={packet.id} />
          <SubmitButton pendingLabel="Saving...">Approve this response</SubmitButton>
        </form>
      ) : (
        <p className="text-sm">{packet.submitNote ?? "Approved. Nothing else was sent."}</p>
      )}
      {invoice ? (
        <Link href={`/invoices/${invoice.id}`} className="inline-block text-sm text-accent">
          Back to the invoice
        </Link>
      ) : null}
    </div>
  );
}
