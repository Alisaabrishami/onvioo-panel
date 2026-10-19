import { formatIsoDate, toPersianDigits } from "@/lib/format";

// Small dependency-free SVG charts. Time runs left to right as in any chart,
// so the drawing area is LTR inside the RTL page.

export type ChartPoint = { day: string; value: number };

const W = 600;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${toPersianDigits((n / 1_000_000).toFixed(1).replace(/\.0$/, ""))}M`;
  if (abs >= 10_000) return `${toPersianDigits(Math.round(n / 1000))}K`;
  return toPersianDigits(Math.round(n).toLocaleString("en-US"));
}

function scale(points: ChartPoint[]) {
  const days = points.map((p) => Date.parse(p.day));
  const values = points.map((p) => p.value);
  const minX = Math.min(...days);
  const maxX = Math.max(...days);
  let minY = Math.min(...values);
  let maxY = Math.max(...values);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const padY = (maxY - minY) * 0.1;
  minY -= padY;
  maxY += padY;
  const x = (day: string) => PAD.left + ((Date.parse(day) - minX) / (maxX - minX || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - minY) / (maxY - minY)) * (H - PAD.top - PAD.bottom);
  return { x, y };
}

export function LineChart({ points, projection, label }: { points: ChartPoint[]; projection?: ChartPoint[]; label: string }) {
  if (points.length < 2) return <ChartEmpty />;
  const all = [...points, ...(projection ?? [])];
  const { x, y } = scale(all);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points[points.length - 1].day).toFixed(1)},${H - PAD.bottom} L${x(points[0].day).toFixed(1)},${H - PAD.bottom} Z`;
  const last = points[points.length - 1];
  const proj = projection?.length
    ? [last, ...projection].map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")
    : null;
  const end = all[all.length - 1];
  return (
    <figure dir="ltr" className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full overflow-visible">
        <path d={area} fill="var(--primary)" opacity={0.08} />
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {proj && <path d={proj} fill="none" stroke="var(--primary)" strokeWidth={2} strokeDasharray="6 5" opacity={0.7} />}
        <circle cx={x(last.day)} cy={y(last.value)} r={4} fill="var(--primary)" />
        <text x={PAD.left} y={H - 4} fontSize={11} fill="var(--muted-foreground)">{formatIsoDate(points[0].day)}</text>
        <text x={W - PAD.right} y={H - 4} fontSize={11} fill="var(--muted-foreground)" textAnchor="end">{formatIsoDate(end.day)}</text>
      </svg>
    </figure>
  );
}

export function BarChart({ points, label }: { points: ChartPoint[]; label: string }) {
  if (points.length === 0) return <ChartEmpty />;
  const max = Math.max(...points.map((p) => p.value), 1);
  const inner = W - PAD.left - PAD.right;
  const bw = inner / points.length;
  return (
    <figure dir="ltr" className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
        {points.map((p, i) => {
          const h = (p.value / max) * (H - PAD.top - PAD.bottom);
          return (
            <rect key={p.day} x={PAD.left + i * bw + bw * 0.15} y={H - PAD.bottom - h} width={bw * 0.7} height={h} rx={2} fill="var(--primary)" opacity={0.75}>
              <title>{`${formatIsoDate(p.day)}: ${compact(p.value)}`}</title>
            </rect>
          );
        })}
        <text x={PAD.left} y={H - 4} fontSize={11} fill="var(--muted-foreground)">{formatIsoDate(points[0].day)}</text>
        <text x={W - PAD.right} y={H - 4} fontSize={11} fill="var(--muted-foreground)" textAnchor="end">{formatIsoDate(points[points.length - 1].day)}</text>
      </svg>
    </figure>
  );
}

function ChartEmpty() {
  return <p className="py-10 text-center text-sm text-muted-foreground">برای نمودار حداقل دو روز آمار لازم است.</p>;
}
