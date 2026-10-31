export type PayPalWebhookEvent = {
  id: string;
  event_type: string;
  resource: Record<string, unknown>;
};

export type ReconciliationAction =
  | {
      action: "mark_paid";
      eventId: string;
      paypalInvoiceId: string | null;
      invoiceRef: string;
      amountCents: number | null;
    }
  | {
      action: "record_partial";
      eventId: string;
      paypalInvoiceId: string | null;
      invoiceRef: string;
      amountCents: number;
      totalCents: number | null;
    }
  | {
      action: "mark_viewed";
      eventId: string;
      paypalInvoiceId: string | null;
      invoiceRef: string;
    }
  | {
      action: "flag_dispute";
      eventId: string;
      paypalInvoiceId: string | null;
      invoiceRef: string;
    }
  | {
      action: "ignore";
      eventId: string;
      reason: string;
    };

const LOCK_ERROR =
  "Sent invoice amounts are locked. Create a new invoice to change a price or quantity.";

const OPEN_FOR_EDIT = new Set(["draft", "awaiting_approval"]);

export function interpretWebhook(event: PayPalWebhookEvent, knownEventIds: string[]): ReconciliationAction {
  if (knownEventIds.includes(event.id)) {
    return { action: "ignore", eventId: event.id, reason: "duplicate_event" };
  }

  if (event.event_type.startsWith("CUSTOMER.DISPUTE.")) {
    const invoiceRef = disputeInvoiceRef(event.resource);
    if (!invoiceRef) return { action: "ignore", eventId: event.id, reason: "dispute_missing_invoice" };
    return {
      action: "flag_dispute",
      eventId: event.id,
      paypalInvoiceId: null,
      invoiceRef,
    };
  }

  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const invoiceRef = stringField(event.resource, "custom_id") || stringField(event.resource, "invoice_id");
    if (!invoiceRef) return { action: "ignore", eventId: event.id, reason: "capture_missing_invoice" };
    return {
      action: "mark_paid",
      eventId: event.id,
      paypalInvoiceId: null,
      invoiceRef,
      amountCents: moneyField(event.resource.amount),
    };
  }

  if (event.event_type.startsWith("INVOICING.INVOICE.")) {
    return interpretInvoice(event);
  }

  return { action: "ignore", eventId: event.id, reason: "unhandled_event" };
}

export function paidInFull(paidCents: number, totalCents: number): boolean {
  return paidCents >= totalCents;
}

export function assertAmountLocked(status: string): { ok: true } | { ok: false; error: string } {
  if (OPEN_FOR_EDIT.has(status)) return { ok: true };
  return { ok: false, error: LOCK_ERROR };
}

export function centsFromPayPalValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function interpretInvoice(event: PayPalWebhookEvent): ReconciliationAction {
  const resource = event.resource;
  const status = (stringField(resource, "status") ?? "").toUpperCase();
  const paypalInvoiceId = stringField(resource, "id");
  const invoiceRef = invoiceNumber(resource) || paypalInvoiceId;
  if (!invoiceRef) return { action: "ignore", eventId: event.id, reason: "invoice_missing_ref" };

  const totalCents = moneyField(resource.amount);
  const paidCents = paidAmount(resource);

  if (status === "PARTIALLY_PAID" || (paidCents !== null && totalCents !== null && paidCents > 0 && paidCents < totalCents)) {
    return {
      action: "record_partial",
      eventId: event.id,
      paypalInvoiceId,
      invoiceRef,
      amountCents: paidCents ?? 0,
      totalCents,
    };
  }

  if (status === "PAID" || status === "MARKED_AS_PAID" || event.event_type === "INVOICING.INVOICE.PAID") {
    return {
      action: "mark_paid",
      eventId: event.id,
      paypalInvoiceId,
      invoiceRef,
      amountCents: paidCents ?? totalCents,
    };
  }

  if (status === "VIEWED") {
    return { action: "mark_viewed", eventId: event.id, paypalInvoiceId, invoiceRef };
  }

  return { action: "ignore", eventId: event.id, reason: "invoice_status_unhandled" };
}

function invoiceNumber(resource: Record<string, unknown>): string | null {
  const direct = stringField(resource, "invoice_number");
  if (direct) return direct;
  const detail = resource.detail;
  if (detail && typeof detail === "object") {
    return stringField(detail as Record<string, unknown>, "invoice_number");
  }
  return null;
}

function paidAmount(resource: Record<string, unknown>): number | null {
  const payments = resource.payments;
  if (!payments || typeof payments !== "object") return null;
  return moneyField((payments as Record<string, unknown>).paid_amount);
}

function moneyField(value: unknown): number | null {
  if (!value || typeof value !== "object") return centsFromPayPalValue(value);
  return centsFromPayPalValue((value as Record<string, unknown>).value);
}

function disputeInvoiceRef(resource: Record<string, unknown>): string | null {
  const direct = stringField(resource, "invoice_id") || stringField(resource, "invoice_number");
  if (direct) return direct;
  const rows = resource.disputed_transactions;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first = rows[0];
  if (!first || typeof first !== "object") return null;
  const row = first as Record<string, unknown>;
  return stringField(row, "invoice_id") || stringField(row, "invoice_number") || stringField(row, "custom");
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}
