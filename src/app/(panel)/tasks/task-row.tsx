"use client";

import { Circle, CircleCheck, CircleDot, Trash2 } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Badge } from "@/components/ui";
import type { TaskPriority, TaskStatus } from "@/db/schema";
import { PRIORITY_LABELS, PRIORITY_TONES, TASK_STATUS_LABELS } from "@/lib/content";
import { formatJalaliDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteTask, setTaskStatus } from "./actions";

export type TaskItem = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Date | null;
  auto: boolean;
  contentId: string | null;
  clientName: string | null;
  assigneeName: string | null;
  late: boolean;
  canDelete: boolean;
};

const NEXT: Record<TaskStatus, TaskStatus> = { todo: "doing", doing: "done", done: "todo" };
const ICONS = { todo: Circle, doing: CircleDot, done: CircleCheck };

export function TaskRow({ task }: { task: TaskItem }) {
  const [status, setStatus] = useOptimistic(task.status);
  const [pending, startTransition] = useTransition();
  const Icon = ICONS[status];
  const late = task.late && status !== "done";

  return (
    <li className={cn("flex items-start gap-3 py-3", pending && "opacity-70")}>
      <button
        type="button"
        title={`${TASK_STATUS_LABELS[status]} — برای تغییر کلیک کنید`}
        aria-label={TASK_STATUS_LABELS[status]}
        onClick={() =>
          startTransition(async () => {
            setStatus(NEXT[status]);
            await setTaskStatus(task.id, NEXT[status]);
          })
        }
        className={cn(
          "mt-0.5 shrink-0 rounded-full",
          status === "done" ? "text-success" : status === "doing" ? "text-warning" : "text-muted-foreground hover:text-primary",
        )}
      >
        <Icon className="size-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", status === "done" && "text-muted-foreground line-through")}>
          {task.contentId ? (
            <Link href={`/content/${task.contentId}`} className="hover:text-primary">{task.title}</Link>
          ) : (
            task.title
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {task.priority !== "normal" && <Badge tone={PRIORITY_TONES[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>}
          {task.auto && <span className="text-primary">خودکار از بورد محتوا</span>}
          {task.clientName && <span>{task.clientName}</span>}
          {task.assigneeName && <span>مسئول: {task.assigneeName}</span>}
          {task.dueAt && (
            <span className={cn(late && "font-medium text-danger")}>
              {late ? "عقب افتاده · " : "مهلت "}
              {formatJalaliDate(task.dueAt)}
            </span>
          )}
        </div>
      </div>
      {task.canDelete && (
        <button
          type="button"
          onClick={() => startTransition(() => deleteTask(task.id))}
          className="rounded p-1 text-muted-foreground hover:text-danger"
          aria-label="حذف کار"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  );
}
