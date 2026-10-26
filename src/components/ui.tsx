import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = {
  primary: "bg-primary text-primary-foreground shadow-glow hover:brightness-105",
  secondary: "bg-muted text-foreground hover:bg-border-strong",
  outline: "border border-border bg-surface-raised/40 hover:border-border-strong hover:bg-muted",
  ghost: "bg-transparent hover:bg-muted",
  danger: "bg-danger text-ink hover:brightness-105",
  light: "bg-white text-ink shadow-card hover:bg-white/90",
  dark: "bg-ink text-white hover:bg-ink/85",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonVariants }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-[background-color,filter,transform,box-shadow] duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

const fieldBase =
  "w-full rounded-2xl border border-border bg-muted text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted-foreground hover:border-border-strong focus:border-primary/70 focus:bg-surface-raised focus:ring-4 focus:ring-primary/15";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-10 px-3.5", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-20 px-3.5 py-2.5", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-10 px-3 [&>option]:bg-surface-solid", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-medium", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string[] | string;
  children: React.ReactNode;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {message && <p className="mt-1 animate-fade text-xs text-danger">{message}</p>}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("glass rounded-3xl p-5 animate-rise", className)} {...props} />;
}

// Pastel tones from the design system; text on them is always the dark ink
export type Tone = "sand" | "coral" | "mint" | "sky" | "lilac";

export const toneClasses: Record<Tone, string> = {
  sand: "bg-sand text-ink",
  coral: "bg-coral text-ink",
  mint: "bg-mint text-ink",
  sky: "bg-sky text-ink",
  lilac: "bg-lilac text-ink",
};

// A pastel card, like the order tickets in the reference board
export function ToneCard({ tone, className, ...props }: ComponentProps<"div"> & { tone: Tone }) {
  return <div className={cn("rounded-3xl p-4 shadow-card", toneClasses[tone], className)} {...props} />;
}

const badgeTones = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-mint text-ink",
  warning: "bg-sand text-ink",
  danger: "bg-coral text-ink",
  primary: "bg-primary/15 text-primary",
  info: "bg-sky text-ink",
  dark: "bg-ink text-white",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

// Small coloured dot for a status, optionally pulsing for "live"
export function StatusDot({ className, live }: { className?: string; live?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full bg-current", live && "animate-ping-soft", className)}
    />
  );
}

// Headline number with an outlined icon, as in the reference header
export function Stat({
  icon: Icon,
  value,
  label,
  badge,
  className,
}: {
  icon: LucideIcon;
  value: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border-strong text-muted-foreground">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-2xl font-bold leading-tight">
          {value}
          {badge}
        </p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// Pill-shaped switch between views, e.g. بورد / فهرست
export function Segmented({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("inline-flex items-center gap-1 rounded-full bg-muted p-1", className)} {...props} />;
}

export function segmentClass(active: boolean) {
  return cn(
    "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200",
    active ? "bg-surface-raised text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
  );
}

// Filter chip with an optional count, coral when selected
export function chipClass(active: boolean) {
  return cn(
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors duration-200",
    active
      ? "border-transparent bg-primary text-primary-foreground shadow-glow"
      : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex animate-rise flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade rounded-3xl border border-dashed border-border-strong p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
