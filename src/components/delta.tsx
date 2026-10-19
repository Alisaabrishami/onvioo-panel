import { TrendingDown, TrendingUp } from "lucide-react";
import { compact } from "@/components/charts";

export function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={up ? "inline-flex items-center gap-1 text-success" : "inline-flex items-center gap-1 text-danger"}>
      <Icon className="size-3.5" />
      <span className="ltr">{`${up ? "+" : "−"}${compact(Math.abs(value))}`}</span>
    </span>
  );
}
