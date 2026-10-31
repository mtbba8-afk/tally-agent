import { describe, expect, it } from "vitest";
import { interpretWebhook } from "../../reconciliation/src/index";
import { MockPayPalGateway } from "./index";

describe("create, send, pay, reconcile", () => {
  it("runs the full collection loop on the mock gateway", async () => {
    const paypal = new MockPayPalGateway();
    const created = await paypal.createInvoice({
      invoiceNumber: "INV-2001",
      currency: "USD",
      note: "Drain clear",
      shop: {
        givenName: "Andre",
        surname: "Pell",
        email: "billing@harborline.example",
        businessName: "Harborline Plumbing",
      },
      recipient: { givenName: "Sam", surname: "Ibarra", email: "sam.ibarra@example.com" },
      items: [{ name: "Drain clear", description: "Kitchen", quantity: 1, unitPriceCents: 14000 }],
    });
    const sent = await paypal.sendInvoice(created.id);
    expect(sent.payUrl).toBeTruthy();

    const paid = paypal.simulatePayment(created.id, 14000);
    const result = interpretWebhook(paid, []);
    expect(result).toMatchObject({
      action: "mark_paid",
      invoiceRef: "INV-2001",
      paypalInvoiceId: created.id,
      amountCents: 14000,
    });

    const again = interpretWebhook(paid, [paid.id]);
    expect(again.action).toBe("ignore");
  });
});
