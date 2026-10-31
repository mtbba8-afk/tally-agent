import { formatUsd } from "@tounkara/cash-desk";
import { defaultPriceBook } from "@tounkara/invoice-drafting";
import { SandboxPayPalGateway } from "@tounkara/payment-links";
import {
  applyCustomerUtterance,
  bookingNote,
  customerEmail,
  emptySlots,
  openingLine,
  type BookingSlots,
} from "@tounkara/voice-intake";
import { decisionFor, draftFromNotes } from "./agent";
import { allocateNumber, deliverInvoice, freshId } from "./collect";
import { updateLedger, viewLedger } from "./ledger";
import { createPayPalGateway } from "./runtime";
import type { Invoice, OwnerMessage, ServiceCall } from "./types";

export type HearResult = {
  say: string;
  complete: boolean;
  slots: BookingSlots;
  jobId: string | null;
  customerId: string | null;
};

export async function openCall(shopId: string, source: ServiceCall["source"]): Promise<{ callId: string; say: string; slots: BookingSlots }> {
  const data = await viewLedger();
  const shop = data.shops.find((item) => item.id === shopId);
  if (!shop) throw new Error("Pick a shop first.");
  const say = openingLine(shop.name);
  const callId = freshId("call");
  const slots = emptySlots();
  await updateLedger((ledger) => {
    ledger.calls.push({
      id: callId,
      shopId,
      customerId: null,
      jobId: null,
      invoiceId: null,
      source,
      status: "in_progress",
      turns: [{ speaker: "agent", text: say, at: new Date().toISOString() }],
      slots,
      startedAt: new Date().toISOString(),
      bookedAt: null,
    });
    ledger.logs.push({
      id: freshId("log"),
      shopId,
      at: new Date().toISOString(),
      actor: "agent",
      action: "call_opened",
      detail: source === "transcript" ? "Opened the recorded-call path." : source === "live" ? "Opened a live call." : "Opened a booking from an assistant.",
      invoiceId: null,
      jobId: null,
    });
  });
  return { callId, say, slots };
}

export async function hearCustomer(callId: string, text: string): Promise<HearResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("The customer line is empty.");
  const data = await viewLedger();
  const call = data.calls.find((item) => item.id === callId);
  const shop = data.shops.find((item) => item.id === call?.shopId);
  if (!call || !shop) throw new Error("That call is not on the desk.");
  if (call.status !== "in_progress") {
    return {
      say: "That visit is already booked.",
      complete: true,
      slots: call.slots,
      jobId: call.jobId,
      customerId: call.customerId,
    };
  }
  const next = applyCustomerUtterance(call.slots, trimmed, shop.name);
  let jobId = call.jobId;
  let customerId = call.customerId;
  await updateLedger((ledger) => {
    const row = ledger.calls.find((item) => item.id === callId);
    if (!row || row.status !== "in_progress") return;
    const at = new Date().toISOString();
    row.turns.push({ speaker: "customer", text: trimmed, at });
    row.slots = next.slots;
    row.turns.push({ speaker: "agent", text: next.say, at });
    if (!next.complete) return;
    const customer = upsertCustomer(ledger, row.shopId, next.slots);
    const job = {
      id: freshId("job"),
      shopId: row.shopId,
      customerId: customer.id,
      trade: shop.trade,
      notes: bookingNote(next.slots),
      status: "open" as const,
      completedAt: null,
    };
    ledger.jobs.push(job);
    row.customerId = customer.id;
    row.jobId = job.id;
    row.status = "booked";
    row.bookedAt = at;
    jobId = job.id;
    customerId = customer.id;
    ledger.logs.push({
      id: freshId("log"),
      shopId: row.shopId,
      at,
      actor: "agent",
      action: "job_booked",
      detail: `Booked ${customer.name} at ${next.slots.address} ${next.slots.windowLabel}. ${next.slots.symptom}`,
      invoiceId: null,
      jobId: job.id,
    });
  });
  return { say: next.say, complete: next.complete, slots: next.slots, jobId, customerId };
}

