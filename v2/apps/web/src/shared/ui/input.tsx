import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-12 w-full rounded-lg border-2 border-input bg-card px-3.5 text-foreground placeholder:text-muted-foreground",
        "aria-[invalid=true]:border-destructive disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("font-semibold", className)} {...props} />;
}
