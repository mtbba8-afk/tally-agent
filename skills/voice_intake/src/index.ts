export type CallSpeaker = "customer" | "agent";

export type CallTurn = {
  speaker: CallSpeaker;
  text: string;
};

export type BookingSlots = {
  customerName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  symptom: string | null;
  windowLabel: string | null;
};

export type ReceptionistReply = {
  say: string;
  complete: boolean;
};

const NAME_STOP = new Set(["and", "the", "my", "at", "from", "calling", "with", "on"]);

const SYMPTOM =
  /\b(a\/?c|air(?:\s+condition\w*)?|heat(?:ing)?|furnace|cool(?:ing)?|warm air|condenser|thermostat|no heat|not cooling|blowing|capacitor|filter)\b/i;

const ADDRESS =
  /\b(\d{1,6}\s+(?:[a-z0-9.'-]+\s+){0,4}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|place|pl|court|ct))\b/i;

const WINDOW =
  /\b(tomorrow(?:\s+(?:morning|afternoon|evening))?|today(?:\s+(?:morning|afternoon|evening))?|this\s+(?:morning|afternoon|evening)|next\s+week|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening)|\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)\b/i;

const PHONE = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/;

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export const SAMPLE_CUSTOMER_LINES = [
  "Hi, this is Dana Ruiz. The AC at 418 Bergen Street is blowing warm air.",
  "Tomorrow morning works for me.",
  "You can reach me at 718-555-0148.",
];

export const SAMPLE_TECH_NOTE = "Replaced capacitor, 1.5 hrs, unit RT";

export function emptySlots(): BookingSlots {
  return {
    customerName: null,
    phone: null,
    email: null,
    address: null,
    symptom: null,
    windowLabel: null,
  };
}

export function openingLine(shopName: string): string {
  return `${shopName}, this is Tally. I can book a visit. Who am I speaking with, and what is going on?`;
}

export function extractSlots(text: string, prior: BookingSlots): BookingSlots {
  const next: BookingSlots = { ...prior };
  const name = grabName(text);
  const phone = grabPhone(text);
  const email = text.match(EMAIL)?.[0] ?? null;
  const address = text.match(ADDRESS)?.[1] ?? null;
  const windowLabel = text.match(WINDOW)?.[1] ?? null;
  const symptom = grabSymptom(text);
  if (!next.customerName && name) next.customerName = name;
  if (!next.phone && phone) next.phone = phone;
  if (!next.email && email) next.email = email.toLowerCase();
  if (!next.address && address) next.address = cleanSpace(address);
  if (!next.windowLabel && windowLabel) next.windowLabel = windowLabel.toLowerCase();
  if (!next.symptom && symptom) next.symptom = symptom;
  return next;
}

export function receptionistReply(slots: BookingSlots, shopName: string): ReceptionistReply {
  const first = firstName(slots.customerName);
  if (!slots.customerName) {
    return { say: `${shopName}, this is Tally. Who am I speaking with?`, complete: false };
  }
  if (!slots.symptom) {
    return { say: `Thanks ${first}. What is going on with the system?`, complete: false };
  }
  if (!slots.address) {
    return { say: "What is the service address?", complete: false };
  }
  if (!slots.windowLabel) {
    return { say: "What day and time should we come by?", complete: false };
  }
  if (!slots.phone) {
    return { say: "What number should the tech call if they are running late?", complete: false };
  }
  return {
    say: `You are booked, ${first}. We will be at ${slots.address} ${slots.windowLabel} for this: ${slots.symptom} The owner gets a text when the tech's note is priced from the book.`,
    complete: true,
  };
}

export function applyCustomerUtterance(slots: BookingSlots, text: string, shopName: string): ReceptionistReply & { slots: BookingSlots } {
  const next = extractSlots(text, slots);
  return { slots: next, ...receptionistReply(next, shopName) };
}

export function runSampleCall(shopName: string): { turns: CallTurn[]; slots: BookingSlots; complete: boolean } {
  let slots = emptySlots();
  const turns: CallTurn[] = [{ speaker: "agent", text: openingLine(shopName) }];
  let complete = false;
  for (const line of SAMPLE_CUSTOMER_LINES) {
    turns.push({ speaker: "customer", text: line });
    const next = applyCustomerUtterance(slots, line, shopName);
    slots = next.slots;
    complete = next.complete;
    turns.push({ speaker: "agent", text: next.say });
  }
  return { turns, slots, complete };
}

export function customerEmail(slots: BookingSlots): string {
  if (slots.email) return slots.email;
  const slug = (slots.customerName ?? "customer")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return `${slug || "customer"}@example.com`;
}

export function bookingNote(slots: BookingSlots): string {
  const symptom = (slots.symptom ?? "service call").replace(/[.!\s]+$/g, "");
  const address = slots.address?.replace(/[.!\s]+$/g, "");
  const windowLabel = slots.windowLabel?.replace(/[.!\s]+$/g, "");
  return [`Symptom: ${symptom}.`, address ? `Address: ${address}.` : "", windowLabel ? `Window: ${windowLabel}.` : ""].filter(Boolean).join(" ");
}

function grabName(text: string): string | null {
  const match = text.match(/(?:this is|i am|i'm|my name is)\s+([a-z]+(?:\s+[a-z]+){0,2})/i);
  if (!match?.[1]) return null;
  const words = match[1]
    .split(/\s+/)
    .filter((word) => !NAME_STOP.has(word.toLowerCase()))
    .slice(0, 3);
  if (words.length === 0) return null;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

function grabPhone(text: string): string | null {
  const match = text.match(PHONE);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function grabSymptom(text: string): string | null {
  if (!SYMPTOM.test(text)) return null;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const hit = sentences.find((sentence) => SYMPTOM.test(sentence)) ?? text;
  return cleanSpace(hit).slice(0, 180);
}

function firstName(name: string | null): string {
  return name?.split(/\s+/)[0] || "there";
}

function cleanSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
