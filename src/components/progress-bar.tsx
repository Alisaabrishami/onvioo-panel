import { toPersianDigits } from "@/lib/format";

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full origin-right animate-[grow_1s_var(--ease-out-soft)_both] rounded-full bg-linear-to-l from-primary to-sand transition-[width] duration-500"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-10 text-left text-xs text-muted-foreground">{toPersianDigits(value)}٪</span>
    </div>
  );
}
