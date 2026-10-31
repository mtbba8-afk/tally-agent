import { describe, expect, it } from "vitest";
import { readFixture } from "./fixture";
import {
  compileOwnerPolicy,
  creditPayment,
  evaluatePayout,
  splitRevenue,
  type Policy,
  type Treasury,
} from "./policy";

type TreasuryFixture = Treasury & { spentTodayCents: number };
type PolicyFixture = {
  policy: Policy;
  treasury: TreasuryFixture;
  cases: Array<{
    id: string;
    payeeId: string;
    chain: string;
    address: string;
    amountCents: number;
    treasury?: TreasuryFixture;
    expectCodes: string[];
  }>;
};

const fixture = readFixture<PolicyFixture>("policy-cases.json");
const splits = readFixture<
  Array<{
    amountCents: number;
    taxReserveBps: number;
    ownerBps: number;
    opsBps: number;
    taxReserveCents: number;
    ownerCents: number;
    opsCents: number;
  }>
>("split-vectors.json");

describe("evaluatePayout", () => {
  it("blocks all 20 structured adversarial payouts with the shared reason codes", () => {
    expect(fixture.cases).toHaveLength(20);
    for (const item of fixture.cases) {
      const treasury = item.treasury ?? fixture.treasury;
      const decision = evaluatePayout({
        policy: fixture.policy,
        spentTodayCents: treasury.spentTodayCents,
        opsCents: treasury.opsCents,
        request: item,
      });
      expect(decision.allowed, item.id).toBe(false);
      expect(decision.codes, item.id).toEqual(item.expectCodes);
      expect(decision.reasons, item.id).toHaveLength(item.expectCodes.length);
    }
  });

  it("allows a supplier payment inside the cap and the operations balance", () => {
    const decision = evaluatePayout({
      policy: fixture.policy,
      spentTodayCents: 0,
      opsCents: 5_000,
      request: {
        payeeId: "Ferguson",
        chain: "Base",
        address: "0x1111111111111111111111111111111111111111",
        amountCents: 1_200,
      },
    });
    expect(decision.allowed).toBe(true);
    expect(decision.codes).toEqual([]);
  });
});

describe("splitRevenue", () => {
  it("matches the shared vectors and does not drop cents", () => {
    for (const vector of splits) {
      const split = splitRevenue(vector.amountCents, vector);
      expect(split.taxReserveCents).toBe(vector.taxReserveCents);
      expect(split.ownerCents).toBe(vector.ownerCents);
      expect(split.opsCents).toBe(vector.opsCents);
      expect(split.taxReserveCents + split.ownerCents + split.opsCents).toBe(vector.amountCents);
    }
  });

  it("credits a payment without letting operations spend the tax reserve", () => {
    const treasury = creditPayment({ taxReserveCents: 0, ownerCents: 0, opsCents: 0 }, 15_625, fixture.policy);
    expect(treasury.taxReserveCents).toBe(4_687);
    const attack = evaluatePayout({
      policy: fixture.policy,
      spentTodayCents: 0,
      opsCents: treasury.opsCents,
      request: {
        payeeId: "attacker.near",
        chain: "base",
        address: "0x000000000000000000000000000000000000dead",
        amountCents: 500_000,
      },
    });
    expect(attack.allowed).toBe(false);
    expect(treasury.taxReserveCents).toBe(4_687);
  });
});

describe("compileOwnerPolicy", () => {
  it("compiles the owner's sentence into a cap, Ferguson, and a 30% tax reserve", () => {
    const policy = compileOwnerPolicy("Max $200 a day, only pay Ferguson, keep 30% for taxes.");
    expect(policy.dailyCapCents).toBe(20_000);
    expect(policy.taxReserveBps).toBe(3_000);
    expect(policy.ownerBps).toBe(6_000);
    expect(policy.opsBps).toBe(1_000);
    expect(policy.approvedSuppliers.map((supplier) => supplier.id)).toEqual(["ferguson"]);
  });
});
