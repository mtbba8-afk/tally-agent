import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/lib/types";

const labels: Record<InvoiceStatus, string> = {
  draft: "Draft",
  awaiting_approval: "Needs approval",
  sent: "Sent",
  viewed: "Viewed",
  partial: "Partial",
  paid: "Paid",
  void: "Void",
  disputed: "Disputed",
};

export function StatusPill({ status }: { status: InvoiceStatus }) {
  const tone =
    status === "paid" ? "paid" : status === "disputed" || status === "void" ? "danger" : status === "awaiting_approval" || status === "partial" ? "warn" : status === "viewed" ? "info" : "neutral";
  return <Badge tone={tone}>{labels[status]}</Badge>;
}
