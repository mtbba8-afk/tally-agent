import { gateway, generateText, isStepCount, streamText, tool, type ModelMessage, type Tool } from "ai";
import { z } from "zod";
import {
  approvalDecision,
  defaultPriceBook,
  draftInvoiceFromNotes,
  type InvoiceDraft,
  type Trade,
} from "@tounkara/invoice-drafting";
import { formatUsd, type ReminderStage } from "@tounkara/payment-followups";
import { updateLedger } from "./ledger";
import {
  aiEnabled,
  balanceCents,
  createPayPalToolkit,
  customerName,
  modelId,
  nid,
  shopNow,
} from "./runtime";
import type { Invoice, LedgerData, Shop } from "./types";

type LegacyTool = {
  description?: string;
  execute?: (input: unknown) => Promise<unknown>;
};

export function adaptPayPalTools(raw: Record<string, LegacyTool>): Record<string, Tool> {
  const tools: Record<string, Tool> = {};
  for (const [name, old] of Object.entries(raw)) {
    if (!old.execute) continue;
    const execute = old.execute;
    tools[name] = tool({
      description: (old.description ?? name).replaceAll("—", ", ").slice(0, 1500),
      inputSchema: z.object({}).passthrough(),
      execute: async (input) => {
        try {
          return await execute(input);
        } catch (error) {
          return { error: error instanceof Error ? error.message : "PayPal tool failed" };
        }
      },
    });
  }
  return tools;
}

export async function draftFromNotes(input: {
  note: string;
  trade: Trade;
  customerName?: string;
}): Promise<{ draft: InvoiceDraft; customerNote: string; source: "model" | "price_book" }> {
  const draft = draftInvoiceFromNotes({
    note: input.note,
    trade: input.trade,
    priceBook: defaultPriceBook(),
    customerName: input.customerName,
  });
  const fallback = customerSentence(draft);
  if (!aiEnabled()) return { draft, customerNote: fallback, source: "price_book" };

  try {
    const result = await generateText({
      model: gateway(modelId()),
      tools: {
        price_job: tool({
          description:
            "Price a finished job from the shop price book. Call this once. Never invent a unit price. The tool result is the only source of amounts.",
          inputSchema: z.object({
            note: z.string(),
            trade: z.enum(["hvac", "plumbing", "electrical"]),
          }),
          execute: async ({ note, trade }) =>
            draftInvoiceFromNotes({
              note,
              trade,
              priceBook: defaultPriceBook(),
              customerName: input.customerName,
            }),
        }),
      },
      stopWhen: isStepCount(4),
      system:
        "You draft invoices for a small trades shop. Prices come only from price_job. After the tool returns, write one plain sentence the customer can read. Do not restate a different price. Do not use an em dash.",
      prompt: `Trade: ${input.trade}. Job note: ${input.note}. Call price_job with that note and trade, then write the customer sentence.`,
    });
    const customerNote = cleanSentence(result.text) || fallback;
    return { draft, customerNote, source: "model" };
  } catch {
    return { draft, customerNote: fallback, source: "price_book" };
  }
}

export function customerSentence(draft: InvoiceDraft): string {
  const names = draft.lines.filter((line) => !line.code.startsWith("review.unmatched")).map((line) => line.name);
  if (names.length === 0) return "The note did not match the price book. Add a price before sending.";
  return `Work completed: ${names.join(", ")}.`;
}

function cleanSentence(text: string): string {
  const line = text
    .replace(/```[\s\S]*?```/g, " ")
    .replaceAll("—", ", ")
    .replaceAll("–", ", ")
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 400);
  return line;
}

