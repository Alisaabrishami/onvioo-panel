import { Medal } from "lucide-react";
import type { Metadata } from "next";
import { PeriodNav, readPeriod } from "@/components/period-nav";
import { Card, PageHeader } from "@/components/ui";
import { requireTeam } from "@/lib/auth/dal";
import { toPersianDigits } from "@/lib/format";
import { formatMinutes, periodOf, teamScore } from "@/lib/payroll";
import { activeTeam, memberStats } from "@/lib/team-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "امتیاز تیم" };

const MEDALS = ["text-amber-500", "text-slate-400", "text-orange-700"];

export default async function TeamPage(props: PageProps<"/team">) {
  const user = await requireTeam();
  const current = periodOf();
  const period = readPeriod((await props.searchParams).period, current);
  const [team, stats] = await Promise.all([activeTeam(), memberStats(period)]);
  const rows = stats
    .map((s) => ({ ...s, name: team.find((m) => m.id === s.userId)?.name ?? "", score: teamScore(s) }))
    .sort((a, b) => b.score - a.score);

  return (
    <>
      <PageHeader
        title="امتیاز تیم"
        description="کار تحویل‌شده، تحویل به‌موقع و ساعت کاری؛ مبنای پاداش ماهانه"
        actions={<PeriodNav period={period} basePath="/team" current={current} />}
      />
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-right font-medium">رتبه</th>
              <th className="px-4 py-3 text-right font-medium">نفر</th>
              <th className="px-4 py-3 text-right font-medium">محتوای منتشرشده</th>
              <th className="px-4 py-3 text-right font-medium">کار به‌موقع</th>
              <th className="px-4 py-3 text-right font-medium">ساعت کار</th>
              <th className="px-4 py-3 text-right font-medium">امتیاز</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.userId} className={cn("border-t border-border", r.userId === user.id && "bg-primary/5")}>
                <td className="px-4 py-3">
                  {i < 3 && r.score > 0 ? <Medal className={cn("size-5", MEDALS[i])} aria-label={`رتبه ${i + 1}`} /> : toPersianDigits(i + 1)}
                </td>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">{toPersianDigits(r.delivered)}</td>
                <td className="px-4 py-3">{r.dueTasks ? `${toPersianDigits(r.onTime)} از ${toPersianDigits(r.dueTasks)}` : "—"}</td>
                <td className="px-4 py-3">{formatMinutes(r.minutes)}</td>
                <td className="px-4 py-3 text-base font-bold text-primary">{toPersianDigits(r.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card className="mt-6 text-sm text-muted-foreground">
        هر محتوای منتشرشده ۱۰ امتیاز، تحویل به‌موقع کارها تا ۳۰ امتیاز و هر ۱۰ ساعت کار ۱ امتیاز دارد. مدیر می‌تواند پاداش را در فیش حقوق همان ماه وارد کند.
      </Card>
    </>
  );
}
