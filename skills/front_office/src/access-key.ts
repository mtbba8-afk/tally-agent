export const STEWARD_METHOD_NAMES = [
  "create_invoice",
  "mark_invoice_paid",
  "request_payout",
  "preview_payout",
  "get_invoice",
  "get_policy",
  "get_treasury",
  "get_audit",
] as const;

export const OWNER_ONLY_METHODS = ["set_policy", "set_steward", "withdraw_owner", "withdraw_tax"] as const;

export const SIGNER_CONTRACT_TESTNET = "v1.signer-prod.testnet";

export type FunctionCallAccessKey = {
  permission: {
    FunctionCall: {
      allowance: string;
      receiver_id: string;
      method_names: string[];
    };
  };
};

export function buildStewardAccessKey(contractId: string): FunctionCallAccessKey {
  return {
    permission: {
      FunctionCall: {
        allowance: "250000000000000000000000",
        receiver_id: contractId,
        method_names: [...STEWARD_METHOD_NAMES],
      },
    },
  };
}

export function accessKeyAllows(key: FunctionCallAccessKey, method: string): boolean {
  return key.permission.FunctionCall.method_names.includes(method);
}

export function assertLimitedAccessKey(key: FunctionCallAccessKey, contractId: string): void {
  const permission = key.permission.FunctionCall;
  if (permission.receiver_id !== contractId) {
    throw new Error("Steward key must be limited to the tally-office contract.");
  }
  if (permission.method_names.length === 0) {
    throw new Error("An empty method list would allow every method. Refusing.");
  }
  for (const method of OWNER_ONLY_METHODS) {
    if (permission.method_names.includes(method)) {
      throw new Error(`Steward key must not include ${method}.`);
    }
  }
  if (permission.method_names.includes("sign") || permission.method_names.includes("add_key")) {
    throw new Error("Steward key must not call the chain-signature signer or add keys.");
  }
}
