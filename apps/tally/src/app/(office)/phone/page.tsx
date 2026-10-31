import Link from "next/link";
import { approveFromPhone } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { viewLedger } from "@/lib/ledger";
import { currentShopId, formatWhen } from "@/lib/runtime";

export default async function PhonePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const data = await viewLedger();
  const shopId = await currentShopId(data);
  const shop = data.shops.find((item) => item.id === shopId);
  const messages = data.messages
    .filter((message) => message.shopId === shopId)
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted">{shop?.ownerGivenName}&apos;s phone</p>
        <h1 className="font-display text-4xl tracking-tight">Owner texts</h1>
        <p className="mt-2 text-sm text-muted">
          Approval texts land here. Set Twilio and OWNER_SMS_TO to also deliver them to a handset. YES uses the same send path as the invoice screen.
        </p>
      </div>
      {params.error ? <p className="text-sm text-danger">{params.error}</p> : null}
      {messages.length === 0 ? (
        <p className="text-sm text-muted">No texts yet. Price a tech note and the approval text shows up here.</p>
      ) : (
        <ul className="space-y-3">
          {messages.map((message) => (
            <li key={message.id} className={`rounded-3xl border border-line p-4 ${message.direction === "out" ? "bg-card" : "ml-8 bg-[#efe7d8]"}`}>
              <p className="text-xs uppercase tracking-[0.14em] text-muted">
                {message.direction === "out" ? "Tally" : "You"} · {formatWhen(message.at)} ET · {message.status}
              </p>
              <p className="mt-2 text-sm">{message.body}</p>
              {message.token && message.invoiceId ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={approveFromPhone}>
                    <input type="hidden" name="token" value={message.token} />
                    <SubmitButton pendingLabel="Sending...">Reply YES</SubmitButton>
                  </form>
                  <Link href={`/approve/${message.token}`} className="inline-flex h-10 items-center text-sm text-accent">
                    Open the approval screen
                  </Link>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Link href="/disputes" className="text-sm text-accent">
        Dispute packets
      </Link>
    </div>
  );
}
