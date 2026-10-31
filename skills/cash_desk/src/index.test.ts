import { describe, expect, it } from "vitest";
import { buildReceivables, cashForecast, draftDisputeResponse, payLaterMessage } from "./index";

const now = new Date("2026-10-31T15:00:00.000Z");

describe("cash desk", () => {
  it("ages receivables and picks who to call", () => {
    const rows = buildReceivables(
      [
        {
          invoiceId: "inv_a",
          number: "INV-1",
          customer: "Elena Voss",
          status: "sent",
          sentAt: "2026-10-21T15:00:00.000Z",
          balanceCents: 43500,
          remindersSent: [3],
        },
        {
          invoiceId: "inv_b",
          number: "INV-2",
          customer: "Noah Patel",
          status: "viewed",
          sentAt: "2026-10-30T15:00:00.000Z",
          balanceCents: 8900,
          remindersSent: [],
        },
        {
          invoiceId: "inv_c",
          number: "INV-3",
          customer: "Maya Chen",
          status: "disputed",
          sentAt: "2026-10-01T15:00:00.000Z",
          balanceCents: 31000,
          remindersSent: [3, 7],
        },
      ],
      now,
    );
    const elena = rows.find((row) => row.number === "INV-1");
    expect(elena?.bucket).toBe("8-14");
    expect(elena?.callToday).toBe(true);
    const forecast = cashForecast(rows);
    expect(forecast.callList.map((row) => row.number)).toContain("INV-1");
    expect(forecast.callList.some((row) => row.status === "disputed")).toBe(false);
    expect(forecast.next14Cents).toBeGreaterThan(0);
    expect(forecast.next30Cents).toBeGreaterThanOrEqual(forecast.next14Cents);
  });

  it("offers Pay Later only inside the usual Pay in 4 band", () => {
    expect(payLaterMessage(2000)).toBeNull();
    expect(payLaterMessage(37250)).toContain("Pay in 4");
    expect(payLaterMessage(200000)).toBeNull();
  });

  it("drafts a dispute response from the job note and the price book", () => {
    const packet = draftDisputeResponse({
      invoiceNumber: "INV-1008",
      customerName: "Maya Chen",
      jobNote: "Replaced capacitor, 1 hr, rooftop unit",
      lines: [{ name: "Run capacitor", quantity: 1, amountCents: 18500 }],
      callSummary: "Booked for a warm-air call.",
      reason: "Item not as described",
    });
    expect(packet.narrative).toContain("price book");
    expect(packet.narrative).toContain("Maya Chen");
    expect(packet.narrative).not.toContain("—");
    expect(packet.evidence.some((line) => line.includes("Run capacitor"))).toBe(true);
    expect(packet.evidence.some((line) => line.includes("Photos"))).toBe(true);
  });
});
