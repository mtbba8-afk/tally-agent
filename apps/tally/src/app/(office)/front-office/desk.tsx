"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Line = { code: string; name: string; quantity: number; unitPriceCents: number; amountCents: number };
type Session = {
  error: string | null;
  flags: { intents: string; nearAi: string; shadeAgent: string; chainSignatures: string; contract: string; realFunds: boolean };
  booking: { customerName: string; when: string; confirmation: string } | null;
  invoice: {
    id: string;
    status: string;
    amountCents: number;
    asset: string;
    jobRecordHash: string;
    note: string;
    inference: string;
    pricedInMs: number;
    settlementRef: string | null;
    lines: Line[];
  } | null;
  quote: { mode: string; dry: boolean; depositAddress: null; originChain: string; shopAccount: string } | null;
  policySentence: string | null;
  policy: { dailyCapCents: number; taxReserveBps: number; approvedSuppliers: Array<{ name: string }> };
  treasury: { taxReserveCents: number; ownerCents: number; opsCents: number };
  spentTodayCents: number;
  signatures: Array<{ broadcast: boolean; payload: string; signature: string }>;
  attack: { text: string; signed: boolean; injectionSuspected: boolean; reasons: string[] } | null;
  attestation: { mode: string; codeHash: string; measurement: string };
  accessKey: { permission: { FunctionCall: { receiver_id: string; method_names: string[] } } };
  audit: Array<{ at: string; actor: string; action: string; detail: string; reasons: string[] }>;
};

const empty = "Run the demo to watch a call become a paid invoice, then watch the contract refuse a $5,000 transfer.";

