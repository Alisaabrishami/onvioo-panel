import { cn } from "@/lib/utils";

// The coral "O" mark with an optional wordmark beside it
export function Logo({ label, size = "md", className }: { label?: React.ReactNode; size?: "md" | "lg"; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 font-bold", className)}>
      <span
        className={cn(
          "flex items-center justify-center bg-primary font-black text-primary-foreground shadow-glow",
          size === "lg" ? "size-14 rounded-2xl text-2xl" : "size-9 rounded-xl text-base",
        )}
      >
        O
      </span>
      {label}
    </div>
  );
}
