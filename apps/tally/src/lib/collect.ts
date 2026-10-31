import {
  assertSentAmountsUnchanged,
  defaultPriceBook,
  type DraftLine,
} from "@tounkara/invoice-drafting";
import {
  MockPayPalGateway,
  PayPalApiError,
  SandboxPayPalGateway,
  moneyValue,
  type CreateInvoiceInput,
} from "@tounkara/payment-links";
import { composeReminder, selectDueInvoices, type ReminderStage } from "@tounkara/payment-followups";
import { assertAmountLocked, interpretWebhook, paidInFull, type PayPalWebhookEvent } from "@tounkara/reconciliation";
import { appendLog, sendWithPayPalAgent, summarizeShop } from "./agent";
import { updateLedger, viewLedger } from "./ledger";
import {
  balanceCents,
  createPayPalGateway,
  customerName,
  nextInvoiceNumber,
  nid,
  paypalConfigured,
  shopNow,
  splitName,
} from "./runtime";
import type { Invoice, LedgerData, Shop } from "./types";

const OPEN = new Set(["sent", "viewed", "partial", "awaiting_approval", "draft"]);

export async function deliverInvoice(invoiceId: string, origin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = await viewLedger();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (!OPEN.has(invoice.status) || invoice.status === "void" || invoice.status === "disputed") {
    return { ok: false, error: "This invoice can no longer be sent." };
  }
  if (invoice.subtotalCents <= 0) return { ok: false, error: "Add a price before sending." };
  const shop = data.shops.find((item) => item.id === invoice.shopId);
  const customer = data.customers.find((item) => item.id === invoice.customerId);
  if (!shop || !customer) return { ok: false, error: "Shop or customer is missing." };

  try {
    const sent = await pushToPayPal(invoice, shop, customer.email, customer.name, origin);
    await updateLedger((draft) => {
      const row = draft.invoices.find((item) => item.id === invoiceId);
      if (!row) return;
      row.status = "sent";
      row.sentAt = row.sentAt ?? new Date().toISOString();
      row.paypalInvoiceId = sent.paypalInvoiceId;
      row.paypalOrderId = sent.paypalOrderId;
      row.payUrl = sent.payUrl;
      row.gatewayMode = sent.mode;
      row.sendError = null;
      const job = draft.jobs.find((item) => item.id === row.jobId);
      if (job) job.status = "invoiced";
      void appendLog(draft, {
        shopId: row.shopId,
        actor: "agent",
        action: "invoice_sent",
        detail: sent.detail,
        invoiceId: row.id,
        jobId: row.jobId,
      });
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof PayPalApiError ? error.message : error instanceof Error ? error.message : "PayPal send failed.";
    await updateLedger((draft) => {
      const row = draft.invoices.find((item) => item.id === invoiceId);
      if (!row) return;
      row.sendError = message;
      void appendLog(draft, {
        shopId: row.shopId,
        actor: "system",
        action: "send_failed",
        detail: `PayPal did not accept ${row.number}. ${message}`,
        invoiceId: row.id,
        jobId: row.jobId,
      });
    });
    return { ok: false, error: message };
  }
}

async function pushToPayPal(
  invoice: Invoice,
  shop: Shop,
  email: string,
  recipientName: string,
  origin: string,
): Promise<{ paypalInvoiceId: string; paypalOrderId: string | null; payUrl: string; mode: "mock" | "sandbox"; detail: string }> {
  const localPay = `${origin}/pay/${invoice.id}`;
  if (paypalConfigured()) {
    try {
      const viaAgent = await sendWithPayPalAgent(invoice, shop, email, recipientName);
      if (viaAgent?.paypalInvoiceId) {
        const gateway = createPayPalGateway();
        let payUrl = viaAgent.payUrl;
        if (!payUrl && gateway instanceof SandboxPayPalGateway) {
          const sent = await gateway.sendInvoice(viaAgent.paypalInvoiceId);
          payUrl = sent.payUrl;
        }
        return {
          paypalInvoiceId: viaAgent.paypalInvoiceId,
          paypalOrderId: null,
          payUrl: payUrl || localPay,
          mode: "sandbox",
          detail: `Sent ${invoice.number} with the PayPal agent toolkit.`,
        };
      }
    } catch {
      // The REST client below is the fallback when the toolkit loop does not return an id.
    }
  }

  const gateway = createPayPalGateway();
  const created = await gateway.createInvoice(invoiceBody(invoice, shop, email, recipientName));
  const sent = await gateway.sendInvoice(created.id);
  let payUrl = sent.payUrl;
  let paypalOrderId: string | null = null;
  if (!payUrl) {
    const order = await gateway.createOrder({
      invoiceNumber: invoice.number,
      currency: "USD",
      amountCents: invoice.subtotalCents,
      description: `Invoice ${invoice.number}`,
      returnUrl: localPay,
      cancelUrl: localPay,
    });
    payUrl = order.approveUrl;
    paypalOrderId = order.id;
  }
  const mode = gateway instanceof MockPayPalGateway || gateway.mode === "mock" ? "mock" : "sandbox";
  return {
    paypalInvoiceId: created.id,
    paypalOrderId,
    payUrl: mode === "mock" ? localPay : payUrl || localPay,
    mode,
    detail:
      mode === "sandbox"
        ? `Sent ${invoice.number} through the PayPal sandbox.`
        : `Sent ${invoice.number} through the mock PayPal gateway. Add sandbox keys to create a real invoice.`,
  };
}

function invoiceBody(invoice: Invoice, shop: Shop, email: string, recipientName: string): CreateInvoiceInput {
  const recipient = splitName(recipientName);
  return {
    invoiceNumber: invoice.number,
    currency: "USD",
    note: invoice.customerNote,
    shop: {
      givenName: shop.ownerGivenName,
      surname: shop.ownerSurname,
      email: shop.email,
      businessName: shop.name,
    },
    recipient: { ...recipient, email },
    items: invoice.lines
      .filter((line) => line.amountCents > 0)
      .map((line) => ({
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      })),
  };
}

export async function applyPayPalEvent(event: PayPalWebhookEvent): Promise<string> {
  const known = (await viewLedger()).events.map((item) => item.id);
  const action = interpretWebhook(event, known);
  if (action.action === "ignore") return action.reason;

  await updateLedger((data) => {
    if (data.events.some((item) => item.id === event.id)) return;
    data.events.push({
      id: event.id,
      receivedAt: new Date().toISOString(),
      eventType: event.event_type,
      payload: event,
    });
    const invoice = findInvoice(data, "paypalInvoiceId" in action ? action.paypalInvoiceId : null, action.invoiceRef);
    if (!invoice) {
      void appendLog(data, {
        shopId: data.shops[0]?.id ?? "shop_northline",
        actor: "paypal",
        action: "webhook_unmatched",
        detail: `PayPal event ${event.event_type} did not match an invoice.`,
        invoiceId: null,
        jobId: null,
      });
      return;
    }
    const shopId = invoice.shopId;
    if (action.action === "mark_paid") {
      invoice.status = "paid";
      invoice.paidCents = action.amountCents ?? invoice.subtotalCents;
      invoice.paidAt = new Date().toISOString();
      void appendLog(data, {
        shopId,
        actor: "paypal",
        action: "payment_recorded",
        detail: `${invoice.number} was paid${action.amountCents ? ` (${moneyValue(action.amountCents)} USD)` : ""}.`,
        invoiceId: invoice.id,
        jobId: invoice.jobId,
      });
    } else if (action.action === "record_partial") {
      invoice.paidCents = action.amountCents;
      invoice.status = action.totalCents !== null && paidInFull(action.amountCents, action.totalCents) ? "paid" : "partial";
      if (invoice.status === "paid") invoice.paidAt = new Date().toISOString();
      void appendLog(data, {
        shopId,
        actor: "paypal",
        action: "payment_recorded",
        detail: `Recorded ${moneyValue(action.amountCents)} USD toward ${invoice.number}. Balance is ${moneyValue(balanceCents(invoice))} USD.`,
        invoiceId: invoice.id,
        jobId: invoice.jobId,
      });
    } else if (action.action === "mark_viewed") {
      if (invoice.status === "sent") invoice.status = "viewed";
      void appendLog(data, {
        shopId,
        actor: "paypal",
        action: "invoice_viewed",
        detail: `${customerName(data, invoice.customerId)} opened ${invoice.number}.`,
        invoiceId: invoice.id,
        jobId: invoice.jobId,
      });
    } else if (action.action === "flag_dispute") {
      invoice.status = "disputed";
      void appendLog(data, {
        shopId,
        actor: "paypal",
        action: "dispute_flagged",
        detail: `${invoice.number} is disputed. Reminders are paused.`,
        invoiceId: invoice.id,
        jobId: invoice.jobId,
      });
    }
  });
  return action.action;
}

function findInvoice(data: LedgerData, paypalInvoiceId: string | null, invoiceRef: string): Invoice | undefined {
  return data.invoices.find(
    (invoice) =>
      (paypalInvoiceId && invoice.paypalInvoiceId === paypalInvoiceId) ||
      invoice.number === invoiceRef ||
      invoice.paypalInvoiceId === invoiceRef ||
      invoice.id === invoiceRef,
  );
}

export async function runReminders(origin: string): Promise<{ sent: number }> {
  const data = await viewLedger();
  let sent = 0;
  for (const shop of data.shops) {
    const now = shopNow(shop);
    const due = selectDueInvoices(
      data.invoices
        .filter((invoice) => invoice.shopId === shop.id)
        .map((invoice) => ({
          id: invoice.id,
          status: invoice.status,
          sentAt: invoice.sentAt,
          remindersSent: invoice.remindersSent,
        })),
      now,
    );
    for (const item of due) {
      const ok = await sendOneReminder(item.id, item.stage, origin);
      if (ok) sent += 1;
    }
  }
  return { sent };
}

async function sendOneReminder(invoiceId: string, stage: ReminderStage, origin: string): Promise<boolean> {
  const data = await viewLedger();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  const shop = data.shops.find((item) => item.id === invoice?.shopId);
  const customer = data.customers.find((item) => item.id === invoice?.customerId);
  if (!invoice || !shop || !customer || !invoice.sentAt) return false;
  if (invoice.remindersSent.includes(stage)) return false;
  const payUrl = invoice.payUrl?.startsWith("http") ? invoice.payUrl : `${origin}/pay/${invoice.id}`;
  const message = composeReminder({
    stage,
    shopName: shop.name,
    customerFirstName: splitName(customer.name).givenName,
    invoiceNumber: invoice.number,
    amountCents: balanceCents(invoice),
    payUrl,
  });
  const gateway = createPayPalGateway();
  if (invoice.paypalInvoiceId && invoice.gatewayMode === "sandbox") {
    await gateway.remindInvoice(invoice.paypalInvoiceId, { subject: message.subject, note: message.body });
  } else if (invoice.paypalInvoiceId) {
    await gateway.remindInvoice(invoice.paypalInvoiceId, { subject: message.subject, note: message.body });
  }
  await updateLedger((draft) => {
    const row = draft.invoices.find((item) => item.id === invoiceId);
    if (!row || row.remindersSent.includes(stage)) return;
    row.remindersSent = [...row.remindersSent, stage];
    void appendLog(draft, {
      shopId: row.shopId,
      actor: "agent",
      action: "reminder_sent",
      detail: `Day ${stage} reminder for ${row.number}. ${message.body.replaceAll("\n", " ")}`,
      invoiceId: row.id,
      jobId: row.jobId,
    });
  });
  return true;
}

export function replaceDraftLines(invoice: Invoice, next: DraftLine[]): { ok: true } | { ok: false; error: string } {
  const locked = assertAmountLocked(invoice.status);
  if (!locked.ok) return locked;
  const same = assertSentAmountsUnchanged(invoice.lines, next);
  if (invoice.status !== "draft" && invoice.status !== "awaiting_approval" && !same.ok) return same;
  return { ok: true };
}

export function reprice(
  existing: DraftLine[],
  quantities: Record<string, number>,
  pricesCents: Record<string, number>,
): DraftLine[] {
  const book = defaultPriceBook();
  const lines: DraftLine[] = [];
  for (const [code, quantity] of Object.entries(quantities)) {
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (code === "review.unmatched" || code.startsWith("review.unmatched.")) {
      const prior = existing.find((line) => line.code === code);
      const unitPriceCents = Math.max(0, Math.round(pricesCents[code] ?? 0));
      lines.push({
        code,
        name: prior?.name ?? "Needs a price",
        description: prior?.description ?? prior?.name ?? "Needs a price",
        quantity,
        unitPriceCents,
        amountCents: Math.round(quantity * unitPriceCents),
      });
      continue;
    }
    const item = book.find((entry) => entry.code === code);
    if (!item) continue;
    lines.push({
      code: item.code,
      name: item.name,
      description: item.name,
      quantity,
      unitPriceCents: item.unitPriceCents,
      amountCents: Math.round(quantity * item.unitPriceCents),
    });
  }
  return lines;
}

export async function writeWeeklyDigest(): Promise<void> {
  await updateLedger((data) => {
    for (const shop of data.shops) {
      const now = shopNow(shop);
      const recent = data.logs.find(
        (entry) =>
          entry.shopId === shop.id &&
          entry.action === "weekly_digest" &&
          now.getTime() - new Date(entry.at).getTime() < 6 * 86_400_000,
      );
      if (recent) continue;
      const summary = summarizeShop(data, shop.id, now);
      void appendLog(data, {
        shopId: shop.id,
        actor: "agent",
        action: "weekly_digest",
        detail: `This week: ${moneyValue(summary.outstandingCents)} USD still open across ${summary.openCount} invoices. ${moneyValue(summary.paidThisMonthCents)} USD paid this month.`,
        invoiceId: null,
        jobId: null,
      });
    }
  });
}

export function allocateNumber(data: LedgerData): string {
  return nextInvoiceNumber(data);
}

export function freshId(prefix: string): string {
  return nid(prefix);
}

export async function refreshPayPalStatus(invoiceId: string): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const data = await viewLedger();
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice?.paypalInvoiceId) return { ok: false, error: "This invoice has no PayPal id yet." };
  if (!paypalConfigured()) return { ok: false, error: "PayPal sandbox keys are not set." };
  const gateway = createPayPalGateway();
  if (!(gateway instanceof SandboxPayPalGateway)) return { ok: false, error: "Sandbox gateway is not active." };
  try {
    const remote = await gateway.getInvoice(invoice.paypalInvoiceId);
    if (remote.status === "PAID" || remote.status === "MARKED_AS_PAID") {
      await applyPayPalEvent({
        id: `WH-POLL-${invoice.paypalInvoiceId}-${remote.status}`,
        event_type: "INVOICING.INVOICE.PAID",
        resource: {
          id: invoice.paypalInvoiceId,
          status: "PAID",
          invoice_number: invoice.number,
          amount: { currency_code: "USD", value: moneyValue(invoice.subtotalCents) },
        },
      });
    } else if (remote.status === "VIEWED" || remote.status === "UNPAID" || remote.status === "SENT") {
      if (remote.status === "VIEWED") {
        await applyPayPalEvent({
          id: `WH-POLL-${invoice.paypalInvoiceId}-VIEWED`,
          event_type: "INVOICING.INVOICE.UPDATED",
          resource: { id: invoice.paypalInvoiceId, status: "VIEWED", invoice_number: invoice.number },
        });
      }
    }
    return { ok: true, status: remote.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not read the PayPal invoice." };
  }
}
