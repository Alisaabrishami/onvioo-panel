ALTER TABLE "files" ADD COLUMN "ticket_message_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_ticket_message_id_ticket_messages_id_fk" FOREIGN KEY ("ticket_message_id") REFERENCES "public"."ticket_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_ticket_message_idx" ON "files" USING btree ("ticket_message_id");