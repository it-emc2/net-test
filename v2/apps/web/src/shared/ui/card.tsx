import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("grid gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm", className)} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("m-0", className)} {...props} />;
}
