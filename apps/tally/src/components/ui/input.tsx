import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-xl border border-line bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
