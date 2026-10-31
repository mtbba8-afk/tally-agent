import { describe, expect, it } from "vitest";
import { assertAmountLocked, interpretWebhook, paidInFull } from "./index";

describe("interpretWebhook", () => {
  it("marks an invoice paid from INVOICING.INVOICE.PAID", () => {
    const result = interpretWebhook(
      {
        id: "WH-1",
        event_type: "INVOICING.INVOICE.PAID",
        resource: {
          id: "INV2-1",
          status: "PAID",
          invoice_number: "INV-1042",
          amount: { currency_code: "USD", value: "435.00" },
        },
      },
      [],
    );
    expect(result).toMatchObject({
      action: "mark_paid",
      eventId: "WH-1",
      paypalInvoiceId: "INV2-1",
      invoiceRef: "INV-1042",
      amountCents: 43500,
    });
  });

  it("ignores a duplicate event id", () => {
    const event = {
      id: "WH-1",
      event_type: "INVOICING.INVOICE.PAID",
      resource: { id: "INV2-1", status: "PAID", detail: { invoice_number: "INV-1" } },
    };
    expect(interpretWebhook(event, ["WH-1"])).toMatchObject({
      action: "ignore",
      reason: "duplicate_event",
    });
  });

  it("records a partial payment when the paid amount is short of the total", () => {
    const result = interpretWebhook(
      {
        id: "WH-2",
        event_type: "INVOICING.INVOICE.UPDATED",
        resource: {
          id: "INV2-2",
          status: "PARTIALLY_PAID",
          detail: { invoice_number: "INV-9" },
          due_amount: { value: "100.00" },
          payments: { paid_amount: { currency_code: "USD", value: "40.00" } },
          amount: { value: "140.00" },
        },
      },
      [],
    );
    expect(result).toMatchObject({
      action: "record_partial",
      invoiceRef: "INV-9",
      amountCents: 4000,
      totalCents: 14000,
    });
  });

  it("marks viewed from an invoice viewed or updated event", () => {
    expect(
      interpretWebhook(
        {
          id: "WH-3",
          event_type: "INVOICING.INVOICE.UPDATED",
          resource: { id: "INV2-3", status: "VIEWED", detail: { invoice_number: "INV-3" } },
        },
        [],
      ),
    ).toMatchObject({ action: "mark_viewed", invoiceRef: "INV-3" });
  });

  it("flags a dispute and does not mark the invoice paid", () => {
    const result = interpretWebhook(
      {
        id: "WH-4",
        event_type: "CUSTOMER.DISPUTE.CREATED",
        resource: {
          dispute_id: "PP-D-1",
          disputed_transactions: [{ invoice_id: "INV-1042", seller_transaction_id: "TX-1" }],
        },
      },
      [],
    );
    expect(result).toMatchObject({
      action: "flag_dispute",
      invoiceRef: "INV-1042",
      eventId: "WH-4",
    });
  });

  it("reconciles a captured order back to the invoice custom id", () => {
    const result = interpretWebhook(
      {
        id: "WH-5",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-1",
          amount: { currency_code: "USD", value: "79.00" },
          custom_id: "INV-77",
          invoice_id: "INV-77",
          status: "COMPLETED",
        },
      },
      [],
    );
    expect(result).toMatchObject({
      action: "mark_paid",
      invoiceRef: "INV-77",
      amountCents: 7900,
    });
  });

  it("ignores unrelated event types", () => {
    expect(
      interpretWebhook({ id: "WH-6", event_type: "BILLING.PLAN.CREATED", resource: {} }, []).action,
    ).toBe("ignore");
  });

  it("treats a paid update with a full balance as paid", () => {
    const result = interpretWebhook(
      {
        id: "WH-7",
        event_type: "INVOICING.INVOICE.UPDATED",
        resource: {
          id: "INV2-7",
          status: "PAID",
          detail: { invoice_number: "INV-7" },
          amount: { value: "50.00" },
          payments: { paid_amount: { value: "50.00" } },
        },
      },
      [],
    );
    expect(result.action).toBe("mark_paid");
  });
});

describe("paidInFull", () => {
  it("compares integer cents", () => {
    expect(paidInFull(14000, 14000)).toBe(true);
    expect(paidInFull(4000, 14000)).toBe(false);
  });
});

describe("assertAmountLocked", () => {
  it("blocks amount edits once an invoice has been sent", () => {
    expect(assertAmountLocked("sent")).toEqual({
      ok: false,
      error: "Sent invoice amounts are locked. Create a new invoice to change a price or quantity.",
    });
    expect(assertAmountLocked("draft").ok).toBe(true);
    expect(assertAmountLocked("awaiting_approval").ok).toBe(true);
  });
});
