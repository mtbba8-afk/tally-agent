import type { DraftConfidence, DraftLine, Trade } from "@tounkara/invoice-drafting";
import type { ReminderStage } from "@tounkara/payment-followups";
import type { BookingSlots } from "@tounkara/voice-intake";

export type InvoiceStatus =
  | "draft"
  | "awaiting_approval"
  | "sent"
  | "viewed"
  | "partial"
  | "paid"
  | "void"
  | "disputed";

export type Shop = {
  id: string;
  name: string;
  trade: Trade;
  city: string;
  ownerGivenName: string;
  ownerSurname: string;
  email: string;
  autoSendThresholdCents: number;
  simulatedNow: string | null;
};

export type Customer = {
  id: string;
  shopId: string;
  name: string;
  email: string;
  phone: string;
};

export type Job = {
  id: string;
  shopId: string;
  customerId: string;
  trade: Trade;
  notes: string;
  status: "open" | "done" | "invoiced";
  completedAt: string | null;
};

export type Invoice = {
  id: string;
  shopId: string;
  jobId: string;
  customerId: string;
  number: string;
  status: InvoiceStatus;
  lines: DraftLine[];
  subtotalCents: number;
  paidCents: number;
  confidence: DraftConfidence;
  note: string;
  customerNote: string;
  sendError: string | null;
  paypalInvoiceId: string | null;
  paypalOrderId: string | null;
  payUrl: string | null;
  gatewayMode: "mock" | "sandbox";
  sentAt: string | null;
  paidAt: string | null;
  remindersSent: ReminderStage[];
};

export type AgentLogEntry = {
  id: string;
  shopId: string;
  at: string;
  actor: "agent" | "owner" | "paypal" | "system";
  action: string;
  detail: string;
  invoiceId: string | null;
  jobId: string | null;
};

export type PayPalEventRecord = {
  id: string;
  receivedAt: string;
  eventType: string;
  payload: unknown;
};

export type StoredTurn = {
  speaker: "customer" | "agent";
  text: string;
  at: string;
};

export type ServiceCall = {
  id: string;
  shopId: string;
  customerId: string | null;
  jobId: string | null;
  invoiceId: string | null;
  source: "live" | "transcript" | "mcp";
  status: "in_progress" | "booked" | "noted";
  turns: StoredTurn[];
  slots: BookingSlots;
  startedAt: string;
  bookedAt: string | null;
};

export type OwnerMessage = {
  id: string;
  shopId: string;
  invoiceId: string | null;
  callId: string | null;
  direction: "out" | "in";
  body: string;
  token: string | null;
  at: string;
  status: "desk" | "sent";
};

export type DisputePacket = {
  id: string;
  shopId: string;
  invoiceId: string;
  paypalDisputeId: string | null;
  reason: string;
  status: "awaiting_approval" | "approved";
  narrative: string;
  evidence: string[];
  createdAt: string;
  approvedAt: string | null;
  submitNote: string | null;
};

export type LedgerData = {
  shops: Shop[];
  customers: Customer[];
  jobs: Job[];
  invoices: Invoice[];
  logs: AgentLogEntry[];
  events: PayPalEventRecord[];
  calls: ServiceCall[];
  messages: OwnerMessage[];
  disputes: DisputePacket[];
};

export type RuntimeMode = {
  paypal: "mock" | "sandbox";
  ai: "gateway" | "price_book";
  store: "file" | "supabase";
};
