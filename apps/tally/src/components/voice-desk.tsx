"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { finishJobAction, hearCustomerAction, startCallAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceCall, StoredTurn } from "@/lib/types";
import { SAMPLE_CUSTOMER_LINES, SAMPLE_TECH_NOTE, emptySlots, type BookingSlots } from "@tounkara/voice-intake";

type SpeechResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  onresult: ((event: SpeechResult) => void) | null;
  onerror: (() => void) | null;
};

function speechCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const host = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function VoiceDesk({ initial }: { initial: ServiceCall | null }) {
  const [callId, setCallId] = useState(initial?.id ?? null);
  const [turns, setTurns] = useState<StoredTurn[]>(initial?.turns ?? []);
  const [slots, setSlots] = useState<BookingSlots>(initial?.slots ?? emptySlots());
  const [booked, setBooked] = useState(initial?.status === "booked" || initial?.status === "noted");
  const [invoiceId, setInvoiceId] = useState(initial?.invoiceId ?? null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const callRef = useRef<string | null>(initial?.id ?? null);
  const router = useRouter();
  const [noteState, noteAction] = useActionState(finishJobAction, null);

  async function ensureCall(source: "live" | "transcript"): Promise<string | null> {
    if (callRef.current && !booked) return callRef.current;
    const started = await startCallAction(source);
    if ("error" in started) {
      setError(started.error);
      return null;
    }
    callRef.current = started.callId;
    setCallId(started.callId);
    setTurns([{ speaker: "agent", text: started.say, at: new Date().toISOString() }]);
    setSlots(started.slots);
    setBooked(false);
    setInvoiceId(null);
    window.history.replaceState(null, "", `/calls?call=${started.callId}`);
    return started.callId;
  }

  async function say(text: string, source: "live" | "transcript") {
    const id = await ensureCall(source);
    if (!id) return;
    const customerTurn: StoredTurn = { speaker: "customer", text, at: new Date().toISOString() };
    setTurns((current) => [...current, customerTurn]);
    const heard = await hearCustomerAction(id, text);
    if ("error" in heard) {
      setError(heard.error);
      return;
    }
    setTurns((current) => [...current, { speaker: "agent", text: heard.say, at: new Date().toISOString() }]);
    setSlots(heard.slots);
    if (heard.complete) {
      setBooked(true);
      router.refresh();
    }
  }

  async function playRecorded() {
    setBusy(true);
    setError(null);
    callRef.current = null;
    setBooked(false);
    const id = await ensureCall("transcript");
    if (!id) {
      setBusy(false);
      return;
    }
    for (const line of SAMPLE_CUSTOMER_LINES) {
      await wait(650);
      const heard = await hearCustomerAction(id, line);
      setTurns((current) => [
        ...current,
        { speaker: "customer", text: line, at: new Date().toISOString() },
        ...("error" in heard ? [] : [{ speaker: "agent" as const, text: heard.say, at: new Date().toISOString() }]),
      ]);
      if ("error" in heard) {
        setError(heard.error);
        break;
      }
      setSlots(heard.slots);
      if (heard.complete) setBooked(true);
    }
    setBusy(false);
    router.refresh();
  }

  function listen() {
    const Ctor = speechCtor();
    if (!Ctor) {
      setError("This browser cannot hear a call. Play the recorded call, or type what the customer said.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript?.trim();
      if (text) void say(text, "live");
    };
    rec.onerror = () => {
      setListening(false);
      setError("The microphone did not come through. Play the recorded call, or type the line.");
    };
    setListening(true);
    setError(null);
    void ensureCall("live").then((id) => {
      if (!id) {
        setListening(false);
        return;
      }
      rec.start();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="overflow-hidden rounded-3xl border border-line bg-card">
        <div className="flex items-center justify-between bg-accent px-5 py-4 text-[var(--accent-foreground)]">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] opacity-80">Shop line</p>
            <p className="font-display text-2xl">Tally is answering</p>
          </div>
          <p className="text-xs">{listening ? "Listening" : busy ? "Playing the call" : booked ? "Booked" : "Ready"}</p>
        </div>
        <div className="flex min-h-80 flex-col gap-3 px-4 py-4">
          {turns.length === 0 ? (
            <p className="text-sm text-muted">Play the recorded call, speak, or type. All three use the same booking path.</p>
          ) : (
            turns.map((turn, index) => (
              <p
                key={`${turn.at}-${index}`}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${turn.speaker === "agent" ? "bg-[#efe7d8]" : "ml-auto bg-accent text-[var(--accent-foreground)]"}`}
              >
                <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] opacity-70">{turn.speaker === "agent" ? "Tally" : "Customer"}</span>
                {turn.text}
              </p>
            ))
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-4">
          <Button type="button" disabled={busy} onClick={() => void playRecorded()}>
            Play the recorded call
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={listen}>
            {listening ? "Listening..." : "Speak live"}
          </Button>
        </div>
        <form
          className="flex gap-2 border-t border-line px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            const text = typed.trim();
            if (!text) return;
            setTyped("");
            void say(text, "live");
          }}
        >
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Type what the customer said"
            className="h-10 min-w-0 flex-1 rounded-full border border-line bg-background px-4 text-sm"
          />
          <Button type="submit" variant="outline" disabled={busy}>
            Send
          </Button>
        </form>
        {error ? <p className="px-4 pb-4 text-sm text-danger">{error}</p> : null}
      </section>
      <aside className="space-y-4">
        <div className="rounded-3xl border border-line bg-card p-4">
          <h2 className="font-display text-2xl">Booking</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <Slot label="Name" value={slots.customerName} />
            <Slot label="Problem" value={slots.symptom} />
            <Slot label="Address" value={slots.address} />
            <Slot label="Window" value={slots.windowLabel} />
            <Slot label="Phone" value={slots.phone} />
          </ul>
        </div>
        {booked && callId && !invoiceId ? (
          <form action={noteAction} className="space-y-3 rounded-3xl border border-line bg-card p-4">
            <h2 className="font-display text-2xl">Tech note</h2>
            <p className="text-sm text-muted">Prices come from the shop price book. This sample note should match a capacitor and 1.5 hours of labor.</p>
            <input type="hidden" name="callId" value={callId} />
            <Textarea name="notes" defaultValue={SAMPLE_TECH_NOTE} rows={4} />
            {noteState?.error ? <p className="text-sm text-danger">{noteState.error}</p> : null}
            <SubmitButton pendingLabel="Pricing...">Price the note</SubmitButton>
          </form>
        ) : null}
        {invoiceId ? (
          <p className="text-sm">
            Invoice drafted.{" "}
            <a className="text-accent" href={`/invoices/${invoiceId}`}>
              Open it
            </a>
          </p>
        ) : null}
      </aside>
    </div>
  );
}

function Slot({ label, value }: { label: string; value: string | null }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value ?? "Waiting"}</span>
    </li>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
