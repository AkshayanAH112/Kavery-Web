CREATE TABLE `meeting_attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`student_id` text NOT NULL,
	`present` integer DEFAULT false NOT NULL,
	`marked_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `parent_meetings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_attendance_uq` ON `meeting_attendance` (`meeting_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `meeting_attendance_student_idx` ON `meeting_attendance` (`student_id`);--> statement-breakpoint
CREATE TABLE `meeting_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`meeting_id` text NOT NULL,
	`missed` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`pushed_at` integer,
	`contacted_at` integer,
	`contacted_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meeting_id`) REFERENCES `parent_meetings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contacted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_reminders_uq` ON `meeting_reminders` (`student_id`,`meeting_id`);--> statement-breakpoint
CREATE INDEX `meeting_reminders_status_idx` ON `meeting_reminders` (`status`);--> statement-breakpoint
CREATE TABLE `parent_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`batch_id` text,
	`grade` integer,
	`date` integer NOT NULL,
	`time` text,
	`venue` text,
	`notes` text,
	`ended_at` integer,
	`ended_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ended_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `parent_meetings_date_idx` ON `parent_meetings` (`date`);--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `student_ids` text DEFAULT '[]' NOT NULL;