export async function noteFinishedJob(callId: string, note: string, origin: string): Promise<{ invoiceId: string; approvalRequired: boolean }> {
  const data = await viewLedger();
  const call = data.calls.find((item) => item.id === callId);
  if (!call?.jobId || !call.customerId) throw new Error("Book the visit before the tech note.");
  if (call.invoiceId) return { invoiceId: call.invoiceId, approvalRequired: false };
  const shop = data.shops.find((item) => item.id === call.shopId);
  const customer = data.customers.find((item) => item.id === call.customerId);
  if (!shop || !customer) throw new Error("Shop or customer is missing.");
  const drafted = await draftFromNotes({ note, trade: shop.trade, customerName: customer.name });
  const decision = decisionFor(drafted.draft, shop);
  const invoiceId = freshId("inv");
  const token = crypto.randomUUID().replace(/-/g, "");
  let number = "";
  await updateLedger((ledger) => {
    const row = ledger.calls.find((item) => item.id === callId);
    const job = ledger.jobs.find((item) => item.id === call.jobId);
    if (!row || !job || row.invoiceId) return;
    job.notes = drafted.draft.jobNote;
    job.status = "done";
    job.completedAt = new Date().toISOString();
    number = allocateNumber(ledger);
    const invoice: Invoice = {
      id: invoiceId,
      shopId: shop.id,
      jobId: job.id,
      customerId: customer.id,
      number,
      status: "awaiting_approval",
      lines: drafted.draft.lines,
      subtotalCents: drafted.draft.subtotalCents,
      paidCents: 0,
      confidence: drafted.draft.confidence,
      note: drafted.draft.jobNote,
      customerNote: drafted.customerNote,
      sendError: null,
      paypalInvoiceId: null,
      paypalOrderId: null,
      payUrl: null,
      gatewayMode: "mock",
      sentAt: null,
      paidAt: null,
      remindersSent: [],
    };
    ledger.invoices.push(invoice);
    row.invoiceId = invoiceId;
    row.status = "noted";
    if (decision.required) {
      const link = `${origin}/approve/${token}`;
      ledger.messages.push({
        id: freshId("msg"),
        shopId: shop.id,
        invoiceId,
        callId,
        direction: "out",
        body: `${shop.name}: ${number} for ${customer.name} is ${formatUsd(drafted.draft.subtotalCents)} from the price book. Reply YES to send the PayPal invoice. ${link}`,
        token,
        at: new Date().toISOString(),
        status: "desk",
      });
    }
    ledger.logs.push({
      id: freshId("log"),
      shopId: shop.id,
      at: new Date().toISOString(),
      actor: "agent",
      action: "draft_created",
      detail: decision.required
        ? `Drafted ${number} from the tech note (${drafted.source === "model" ? "model sentence, price book amounts" : "price book"}). ${decision.reason}`
        : `Drafted ${number} under the auto-send threshold. Sending it now.`,
      invoiceId,
      jobId: job.id,
    });
  });
  if (decision.required) await trySendOwnerSms(shop.id, invoiceId);
  if (!decision.required) await deliverInvoice(invoiceId, origin);
  return { invoiceId, approvalRequired: decision.required };
}

