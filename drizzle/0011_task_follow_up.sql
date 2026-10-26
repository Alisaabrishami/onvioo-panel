CREATE TYPE "public"."checkin_state" AS ENUM('asked', 'on_track', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."task_update_kind" AS ENUM('asked', 'on_track', 'blocked', 'done', 'escalated');--> statement-breakpoint
CREATE TABLE "task_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" "task_update_kind" NOT NULL,
	"note" text,
	"via" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "follow_up_by" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "follow_up_every" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "checkin" "checkin_state";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "checkin_note" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "asked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "answered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "unanswered" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_updates" ADD CONSTRAINT "task_updates_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_updates" ADD CONSTRAINT "task_updates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_updates_task_idx" ON "task_updates" USING btree ("task_id","created_at");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_follow_up_by_users_id_fk" FOREIGN KEY ("follow_up_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_follow_up_idx" ON "tasks" USING btree ("follow_up_by","status");