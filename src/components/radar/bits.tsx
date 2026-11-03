"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUS_META, readableOn } from "@/lib/client/format";
import type { SourceStatus } from "@/lib/types";

export function StatusDot({ status, className }: { status: SourceStatus; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_META[status].dot, status === "live" && "animate-pulse-ring", className)}
      aria-hidden
    />
  );
}

export function StatusPill({ status, children }: { status: SourceStatus; children?: ReactNode }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium", m.text)}>
      <StatusDot status={status} className="size-1.5" />
      {children ?? m.label}
    </span>
  );
}

export function RouteBadge({ name, color, textColor, className }: { name?: string; color?: string; textColor?: string; className?: string }) {
  if (!name) return null;
  const bg = color ? `#${color}` : "#3478F6";
  const fg = textColor && textColor !== color ? `#${textColor}` : readableOn(color ?? "3478F6");
  return (
    <span
      className={cn("inline-flex h-5 min-w-6 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-bold leading-none tabular-nums", className)}
      style={{ background: bg, color: fg, boxShadow: color && /^F{6}$/i.test(color) ? "inset 0 0 0 1px #E3E8F0" : undefined }}
    >
      {name}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="grid size-10 place-items-center rounded-full bg-surface-2 text-fg-subtle [&_svg]:size-5">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <p className="text-xs leading-relaxed text-fg-muted">{children}</p>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-fg" title={hint}>
        {children}
      </dd>
    </div>
  );
}

export const NA = () => <span className="font-normal text-fg-subtle">Non fourni par la source</span>;