export async function approveToken(token: string, origin: string): Promise<{ ok: true; invoiceId: string; already: boolean } | { ok: false; error: string; invoiceId?: string }> {
  const data = await viewLedger();
  const message = data.messages.find((item) => item.token === token);
  if (!message?.invoiceId) return { ok: false, error: "This approval link is not active." };
  const invoice = data.invoices.find((item) => item.id === message.invoiceId);
  if (!invoice) return { ok: false, error: "Invoice missing." };
  if (["sent", "viewed", "partial", "paid"].includes(invoice.status)) {
    return { ok: true, invoiceId: invoice.id, already: true };
  }
  if (invoice.status !== "awaiting_approval" && invoice.status !== "draft") {
    return { ok: false, error: "This invoice can no longer be sent.", invoiceId: invoice.id };
  }
  if (invoice.lines.some((line) => line.code.startsWith("review.unmatched") && line.amountCents <= 0)) {
    return { ok: false, error: "A line is not in the price book. Price it on the desk before sending.", invoiceId: invoice.id };
  }
  await updateLedger((ledger) => {
    ledger.messages.push({
      id: freshId("msg"),
      shopId: message.shopId,
      invoiceId: message.invoiceId,
      callId: message.callId,
      direction: "in",
      body: "YES",
      token: null,
      at: new Date().toISOString(),
      status: "desk",
    });
    ledger.logs.push({
      id: freshId("log"),
      shopId: message.shopId,
      at: new Date().toISOString(),
      actor: "owner",
      action: "approval_sms",
      detail: `Owner approved ${invoice.number} from the phone.`,
      invoiceId: invoice.id,
      jobId: invoice.jobId,
    });
  });
  const sent = await deliverInvoice(invoice.id, origin);
  if (!sent.ok) return { ok: false, error: sent.error, invoiceId: invoice.id };
  return { ok: true, invoiceId: invoice.id, already: false };
}

export async function bookVisit(input: {
  shopId: string;
  customerName: string;
  phone: string;
  address: string;
  symptom: string;
  windowLabel: string;
  email?: string;
  takeDeposit: boolean;
  origin: string;
}): Promise<{ jobId: string; customerId: string; callId: string; deposit: { orderId: string; approveUrl: string | null; amountCents: number } | null }> {
  const data = await viewLedger();
  const shop = data.shops.find((item) => item.id === input.shopId) ?? data.shops[0];
  if (!shop) throw new Error("No shop is on the ledger.");
  const slots: BookingSlots = {
    customerName: input.customerName.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || null,
    address: input.address.trim(),
    symptom: input.symptom.trim(),
    windowLabel: input.windowLabel.trim(),
  };
  if (!slots.customerName || !slots.phone || !slots.address || !slots.symptom || !slots.windowLabel) {
    throw new Error("customerName, phone, address, symptom, and windowLabel are required.");
  }
  const callId = freshId("call");
  const jobId = freshId("job");
  let customerId = "";
  await updateLedger((ledger) => {
    const customer = upsertCustomer(ledger, shop.id, slots);
    customerId = customer.id;
    ledger.jobs.push({
      id: jobId,
      shopId: shop.id,
      customerId: customer.id,
      trade: shop.trade,
      notes: bookingNote(slots),
      status: "open",
      completedAt: null,
    });
    ledger.calls.push({
      id: callId,
      shopId: shop.id,
      customerId: customer.id,
      jobId,
      invoiceId: null,
      source: "mcp",
      status: "booked",
      turns: [
        {
          speaker: "agent",
          text: `Booked ${slots.customerName} from an assistant. ${slots.address}, ${slots.windowLabel}. ${slots.symptom}`,
          at: new Date().toISOString(),
        },
      ],
      slots,
      startedAt: new Date().toISOString(),
      bookedAt: new Date().toISOString(),
    });
    ledger.logs.push({
      id: freshId("log"),
      shopId: shop.id,
      at: new Date().toISOString(),
      actor: "agent",
      action: "job_booked",
      detail: `Assistant booked ${customer.name} at ${slots.address} ${slots.windowLabel}.`,
      invoiceId: null,
      jobId,
    });
  });
  if (!input.takeDeposit) return { jobId, customerId, callId, deposit: null };
  const diagnostic = defaultPriceBook().find((item) => item.trade === shop.trade && item.code.endsWith(".diagnostic"));
  const amountCents = diagnostic?.unitPriceCents ?? 8900;
  const gateway = createPayPalGateway();
  const order = await gateway.createOrder({
    invoiceNumber: `DEP-${jobId.slice(-6).toUpperCase()}`,
    currency: "USD",
    amountCents,
    description: `${shop.name} diagnostic deposit`,
    returnUrl: `${input.origin}/calls?call=${callId}`,
    cancelUrl: `${input.origin}/calls?call=${callId}`,
  });
  await updateLedger((ledger) => {
    ledger.logs.push({
      id: freshId("log"),
      shopId: shop.id,
      at: new Date().toISOString(),
      actor: "agent",
      action: "deposit_order",
      detail: `Opened a ${formatUsd(amountCents)} PayPal deposit order ${order.id} for ${slots.customerName}.`,
      invoiceId: null,
      jobId,
    });
  });
  return { jobId, customerId, callId, deposit: { orderId: order.id, approveUrl: order.approveUrl, amountCents } };
}

