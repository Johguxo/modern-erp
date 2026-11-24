ALTER TABLE "cost_centers" DROP CONSTRAINT "cost_centers_code_normalized";--> statement-breakpoint
ALTER TABLE "equipment" DROP CONSTRAINT "equipment_code_normalized";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_code_normalized";--> statement-breakpoint
ALTER TABLE "warehouses" DROP CONSTRAINT "warehouses_code_normalized";--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_code_normalized" CHECK ("cost_centers"."code" = upper(btrim("cost_centers"."code")) and char_length("cost_centers"."code") <= 40 and "cost_centers"."code" ~ '^[A-Z0-9][A-Z0-9._/-]*$');--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_code_normalized" CHECK ("equipment"."code" = upper(btrim("equipment"."code")) and char_length("equipment"."code") <= 40 and "equipment"."code" ~ '^[A-Z0-9][A-Z0-9._/-]*$');--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_code_normalized" CHECK ("products"."code" = upper(btrim("products"."code")) and char_length("products"."code") <= 40 and "products"."code" ~ '^[A-Z0-9][A-Z0-9._/-]*$');--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_code_normalized" CHECK ("warehouses"."code" = upper(btrim("warehouses"."code")) and char_length("warehouses"."code") <= 40 and "warehouses"."code" ~ '^[A-Z0-9][A-Z0-9._/-]*$');