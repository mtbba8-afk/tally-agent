export type AgingBucket = "current" | "1-7" | "8-14" | "15-30" | "31+";

export type ReceivableInput = {
  invoiceId: string;
  number: string;
  customer: string;
  status: string;
  sentAt: string | null;
  balanceCents: number;
  remindersSent: number[];
};

export type ReceivableRow = ReceivableInput & {
  ageDays: number;
  bucket: AgingBucket;
  expectedInDays: number;
  forecastDate: string;
  callToday: boolean;
  reason: string;
};

export type DisputeLine = {
  name: string;
  quantity: number;
  amountCents: number;
};

export function ageDays(sentAt: string | null, now: Date): number {
  if (!sentAt) return 0;
  const sent = new Date(sentAt).getTime();
  if (!Number.isFinite(sent)) return 0;
  return Math.max(0, Math.floor((now.getTime() - sent) / 86_400_000));
}

export function agingBucket(days: number): AgingBucket {
  if (days <= 0) return "current";
  if (days <= 7) return "1-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  return "31+";
}

export function expectedDays(input: { status: string; ageDays: number; remindersSent: number[] }): number {
  if (input.status === "disputed") return 30;
  if (input.remindersSent.includes(14) || input.ageDays >= 31) return 21;
  if (input.status === "partial" || input.remindersSent.includes(7) || input.ageDays >= 15) return 10;
  if (input.remindersSent.includes(3) || input.ageDays >= 8) return 7;
  if (input.status === "viewed") return 3;
  return 5;
}

export function buildReceivables(rows: ReceivableInput[], now: Date): ReceivableRow[] {
  return rows
    .filter((row) => row.balanceCents > 0 && ["sent", "viewed", "partial", "disputed"].includes(row.status))
    .map((row) => {
      const days = ageDays(row.sentAt, now);
      const bucket = agingBucket(days);
      const horizon = expectedDays({ status: row.status, ageDays: days, remindersSent: row.remindersSent });
      const disputed = row.status === "disputed";
      const callToday = !disputed && (days >= 8 || row.status === "partial" || row.remindersSent.includes(7) || row.remindersSent.includes(14));
      const reason = disputed
        ? "Disputed. The response packet needs a person."
        : callToday
          ? row.status === "partial"
            ? "Partial payment. Call for the balance."
            : `${days} days open. Call before another reminder.`
          : "Still inside the reminder window.";
      return {
        ...row,
        ageDays: days,
        bucket,
        expectedInDays: horizon,
        forecastDate: shiftDate(now, horizon),
        callToday,
        reason,
      };
    })
    .sort((a, b) => b.balanceCents - a.balanceCents || b.ageDays - a.ageDays);
}

export function cashForecast(rows: ReceivableRow[]): {
  next7Cents: number;
  next14Cents: number;
  next30Cents: number;
  callList: ReceivableRow[];
} {
  const collectable = rows.filter((row) => row.status !== "disputed");
  const sumWithin = (days: number) =>
    collectable.filter((row) => row.expectedInDays <= days).reduce((sum, row) => sum + row.balanceCents, 0);
  return {
    next7Cents: sumWithin(7),
    next14Cents: sumWithin(14),
    next30Cents: sumWithin(30),
    callList: collectable.filter((row) => row.callToday).slice(0, 5),
  };
}

export function payLaterMessage(balanceCents: number): string | null {
  if (balanceCents < 3_000 || balanceCents > 150_000) return null;
  const installment = Math.round(balanceCents / 4);
  return `Pay in 4 with PayPal Pay Later, about ${formatUsd(installment)} every two weeks. Subject to approval. Sandbox checkout shows the offer when the buyer qualifies.`;
}

export function draftDisputeResponse(input: {
  invoiceNumber: string;
  customerName: string;
  jobNote: string;
  lines: DisputeLine[];
  callSummary: string | null;
  reason: string;
}): { narrative: string; evidence: string[] } {
  const priced = input.lines
    .filter((line) => line.amountCents > 0)
    .map((line) => `${line.name} x ${line.quantity} = ${formatUsd(line.amountCents)}`);
  const lineSummary = priced.length > 0 ? priced.join("; ") : "no priced lines";
  const narrative = [
    `We completed the work on ${input.invoiceNumber} for ${input.customerName}.`,
    input.jobNote ? `The technician note says: ${input.jobNote}` : "",
    input.callSummary ? `The visit was booked from this call: ${input.callSummary}` : "",
    `Amounts come from the shop price book, not from a model: ${lineSummary}.`,
    `The customer opened a dispute (${input.reason}).`,
    "Please review the job note and the price book match. A person at the shop approves this response before it is sent.",
  ]
    .filter(Boolean)
    .join(" ");
  const evidence = [
    `Job note: ${input.jobNote || "No technician note on file."}`,
    ...priced.map((line) => `Price book line: ${line}`),
    input.callSummary ? `Call: ${input.callSummary}` : "Call: no booking record is attached.",
    "Photos: none on file. The owner can add them before this is submitted.",
  ];
  return { narrative, evidence };
}

export function formatUsd(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rem = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars}.${rem}`;
}

function shiftDate(now: Date, days: number): string {
  const copy = new Date(now.getTime() + days * 86_400_000);
  return copy.toISOString().slice(0, 10);
}
