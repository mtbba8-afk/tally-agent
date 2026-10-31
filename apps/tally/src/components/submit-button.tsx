"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingLabel = "Working...",
  variant = "default",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "default" | "outline" | "ghost" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
