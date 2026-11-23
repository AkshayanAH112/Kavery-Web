CREATE TABLE `tests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'test' NOT NULL,
	`grade` integer NOT NULL,
	`batch_id` text NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tests_batch_idx` ON `tests` (`batch_id`,`grade`);--> statement-breakpoint
ALTER TABLE `exams` ADD `test_id` text REFERENCES tests(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `exams` ADD `part` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `exams_test_part_uq` ON `exams` (`test_id`,`part`);--> statement-breakpoint
-- Every exam that already exists becomes a single-paper test of its own, under the same id, keeping
-- its label and whether parents can see it. Added columns rather than a rebuilt table: rebuilding
-- `exams` would drop it, and dropping it cascades to every mark.
INSERT INTO `tests` (`id`, `name`, `kind`, `grade`, `batch_id`, `is_published`, `published_at`, `created_at`, `updated_at`)
SELECT `id`, COALESCE(`name`, `subject`), 'test', `grade`, `batch_id`, `is_published`, `published_at`, `created_at`, `updated_at` FROM `exams`;--> statement-breakpoint
UPDATE `exams` SET `test_id` = `id` WHERE `test_id` IS NULL;