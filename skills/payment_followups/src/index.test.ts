import { describe, expect, it } from "vitest";
import { composeReminder, dueReminderStage, selectDueInvoices } from "./index";

const sentAt = new Date("2026-10-01T15:00:00.000Z");

function at(iso: string): Date {
  return new Date(iso);
}

describe("dueReminderStage", () => {
  it("waits until day 3", () => {
    expect(
      dueReminderStage({
        sentAt,
        now: at("2026-10-03T15:00:00.000Z"),
        sentStages: [],
        status: "sent",
      }),
    ).toBeNull();
  });

  it("selects day 3, then 7, then 14 without repeating", () => {
    expect(
      dueReminderStage({
        sentAt,
        now: at("2026-10-04T15:00:00.000Z"),
        sentStages: [],
        status: "sent",
      }),
    ).toBe(3);

    expect(
      dueReminderStage({
        sentAt,
        now: at("2026-10-08T15:00:00.000Z"),
        sentStages: [3],
        status: "viewed",
      }),
    ).toBe(7);

    expect(
      dueReminderStage({
        sentAt,
        now: at("2026-10-15T16:00:00.000Z"),
        sentStages: [3, 7],
        status: "sent",
      }),
    ).toBe(14);

    expect(
      dueReminderStage({
        sentAt,
        now: at("2026-10-20T16:00:00.000Z"),
        sentStages: [3, 7, 14],
        status: "sent",
      }),
    ).toBeNull();
  });

  it("skips paid, draft, void, and disputed invoices", () => {
    for (const status of ["paid", "draft", "void", "disputed", "awaiting_approval"] as const) {
      expect(
        dueReminderStage({
          sentAt,
          now: at("2026-10-20T16:00:00.000Z"),
          sentStages: [],
          status,
        }),
      ).toBeNull();
    }
  });

  it("does not skip ahead: a late first run still sends day 3 before day 7", () => {
    expect(
      dueReminderStage({
        sentAt,
        now: at("2026-10-20T16:00:00.000Z"),
        sentStages: [],
        status: "sent",
      }),
    ).toBe(3);
  });
});

describe("composeReminder", () => {
  const base = {
    shopName: "Northline Mechanical",
    customerFirstName: "Elena",
    invoiceNumber: "INV-1042",
    amountCents: 43500,
    payUrl: "https://www.sandbox.paypal.com/invoice/p/INV2-1",
  };

  it("keeps day 3 polite and free of a Pay Later pitch", () => {
    const message = composeReminder({ ...base, stage: 3 });
    expect(message.offerPayLater).toBe(false);
    expect(message.subject).toContain("INV-1042");
    expect(message.body).toContain("Elena");
    expect(message.body).toContain("$435.00");
    expect(message.body).toContain(base.payUrl);
    expect(message.body.toLowerCase()).not.toContain("pay later");
    expect(message.body.includes("—")).toBe(false);
    expect(message.subject.includes("—")).toBe(false);
  });

  it("offers Pay Later on day 7 and is firmer on day 14", () => {
    const day7 = composeReminder({ ...base, stage: 7 });
    const day14 = composeReminder({ ...base, stage: 14 });
    expect(day7.offerPayLater).toBe(true);
    expect(day7.body.toLowerCase()).toContain("pay later");
    expect(day14.offerPayLater).toBe(true);
    expect(day14.body.toLowerCase()).toContain("14 days");
    expect(day14.body.includes("—")).toBe(false);
  });
});

describe("selectDueInvoices", () => {
  it("returns one stage per open invoice", () => {
    const due = selectDueInvoices(
      [
        {
          id: "a",
          status: "sent",
          sentAt: "2026-10-01T15:00:00.000Z",
          remindersSent: [],
        },
        {
          id: "b",
          status: "paid",
          sentAt: "2026-10-01T15:00:00.000Z",
          remindersSent: [],
        },
        {
          id: "c",
          status: "partial",
          sentAt: "2026-09-01T15:00:00.000Z",
          remindersSent: [3, 7],
        },
      ],
      at("2026-10-16T15:00:00.000Z"),
    );
    expect(due).toEqual([
      { id: "a", stage: 3 },
      { id: "c", stage: 14 },
    ]);
  });
});
