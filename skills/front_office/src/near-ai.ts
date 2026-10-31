import { normalizeVoiceNote } from "./ledger";

export const NEAR_AI_BASE_URL = "https://cloud-api.near.ai/v1";
export const NEAR_AI_DEFAULT_MODEL = "zai-org/GLM-5.1-FP8";

const SYSTEM_PROMPT = [
  "You structure a trade technician's voice note for an invoicing ledger.",
  "Return JSON only: {\"note\":\"...\"}.",
  "Keep the work that was done. Convert minutes to hours if you mention duration.",
  "Do not invent prices, totals, or parts that were not spoken.",
  "Do not add customer addresses or phone numbers.",
].join(" ");

export type InferenceResult = {
  normalizedNote: string;
  source: "local" | "near-ai-cloud";
  model: string | null;
};

export async function structureVoiceNote(
  note: string,
  options?: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
  },
): Promise<InferenceResult> {
  const env = options?.env ?? {};
  const local = { normalizedNote: normalizeVoiceNote(note), source: "local" as const, model: null };
  if (env.NEAR_AI_MODE !== "cloud" || !env.NEAR_AI_API_KEY) return local;

  const model = env.NEAR_AI_MODEL || NEAR_AI_DEFAULT_MODEL;
  const fetchImpl = options?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${NEAR_AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NEAR_AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: note },
        ],
      }),
    });
    if (!response.ok) return local;
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as { note?: string };
    if (!parsed.note?.trim()) return local;
    return {
      normalizedNote: normalizeVoiceNote(parsed.note),
      source: "near-ai-cloud",
      model,
    };
  } catch {
    return local;
  }
}
