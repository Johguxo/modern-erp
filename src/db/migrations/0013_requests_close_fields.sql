ALTER TABLE "requests" ADD COLUMN "closed_by" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "close_comment" text;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_close_comment_check" CHECK ("requests"."close_comment" is null or (btrim("requests"."close_comment") <> '' and char_length("requests"."close_comment") <= 500));