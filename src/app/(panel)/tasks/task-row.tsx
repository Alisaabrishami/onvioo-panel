"use client";

import { Bot, BotOff, Circle, CircleCheck, CircleDot, Trash2 } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Badge, Button, Input } from "@/components/ui";
import type { CheckinState, TaskPriority, TaskStatus } from "@/db/schema";
import { PRIORITY_LABELS, PRIORITY_TONES, TASK_STATUS_LABELS } from "@/lib/content";
import { ANSWER_EMOJI, ANSWER_LABELS, CHECKIN_LABELS } from "@/lib/follow-up";
import { formatJalaliDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { answerFollowUp, deleteTask, setFollowUp, setTaskStatus } from "./actions";

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
  // Set when the assistant follows the task up for a manager
  followUp: { manager: string | null; checkin: CheckinState | null; note: string | null } | null;
  mine: boolean;
  canFollowUp: boolean;
  hasAssignee: boolean;
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
          {task.followUp && status !== "done" && (
            <Badge tone={task.followUp.checkin === "blocked" ? "danger" : task.followUp.checkin === "asked" ? "warning" : "primary"}>
              <Bot className="size-3" />
              پیگیری دستیار{task.followUp.checkin ? ` · ${CHECKIN_LABELS[task.followUp.checkin]}` : ""}
            </Badge>
          )}
          {task.followUp?.checkin === "blocked" && task.followUp.note && <span className="text-danger">«{task.followUp.note}»</span>}
        </div>
        {task.followUp && task.mine && status !== "done" && <CheckinBar taskId={task.id} manager={task.followUp.manager} asked={task.followUp.checkin === "asked"} />}
      </div>
      {task.canFollowUp && status !== "done" && (task.followUp || task.hasAssignee) && (
        <button
          type="button"
          onClick={() => startTransition(() => setFollowUp(task.id, !task.followUp))}
          className={cn("rounded p-1", task.followUp ? "text-primary hover:text-danger" : "text-muted-foreground hover:text-primary")}
          title={task.followUp ? "توقف پیگیری دستیار" : "دستیار از طرف من پیگیری کند"}
          aria-label={task.followUp ? "توقف پیگیری دستیار" : "پیگیری با دستیار"}
        >
          {task.followUp ? <BotOff className="size-4" /> : <Bot className="size-4" />}
        </button>
      )}
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

// The assignee answers the assistant's question right in the task list
function CheckinBar({ taskId, manager, asked }: { taskId: string; manager: string | null; asked: boolean }) {
  const [pending, startTransition] = useTransition();
  const [blocking, setBlocking] = useState(false);
  const [note, setNote] = useState("");
  const send = (answer: "done" | "on_track" | "blocked", text?: string) =>
    startTransition(async () => {
      await answerFollowUp(taskId, answer, text);
      setBlocking(false);
    });

  return (
    <div className={cn("mt-2 rounded-xl border border-border p-2.5 text-xs", asked && "border-warning/50 bg-warning/5", pending && "opacity-70")}>
      <p className="mb-2 text-muted-foreground">
        {asked ? "دستیار" : "هر وقت خواستید به دستیار"} {manager ? `از طرف ${manager} ` : ""}
        {asked ? "می‌پرسد: این کار در چه حالی است؟" : "بگویید کار در چه حالی است."}
      </p>
      {blocking ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send("blocked", note);
          }}
        >
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="چه چیزی مانع کار است یا چه کمکی لازم دارید؟" className="h-8 min-w-48 flex-1 text-xs" autoFocus />
          <Button type="submit" disabled={pending || note.trim().length < 2} className="h-8 px-3 text-xs">فرستادن به مدیر</Button>
          <Button type="button" variant="ghost" onClick={() => setBlocking(false)} className="h-8 px-3 text-xs">انصراف</Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {(["done", "on_track", "blocked"] as const).map((a) => (
            <button
              key={a}
              type="button"
              disabled={pending}
              onClick={() => (a === "blocked" ? setBlocking(true) : send(a))}
              className="rounded-full border border-border px-3 py-1 hover:border-primary hover:text-primary"
            >
              {ANSWER_EMOJI[a]} {ANSWER_LABELS[a]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
