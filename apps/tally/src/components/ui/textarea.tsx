import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-28 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
