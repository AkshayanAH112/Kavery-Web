CREATE TABLE `push_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`url` text,
	`image` text,
	`image_key` text,
	`notice_id` text,
	`repeat` text NOT NULL,
	`start_date` text NOT NULL,
	`time` text NOT NULL,
	`days` text DEFAULT '[]' NOT NULL,
	`day_of_month` integer,
	`end_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`next_at` integer,
	`last_sent_at` integer,
	`last_delivered` integer,
	`last_missed_at` integer,
	`sends` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`notice_id`) REFERENCES `push_log`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `push_schedules_due_idx` ON `push_schedules` (`status`,`next_at`);