export function FrontOfficeDesk() {
  const [session, setSession] = useState<Session | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState("Replaced the fill valve and supply line, 45 minutes.");
  const [sentence, setSentence] = useState("Max $200 a day, only pay Ferguson, keep 30% for taxes.");

  async function refresh() {
    const response = await fetch("/api/front-office", { cache: "no-store" });
    setSession(await response.json());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function post(body: object, label: string) {
    setPending(label);
    const response = await fetch("/api/front-office", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSession(await response.json());
    setPending(null);
  }

  const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">NEAR hackathon</p>
          <h1 className="font-display text-4xl tracking-tight">Front office</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            A call is booked, the tech&apos;s voice note becomes a priced invoice, and the customer&apos;s USDC is quoted to one shop account through NEAR Intents. Steward can pay Ferguson only inside the owner&apos;s rules.
          </p>
        </div>
        <Button onClick={() => post({ action: "demo" }, "demo")} disabled={pending !== null}>
          {pending === "demo" ? "Running..." : "Run the demo"}
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Flag label="Intents" value={session?.flags.intents ?? "mock"} />
        <Flag label="NEAR AI" value={session?.flags.nearAi ?? "local"} />
        <Flag label="Shade Agent" value={session?.flags.shadeAgent ?? "mock"} />
        <Flag label="Chain signatures" value={session?.flags.chainSignatures ?? "mock"} />
      </section>
      <p className="text-sm text-muted">
        Real funds stay off. Intents quotes are dry or mocked, the Shade measurement is not a TEE, and chain signatures are not broadcast. The refusal below is the same rule as the Rust contract in <span className="font-medium text-foreground">contracts/tally-office</span>.
      </p>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <article className="rounded-3xl border border-line bg-card p-5">
            <h2 className="font-display text-2xl">1. The call</h2>
            <p className="mt-2 text-sm text-muted">Front desk books Tuesday 10:00 for Priya. Telephony itself is the existing Tally voice path; this desk takes the transcript.</p>
            <Button className="mt-4" variant="outline" onClick={() => post({ action: "book" }, "book")} disabled={pending !== null}>
              Book Tuesday 10:00
            </Button>
            {session?.booking ? <p className="mt-3 text-sm">{session.booking.confirmation}</p> : null}
          </article>

          <article className="rounded-3xl border border-line bg-card p-5">
            <h2 className="font-display text-2xl">2. Voice note</h2>
            <textarea
              className="mt-3 min-h-24 w-full rounded-2xl border border-line bg-background px-3 py-2 text-sm"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <Button className="mt-3" variant="outline" onClick={() => post({ action: "price", note, trade: "plumbing" }, "price")} disabled={pending !== null}>
              Price from the book
            </Button>
            {session?.invoice ? (
              <div className="mt-4 space-y-2 text-sm">
                <p>
                  {session.invoice.id} · {session.invoice.status} · {money(session.invoice.amountCents)} {session.invoice.asset}
                </p>
                <p className="text-muted">Priced in {session.invoice.pricedInMs} ms via {session.invoice.inference}. Hash {session.invoice.jobRecordHash.slice(0, 16)}…</p>
                <ul>
                  {session.invoice.lines.map((line) => (
                    <li key={line.code} className="flex justify-between gap-3">
                      <span>{line.name} × {line.quantity}</span>
                      <span>{money(line.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>

          <article className="rounded-3xl border border-line bg-card p-5">
            <h2 className="font-display text-2xl">3. Customer pays</h2>
            <p className="mt-2 text-sm text-muted">Base USDC quoted to the shop&apos;s NEAR account. Dry quotes do not create a deposit address.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => post({ action: "quote", originChain: "base" }, "quote")} disabled={pending !== null}>
                Quote from Base
              </Button>
              <Button variant="outline" onClick={() => post({ action: "settle" }, "settle")} disabled={pending !== null}>
                Mark mock settlement
              </Button>
            </div>
            {session?.quote ? (
              <p className="mt-3 text-sm">
                {session.quote.mode} quote · dry {String(session.quote.dry)} · deposit {String(session.quote.depositAddress)} · {session.quote.shopAccount}
              </p>
            ) : null}
            {session?.invoice?.settlementRef ? <p className="mt-2 text-sm">Settlement ref {session.invoice.settlementRef}</p> : null}
          </article>
        </div>

        <div className="space-y-4">
          <article className="rounded-3xl border border-line bg-card p-5">
            <h2 className="font-display text-2xl">4. Owner policy</h2>
            <textarea
              className="mt-3 min-h-20 w-full rounded-2xl border border-line bg-background px-3 py-2 text-sm"
              value={sentence}
              onChange={(event) => setSentence(event.target.value)}
            />
            <Button className="mt-3" variant="outline" onClick={() => post({ action: "policy", sentence }, "policy")} disabled={pending !== null}>
              Compile policy
            </Button>
            <p className="mt-3 text-sm text-muted">
              Cap {money(session?.policy.dailyCapCents ?? 0)} · tax {((session?.policy.taxReserveBps ?? 0) / 100).toFixed(0)}% · suppliers {session?.policy.approvedSuppliers.map((supplier) => supplier.name).join(", ") || "none yet"}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <Pile label="Tax reserve" value={money(session?.treasury.taxReserveCents ?? 0)} />
              <Pile label="Owner" value={money(session?.treasury.ownerCents ?? 0)} />
              <Pile label="Operations" value={money(session?.treasury.opsCents ?? 0)} />
            </div>
          </article>

          <article className="rounded-3xl border border-line bg-card p-5">
            <h2 className="font-display text-2xl">5. Steward</h2>
            <p className="mt-2 text-sm text-muted">
              Shade mode {session?.attestation.mode ?? "mock"}. Code hash {session?.attestation.codeHash.slice(0, 12) ?? "…"}. Key receiver {session?.accessKey.permission.FunctionCall.receiver_id}. Methods exclude set_policy.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => post({ action: "payout", text: "Pay Ferguson $12 for the fill valve." }, "payout")} disabled={pending !== null}>
                Pay Ferguson $12
              </Button>
              <Button variant="danger" onClick={() => post({ action: "attack" }, "attack")} disabled={pending !== null}>
                Inject a $5,000 transfer
              </Button>
            </div>
            <p className="mt-3 text-sm">Signatures recorded: {session?.signatures.length ?? 0}. None are broadcast.</p>
            {session?.attack ? (
              <div className="mt-4 rounded-2xl border border-danger/40 bg-[#f8ece6] p-4 text-sm">
                <p className="font-medium text-danger">{session.attack.signed ? "The payout was signed." : "Contract refused the $5,000 transfer."}</p>
                <p className="mt-2">{session.attack.text}</p>
                <ul className="mt-2 list-disc pl-5">
                  {session.attack.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">{empty}</p>
            )}
          </article>
        </div>
      </section>

      {session?.error ? <p className="rounded-2xl border border-danger/40 bg-[#f8ece6] px-4 py-3 text-sm text-danger">{session.error}</p> : null}

      <section>
        <h2 className="font-display text-2xl">Audit log</h2>
        <ul className="mt-3 space-y-2">
          {(session?.audit ?? []).slice().reverse().map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="rounded-2xl border border-line bg-card px-4 py-3 text-sm">
              <p className="text-muted">{entry.actor} · {entry.action}</p>
              <p className="mt-1">{entry.detail}</p>
              {entry.reasons.length > 0 ? <p className="mt-1 text-danger">{entry.reasons.join(" ")}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Flag({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-line bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </article>
  );
}

function Pile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
