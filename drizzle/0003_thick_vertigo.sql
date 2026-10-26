CREATE TYPE "public"."ig_account_kind" AS ENUM('own', 'competitor');--> statement-breakpoint
CREATE TYPE "public"."insight_kind" AS ENUM('viral_score', 'weekly_report', 'trend_ideas', 'competitor_spike');--> statement-breakpoint
CREATE TABLE "ig_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "ig_account_kind" DEFAULT 'own' NOT NULL,
	"username" text NOT NULL,
	"ig_user_id" text,
	"access_token" text,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ig_daily_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"followers" integer,
	"reach" integer,
	"views" integer
);
--> statement-breakpoint
CREATE TABLE "ig_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"permalink" text,
	"type" "content_type" DEFAULT 'post' NOT NULL,
	"caption" text,
	"posted_at" timestamp with time zone NOT NULL,
	"content_id" uuid,
	"views" integer,
	"reach" integer,
	"likes" integer,
	"comments" integer,
	"saves" integer,
	"shares" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "insight_kind" NOT NULL,
	"client_id" uuid NOT NULL,
	"content_id" uuid,
	"post_id" uuid,
	"data" jsonb NOT NULL,
	"shared_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ig_accounts" ADD CONSTRAINT "ig_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ig_daily_stats" ADD CONSTRAINT "ig_daily_stats_account_id_ig_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ig_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ig_posts" ADD CONSTRAINT "ig_posts_account_id_ig_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ig_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ig_posts" ADD CONSTRAINT "ig_posts_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_post_id_ig_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."ig_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ig_accounts_client_username_idx" ON "ig_accounts" USING btree ("client_id","username");--> statement-breakpoint
CREATE UNIQUE INDEX "ig_daily_stats_account_day_idx" ON "ig_daily_stats" USING btree ("account_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "ig_posts_account_external_idx" ON "ig_posts" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "ig_posts_posted_idx" ON "ig_posts" USING btree ("account_id","posted_at");--> statement-breakpoint
CREATE INDEX "insights_client_idx" ON "insights" USING btree ("client_id","kind");--> statement-breakpoint
CREATE INDEX "insights_content_idx" ON "insights" USING btree ("content_id");