export async function sendWithPayPalAgent(invoice: Invoice, shop: Shop, recipientEmail: string, recipientName: string): Promise<{
  paypalInvoiceId: string;
  payUrl: string | null;
} | null> {
  const toolkit = createPayPalToolkit();
  if (!toolkit || !aiEnabled()) return null;
  const items = invoice.lines
    .filter((line) => line.amountCents > 0)
    .map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unit_price: Number((line.unitPriceCents / 100).toFixed(2)),
      description: line.description,
    }));
  const result = await generateText({
    model: gateway(modelId()),
    tools: adaptPayPalTools(toolkit.getTools() as Record<string, LegacyTool>),
    stopWhen: isStepCount(8),
    system:
      "You send PayPal sandbox invoices. Call create_invoice with the exact amounts given, then send_invoice with the returned id. Do not change quantities or prices. Stay in sandbox.",
    prompt: [
      `Create and send invoice ${invoice.number}.`,
      `Currency USD.`,
      `Invoice number: ${invoice.number}.`,
      `Note: ${invoice.customerNote}`,
      `Invoicer business: ${shop.name}.`,
      `Invoicer name: ${shop.ownerGivenName} ${shop.ownerSurname}.`,
      `Invoicer email: ${shop.email}.`,
      `Recipient name: ${recipientName}.`,
      `Recipient email: ${recipientEmail}.`,
      `Items JSON: ${JSON.stringify(items)}.`,
      "primary_recipients must include the recipient email.",
    ].join("\n"),
  });
  const paypalInvoiceId = findInvoiceId(result);
  if (!paypalInvoiceId) return null;
  const payUrl = findPayUrl(result);
  return { paypalInvoiceId, payUrl };
}

function findInvoiceId(result: unknown): string | null {
  const match = JSON.stringify(result).match(/INV2-[A-Z0-9-]+/);
  return match?.[0] ?? null;
}

function findPayUrl(result: unknown): string | null {
  const match = JSON.stringify(result).match(/https:\/\/www\.sandbox\.paypal\.com[^"\\\s]+/);
  return match?.[0] ?? null;
}

export function booksTools(data: LedgerData, shopId: string) {
  const shop = data.shops.find((item) => item.id === shopId);
  const now = shopNow(shop);
  return {
    list_open_invoices: tool({
      description: "List unpaid invoices for the current shop, with balances in cents.",
      inputSchema: z.object({}),
      execute: async () =>
        data.invoices
          .filter((invoice) => invoice.shopId === shopId && ["sent", "viewed", "partial"].includes(invoice.status))
          .map((invoice) => ({
            number: invoice.number,
            customer: customerName(data, invoice.customerId),
            balanceCents: balanceCents(invoice),
            status: invoice.status,
            sentAt: invoice.sentAt,
            remindersSent: invoice.remindersSent,
          })),
    }),
    receivables_summary: tool({
      description: "Sum outstanding and paid amounts for the current shop.",
      inputSchema: z.object({}),
      execute: async () => summarizeShop(data, shopId, now),
    }),
    recent_activity: tool({
      description: "Recent agent, owner, and PayPal actions for the current shop.",
      inputSchema: z.object({}),
      execute: async () =>
        data.logs
          .filter((entry) => entry.shopId === shopId)
          .slice()
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 8)
          .map((entry) => ({ at: entry.at, actor: entry.actor, detail: entry.detail })),
    }),
  };
}

export function summarizeShop(data: LedgerData, shopId: string, now: Date) {
  const invoices = data.invoices.filter((invoice) => invoice.shopId === shopId);
  const open = invoices.filter((invoice) => ["sent", "viewed", "partial"].includes(invoice.status));
  const month = now.toISOString().slice(0, 7);
  const paidThisMonth = invoices.filter((invoice) => invoice.status === "paid" && invoice.paidAt?.startsWith(month));
  return {
    outstandingCents: open.reduce((sum, invoice) => sum + balanceCents(invoice), 0),
    openCount: open.length,
    paidThisMonthCents: paidThisMonth.reduce((sum, invoice) => sum + invoice.paidCents, 0),
    paidThisMonthCount: paidThisMonth.length,
    disputedCount: invoices.filter((invoice) => invoice.status === "disputed").length,
  };
}

export function answerFromBooks(question: string, data: LedgerData, shopId: string, now: Date): string {
  const q = question.toLowerCase();
  const invoices = data.invoices.filter((invoice) => invoice.shopId === shopId);
  const open = invoices.filter((invoice) => ["sent", "viewed", "partial"].includes(invoice.status));
  const summary = summarizeShop(data, shopId, now);
  if (/who|owe|outstanding|unpaid|open/.test(q)) {
    if (open.length === 0) return "Nobody has an open invoice right now.";
    const lines = open.map(
      (invoice) =>
        `${customerName(data, invoice.customerId)} owes ${formatUsd(balanceCents(invoice))} on ${invoice.number}.`,
    );
    return `${lines.join(" ")} Outstanding is ${formatUsd(summary.outstandingCents)}.`;
  }
  if (/paid|collected|came in|this month/.test(q)) {
    return `${formatUsd(summary.paidThisMonthCents)} was paid this month across ${summary.paidThisMonthCount} invoice${summary.paidThisMonthCount === 1 ? "" : "s"}.`;
  }
  if (/remind|day 7|day 14|overdue|chase/.test(q)) {
    const due = open.filter((invoice) => invoice.sentAt && ageDays(invoice.sentAt, now) >= 7);
    if (due.length === 0) return "No open invoice is past day 7.";
    return due
      .map((invoice) => {
        const stage = nextStage(invoice.remindersSent, ageDays(invoice.sentAt!, now));
        return `${invoice.number} for ${customerName(data, invoice.customerId)} is ${ageDays(invoice.sentAt!, now)} days old. Next reminder: day ${stage ?? "none"}.`;
      })
      .join(" ");
  }
  return `Outstanding is ${formatUsd(summary.outstandingCents)} across ${summary.openCount} open invoice${summary.openCount === 1 ? "" : "s"}. ${formatUsd(summary.paidThisMonthCents)} came in this month. Ask who owes you, what was paid, or which invoices are past day 7.`;
}

function ageDays(sentAt: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(sentAt).getTime()) / 86_400_000);
}

