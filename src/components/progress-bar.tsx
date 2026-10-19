import { toPersianDigits } from "@/lib/format";

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
      </div>
      <span className="w-10 text-left text-xs text-muted-foreground">{toPersianDigits(value)}٪</span>
    </div>
  );
}
