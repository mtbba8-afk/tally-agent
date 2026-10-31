import { describe, expect, it, vi } from "vitest";
import {
  MockPayPalGateway,
  SandboxPayPalGateway,
  buildCreateInvoiceBody,
  buildCreateOrderBody,
  buildReminderBody,
  extractInvoiceId,
  extractPayUrl,
  moneyValue,
} from "./index";

const invoiceInput = {
  invoiceNumber: "INV-1042",
  currency: "USD" as const,
  note: "Unit 3B capacitor and labor",
  shop: {
    givenName: "Marisol",
    surname: "Vega",
    email: "billing@northline.example",
    businessName: "Northline Mechanical",
  },
  recipient: {
    givenName: "Elena",
    surname: "Voss",
    email: "elena.voss@example.com",
  },
  items: [
    { name: "Run capacitor", description: "Unit 3B", quantity: 1, unitPriceCents: 18500 },
    { name: "HVAC labor", description: "On site", quantity: 2, unitPriceCents: 12500 },
  ],
};

describe("PayPal request builders", () => {
  it("builds an Invoicing v2 draft with cent-accurate amounts", () => {
    const body = buildCreateInvoiceBody(invoiceInput);
    expect(body.detail.invoice_number).toBe("INV-1042");
    expect(body.detail.currency_code).toBe("USD");
    expect(body.items).toHaveLength(2);
    expect(body.items[0]?.unit_amount).toEqual({ currency_code: "USD", value: "185.00" });
    expect(body.items[1]?.quantity).toBe("2");
    expect(body.primary_recipients[0]?.billing_info.email_address).toBe("elena.voss@example.com");
    expect(body.invoicer.business_name).toBe("Northline Mechanical");
  });

  it("builds an Orders v2 capture request that references the invoice", () => {
    const body = buildCreateOrderBody({
      invoiceNumber: "INV-1042",
      currency: "USD",
      amountCents: 43500,
      description: "Invoice INV-1042",
      returnUrl: "https://tally.example/pay/return",
      cancelUrl: "https://tally.example/pay/cancel",
    });
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0]).toMatchObject({
      reference_id: "INV-1042",
      custom_id: "INV-1042",
      amount: { currency_code: "USD", value: "435.00" },
    });
  });

  it("formats reminder calls for the remind endpoint", () => {
    expect(
      buildReminderBody({
        subject: "Invoice INV-1042 is still open",
        note: "Friendly nudge",
      }),
    ).toEqual({
      subject: "Invoice INV-1042 is still open",
      note: "Friendly nudge",
      send_to_invoicer: false,
      send_to_recipient: true,
    });
  });

  it("reads an invoice id from a PayPal href", () => {
    expect(
      extractInvoiceId({
        href: "https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-ABCD-EFGH-IJKL-MNOP",
      }),
    ).toBe("INV2-ABCD-EFGH-IJKL-MNOP");
    expect(extractInvoiceId({ id: "INV2-RAW" })).toBe("INV2-RAW");
  });

  it("prefers the payer-view link", () => {
    expect(
      extractPayUrl([
        { href: "https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-1", rel: "self" },
        { href: "https://www.sandbox.paypal.com/invoice/payerView/details/INV2-1", rel: "payer-view" },
      ]),
    ).toBe("https://www.sandbox.paypal.com/invoice/payerView/details/INV2-1");
  });

  it("turns cents into PayPal decimal strings", () => {
    expect(moneyValue(18500)).toBe("185.00");
    expect(moneyValue(20250)).toBe("202.50");
    expect(moneyValue(5)).toBe("0.05");
  });
});

describe("MockPayPalGateway", () => {
  it("creates, sends, and reminds without calling the network", async () => {
    const gateway = new MockPayPalGateway();
    const created = await gateway.createInvoice(invoiceInput);
    expect(created.id).toMatch(/^INV2-MOCK-/);
    expect(created.status).toBe("DRAFT");

    const sent = await gateway.sendInvoice(created.id);
    expect(sent.status).toBe("SENT");
    expect(sent.payUrl).toContain(created.id);

    const reminded = await gateway.remindInvoice(created.id, {
      subject: "Still open",
      note: "Day 3",
    });
    expect(reminded.reminded).toBe(true);
    expect(gateway.calls.map((call) => call.op)).toEqual(["createInvoice", "sendInvoice", "remindInvoice"]);
  });

  it("creates an order with an approve link", async () => {
    const gateway = new MockPayPalGateway();
    const order = await gateway.createOrder({
      invoiceNumber: "INV-9",
      currency: "USD",
      amountCents: 5000,
      description: "Invoice INV-9",
      returnUrl: "https://tally.example/return",
      cancelUrl: "https://tally.example/cancel",
    });
    expect(order.id).toMatch(/^ORDER-MOCK-/);
    expect(order.approveUrl).toContain(order.id);
  });
});

describe("SandboxPayPalGateway", () => {
  it("gets a token, creates a draft, sends it, and returns the payer link", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "sandbox-token", expires_in: 300 }), {
          status: 200,
        });
      }
      if (String(url).endsWith("/v2/invoicing/invoices") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.detail.invoice_number).toBe("INV-1042");
        expect(init.headers).toMatchObject({ Authorization: "Bearer sandbox-token" });
        return new Response(null, {
          status: 201,
          headers: {
            "Content-Type": "application/json",
            Location: "https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-LIVE-1",
          },
        });
      }
      if (String(url).endsWith("/v2/invoicing/invoices/INV2-LIVE-1/send")) {
        return new Response(
          JSON.stringify({
            links: [
              {
                href: "https://www.sandbox.paypal.com/invoice/payerView/details/INV2-LIVE-1",
                rel: "payer-view",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (String(url).endsWith("/v2/invoicing/invoices/INV2-LIVE-1/remind")) {
        const body = JSON.parse(String(init?.body));
        expect(body.note).toBe("Day 7");
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (String(url).endsWith("/v2/checkout/orders")) {
        return new Response(
          JSON.stringify({
            id: "ORDER-1",
            status: "CREATED",
            links: [{ href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1", rel: "approve" }],
          }),
          { status: 201 },
        );
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    });

    const gateway = new SandboxPayPalGateway({
      clientId: "client",
      clientSecret: "secret",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const created = await gateway.createInvoice(invoiceInput);
    expect(created.id).toBe("INV2-LIVE-1");
    const sent = await gateway.sendInvoice(created.id);
    expect(sent.payUrl).toContain("payerView");
    await gateway.remindInvoice(created.id, { subject: "Open", note: "Day 7" });
    const order = await gateway.createOrder({
      invoiceNumber: "INV-1042",
      currency: "USD",
      amountCents: 43500,
      description: "Invoice INV-1042",
      returnUrl: "https://tally.example/return",
      cancelUrl: "https://tally.example/cancel",
    });
    expect(order.approveUrl).toContain("ORDER-1");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("surfaces a PayPal error without throwing away the status", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 60 }), { status: 200 });
      }
      return new Response(JSON.stringify({ name: "INVALID_REQUEST", message: "bad item" }), {
        status: 400,
      });
    });
    const gateway = new SandboxPayPalGateway({
      clientId: "client",
      clientSecret: "secret",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(gateway.createInvoice(invoiceInput)).rejects.toThrow(/INVALID_REQUEST/);
  });
});