function nextStage(sent: ReminderStage[], days: number): ReminderStage | null {
  for (const stage of [3, 7, 14] as const) {
    if (days >= stage && !sent.includes(stage)) return stage;
  }
  return null;
}

export async function askBooks(messages: ModelMessage[], shopId: string) {
  const data = await (await import("./ledger")).viewLedger();
  const shop = data.shops.find((item) => item.id === shopId);
  const toolkit = createPayPalToolkit();
  const paypalTools = toolkit && aiEnabled() ? adaptPayPalTools(toolkit.getTools() as Record<string, LegacyTool>) : {};
  return streamText({
    model: gateway(modelId()),
    system: [
      "You are the books assistant for one trades shop.",
      "Answer from list_open_invoices, receivables_summary, and recent_activity.",
      "Amounts are cents in the tools. Speak in dollars.",
      "If PayPal tools are available, you may list sandbox invoices or disputes. Never create or send money from a question.",
      "Do not invent customers or amounts. Do not use an em dash.",
      `Shop: ${shop?.name ?? "unknown"}.`,
    ].join(" "),
    messages,
    tools: { ...booksTools(data, shopId), ...paypalTools },
    stopWhen: isStepCount(6),
  });
}

export function decisionFor(draft: InvoiceDraft, shop: Shop) {
  return approvalDecision({
    totalCents: draft.subtotalCents,
    thresholdCents: shop.autoSendThresholdCents,
    confidence: draft.confidence,
  });
}

export async function appendLog(
  data: LedgerData,
  entry: Omit<LedgerData["logs"][number], "id" | "at"> & { at?: string },
): Promise<void> {
  data.logs.push({
    id: nid("log"),
    at: entry.at ?? new Date().toISOString(),
    shopId: entry.shopId,
    actor: entry.actor,
    action: entry.action,
    detail: entry.detail,
    invoiceId: entry.invoiceId,
    jobId: entry.jobId,
  });
}

export async function remember(mutate: (data: LedgerData) => void): Promise<LedgerData> {
  return updateLedger(mutate);
}
