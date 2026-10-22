import type * as React from "react";
import { cn } from "~/lib/utils";

// shadcn "label" primitive.
export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("flex items-center gap-2 text-sm font-medium leading-none select-none", className)}
      {...props}
    />
  );
}
