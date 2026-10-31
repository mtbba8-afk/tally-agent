import { describe, expect, it } from "vitest";
import { applyCustomerUtterance, emptySlots, runSampleCall, SAMPLE_CUSTOMER_LINES } from "./index";

describe("voice intake", () => {
  it("books the recorded HVAC call through the same slot path", () => {
    const result = runSampleCall("Northline Mechanical");
    expect(SAMPLE_CUSTOMER_LINES).toHaveLength(3);
    expect(result.complete).toBe(true);
    expect(result.slots.customerName).toBe("Dana Ruiz");
    expect(result.slots.address).toBe("418 Bergen Street");
    expect(result.slots.phone).toBe("718-555-0148");
    expect(result.slots.windowLabel).toBe("tomorrow morning");
    expect(result.slots.symptom?.toLowerCase()).toContain("warm air");
    expect(result.turns.some((turn) => turn.text.includes("—"))).toBe(false);
    expect(result.turns.at(-1)?.text).toContain("You are booked");
  });

  it("asks for the missing slot instead of inventing one", () => {
    const first = applyCustomerUtterance(emptySlots(), "This is Luis Ortega.", "Northline Mechanical");
    expect(first.complete).toBe(false);
    expect(first.say).toContain("What is going on");
    const second = applyCustomerUtterance(first.slots, "The heat is out.", "Northline Mechanical");
    expect(second.complete).toBe(false);
    expect(second.slots.symptom?.toLowerCase()).toContain("heat");
    expect(second.say).toContain("address");
  });

  it("can finish in one utterance when every slot is present", () => {
    const result = applyCustomerUtterance(
      emptySlots(),
      "This is Dana Ruiz. The AC at 418 Bergen Street is blowing warm air. Tomorrow morning works. Call 718-555-0148.",
      "Northline Mechanical",
    );
    expect(result.complete).toBe(true);
    expect(result.slots.customerName).toBe("Dana Ruiz");
  });
});
