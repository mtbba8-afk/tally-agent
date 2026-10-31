export const REMINDER_LADDER = [3, 7, 14] as const;

export type ReminderStage = (typeof REMINDER_LADDER)[number];

export type FollowupStatus =
  | "draft"
  | "awaiting_approval"
  | "sent"
  | "viewed"
  | "partial"
  | "paid"
  | "void"
  | "disputed";

const CHASEABLE = new Set<FollowupStatus>(["sent", "viewed", "partial"]);

const DAY_MS = 86_400_000;

export type DueInvoice = {
  id: string;
  status: FollowupStatus;
  sentAt: string | null;
  remindersSent: ReminderStage[];
};

export type ReminderCopy = {
  stage: ReminderStage;
  subject: string;
  body: string;
  offerPayLater: boolean;
};

export function dueReminderStage(input: {
  sentAt: Date;
  now: Date;
  sentStages: ReminderStage[];
  status: FollowupStatus;
}): ReminderStage | null {
  if (!CHASEABLE.has(input.status)) return null;
  const days = Math.floor((input.now.getTime() - input.sentAt.getTime()) / DAY_MS);
  for (const stage of REMINDER_LADDER) {
    if (days >= stage && !input.sentStages.includes(stage)) return stage;
  }
  return null;
}

export function selectDueInvoices(invoices: DueInvoice[], now: Date): Array<{ id: string; stage: ReminderStage }> {
  const due: Array<{ id: string; stage: ReminderStage }> = [];
  for (const invoice of invoices) {
    if (!invoice.sentAt) continue;
    const stage = dueReminderStage({
      sentAt: new Date(invoice.sentAt),
      now,
      sentStages: invoice.remindersSent,
      status: invoice.status,
    });
    if (stage) due.push({ id: invoice.id, stage });
  }
  return due;
}

export function composeReminder(input: {
  stage: ReminderStage;
  shopName: string;
  customerFirstName: string;
  invoiceNumber: string;
  amountCents: number;
  payUrl: string;
}): ReminderCopy {
  const amount = formatUsd(input.amountCents);
  const who = input.customerFirstName.trim() || "there";
  if (input.stage === 3) {
    return {
      stage: 3,
      offerPayLater: false,
      subject: `Invoice ${input.invoiceNumber} from ${input.shopName}`,
      body: [
        `Hi ${who},`,
        "",
        `${input.shopName} finished the work on invoice ${input.invoiceNumber}. The balance is ${amount}.`,
        `You can pay here: ${input.payUrl}`,
        "",
        "Thank you.",
      ].join("\n"),
    };
  }
  if (input.stage === 7) {
    return {
      stage: 7,
      offerPayLater: true,
      subject: `Invoice ${input.invoiceNumber} is still open`,
      body: [
        `Hi ${who},`,
        "",
        `Checking in on invoice ${input.invoiceNumber} from ${input.shopName}. ${amount} is still open.`,
        `You can pay here: ${input.payUrl}`,
        "If it is easier, PayPal Pay Later is available on the same link.",
        "",
        "Reply if something on the invoice looks wrong.",
      ].join("\n"),
    };
  }
  return {
    stage: 14,
    offerPayLater: true,
    subject: `Invoice ${input.invoiceNumber} has been open for 14 days`,
    body: [
      `Hi ${who},`,
      "",
      `Invoice ${input.invoiceNumber} from ${input.shopName} has been open for 14 days. The balance is ${amount}.`,
      `You can pay here: ${input.payUrl}`,
      "PayPal Pay Later is on that same link if splitting it would help.",
      "If the work or the amount is in dispute, reply and we will hold reminders.",
      "",
      "Thank you.",
    ].join("\n"),
  };
}

export function formatUsd(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rem = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars}.${rem}`;
}
