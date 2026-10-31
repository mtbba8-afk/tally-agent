import { describe, expect, it } from "vitest";
import { OWNER_ONLY_METHODS, STEWARD_METHOD_NAMES, assertLimitedAccessKey, buildStewardAccessKey } from "./access-key";
import { DEMO } from "./demo-copy";
import { readFixture } from "./fixture";
import { compileOwnerPolicy, type Policy, type Treasury } from "./policy";
import { applyAllowedPayouts, attestSteward, reviewInstruction } from "./steward";

type InstructionFixture = {
  policy: Policy;
  treasury: Treasury & { spentTodayCents: number };
  instructions: Array<{
    id: string;
    text: string;
    treasury?: Treasury & { spentTodayCents: number };
    expectCodes: string[];
  }>;
};

const fixture = readFixture<InstructionFixture>("adversarial-instructions.json");

describe("Steward instructions", () => {
  it("blocks all 20 adversarial instructions and signs none of them", () => {
    expect(fixture.instructions).toHaveLength(20);
    for (const item of fixture.instructions) {
      const treasury = item.treasury ?? fixture.treasury;
      const before = treasury.taxReserveCents;
      const review = reviewInstruction({
        text: item.text,
        policy: fixture.policy,
        treasury,
        spentTodayCents: treasury.spentTodayCents,
      });
      expect(review.signed, item.id).toBe(false);
      expect(review.payouts, item.id).toHaveLength(1);
      expect(review.payouts[0]?.decision.codes, item.id).toEqual(item.expectCodes);
      const applied = applyAllowedPayouts(treasury, treasury.spentTodayCents, review);
      expect(applied.treasury.taxReserveCents, item.id).toBe(before);
      expect(applied.spentTodayCents, item.id).toBe(treasury.spentTodayCents);
    }
  });

  it("signs a $12 Ferguson deposit only after the contract allows it", () => {
    const policy = compileOwnerPolicy(DEMO.policySentence);
    const review = reviewInstruction({
      text: DEMO.supplierDeposit,
      policy,
      treasury: { taxReserveCents: 4_687, ownerCents: 9_376, opsCents: 1_562 },
      spentTodayCents: 0,
    });
    expect(review.signed).toBe(true);
    expect(review.payouts[0]?.signature?.broadcast).toBe(false);
    expect(review.payouts[0]?.signature?.signerContract).toBe("v1.signer-prod.testnet");
    expect(review.payouts[0]?.request.address).toBe(policy.approvedSuppliers[0]?.address);
    const applied = applyAllowedPayouts(
      { taxReserveCents: 4_687, ownerCents: 9_376, opsCents: 1_562 },
      0,
      review,
    );
    expect(applied.treasury.opsCents).toBe(362);
    expect(applied.treasury.taxReserveCents).toBe(4_687);
  });

  it("does not treat a prompt injection as permission to change policy", () => {
    const policy = compileOwnerPolicy(DEMO.policySentence);
    const review = reviewInstruction({
      text: DEMO.attack,
      policy,
      treasury: { taxReserveCents: 4_687, ownerCents: 9_376, opsCents: 362 },
      spentTodayCents: 1_200,
    });
    expect(review.injectionSuspected).toBe(true);
    expect(review.signed).toBe(false);
    expect(review.payouts[0]?.decision.codes).toEqual([
      "PAYEE_NOT_APPROVED",
      "OVER_DAILY_CAP",
      "INSUFFICIENT_OPS",
    ]);
    expect(policy.dailyCapCents).toBe(20_000);
  });
});

describe("limited access key and Shade attestation", () => {
  it("limits the steward to tally-office methods and excludes policy changes and signing", () => {
    const key = buildStewardAccessKey(DEMO.contractAccount);
    assertLimitedAccessKey(key, DEMO.contractAccount);
    expect(key.permission.FunctionCall.method_names).toEqual([...STEWARD_METHOD_NAMES]);
    for (const method of OWNER_ONLY_METHODS) {
      expect(key.permission.FunctionCall.method_names).not.toContain(method);
    }
    expect(key.permission.FunctionCall.receiver_id).toBe(DEMO.contractAccount);
  });

  it("refuses to claim a TEE without a measurement", () => {
    expect(attestSteward({}).mode).toBe("mock");
    expect(() => attestSteward({ SHADE_AGENT_MODE: "tee" })).toThrow(/MEASUREMENT/);
  });
});
