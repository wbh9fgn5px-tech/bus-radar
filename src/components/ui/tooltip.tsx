"use client";
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tip({ label, children, side = "left" }: { label: React.ReactNode; children: React.ReactNode; side?: "left" | "right" | "top" | "bottom" }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className={cn("z-50 rounded-lg bg-night px-2.5 py-1.5 text-xs text-offwhite shadow-pop animate-fade-in dark:bg-offwhite dark:text-night")}
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
