import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "border-line bg-[#f3ecdf] text-foreground",
        warn: "border-transparent bg-[#f4e2cc] text-warn",
        paid: "border-transparent bg-[#dcecde] text-paid",
        danger: "border-transparent bg-[#f6dcdc] text-danger",
        info: "border-transparent bg-[#d9e7e4] text-accent",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