export async function submitDisputePacket(packetId: string): Promise<string> {
  const data = await viewLedger();
  const packet = data.disputes.find((item) => item.id === packetId);
  if (!packet) return "Packet not found.";
  if (packet.status !== "approved") return "Approve the packet before it can be submitted.";
  const disputeId = packet.paypalDisputeId;
  if (!disputeId || disputeId.startsWith("PP-D-DEMO")) {
    const note = "Demo dispute id. The approved packet stays on the desk. A live PayPal dispute id is submitted to the sandbox.";
    await rememberSubmit(packetId, note);
    return note;
  }
  const gateway = createPayPalGateway();
  if (!(gateway instanceof SandboxPayPalGateway)) {
    const note = "PayPal sandbox keys are not set, so the approved packet was not submitted.";
    await rememberSubmit(packetId, note);
    return note;
  }
  try {
    await gateway.provideDisputeEvidence(disputeId, `${packet.narrative}\n\n${packet.evidence.join("\n")}`.slice(0, 1900));
    const note = `Submitted evidence to PayPal dispute ${disputeId}.`;
    await rememberSubmit(packetId, note);
    return note;
  } catch (error) {
    const note = error instanceof Error ? error.message : "PayPal did not accept the evidence.";
    await rememberSubmit(packetId, note);
    return note;
  }
}

async function rememberSubmit(packetId: string, note: string): Promise<void> {
  await updateLedger((ledger) => {
    const row = ledger.disputes.find((item) => item.id === packetId);
    if (!row) return;
    row.submitNote = note;
    ledger.logs.push({
      id: freshId("log"),
      shopId: row.shopId,
      at: new Date().toISOString(),
      actor: "agent",
      action: "dispute_submitted",
      detail: note,
      invoiceId: row.invoiceId,
      jobId: null,
    });
  });
}

async function trySendOwnerSms(shopId: string, invoiceId: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM?.trim();
  const to = process.env.OWNER_SMS_TO?.trim();
  if (!sid || !token || !from || !to) return;
  const data = await viewLedger();
  const message = [...data.messages].reverse().find((item) => item.invoiceId === invoiceId && item.direction === "out");
  if (!message) return;
  const body = new URLSearchParams({ To: to, From: from, Body: message.body });
  let response: Response;
  try {
    response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch {
    return;
  }
  if (!response.ok) return;
  await updateLedger((ledger) => {
    const row = ledger.messages.find((item) => item.id === message.id);
    if (row) row.status = "sent";
    ledger.logs.push({
      id: freshId("log"),
      shopId,
      at: new Date().toISOString(),
      actor: "system",
      action: "sms_sent",
      detail: `Sent the approval text to ${to}.`,
      invoiceId,
      jobId: null,
    });
  });
}

function upsertCustomer(ledger: { customers: { id: string; shopId: string; name: string; email: string; phone: string }[] }, shopId: string, slots: BookingSlots) {
  const phone = slots.phone ?? "";
  const name = slots.customerName ?? "Customer";
  const existing = ledger.customers.find(
    (customer) => customer.shopId === shopId && (phone ? customer.phone === phone : customer.name.toLowerCase() === name.toLowerCase()),
  );
  if (existing) return existing;
  const customer = {
    id: freshId("cus"),
    shopId,
    name,
    email: customerEmail(slots),
    phone: phone || "555-0100",
  };
  ledger.customers.push(customer);
  return customer;
}

export function approvalMessage(messages: OwnerMessage[], invoiceId: string): OwnerMessage | undefined {
  return [...messages].reverse().find((item) => item.invoiceId === invoiceId && item.direction === "out" && item.token);
}
