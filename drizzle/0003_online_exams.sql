CREATE TABLE `online_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`question_id` text NOT NULL,
	`choice` text,
	`response` text,
	`awarded` real,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `online_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `online_questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `online_answers_attempt_question_uq` ON `online_answers` (`attempt_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `online_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`student_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`deadline` integer NOT NULL,
	`submitted_at` integer,
	`order` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `online_papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `online_attempts_paper_student_uq` ON `online_attempts` (`paper_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `online_attempts_student_idx` ON `online_attempts` (`student_id`);--> statement-breakpoint
CREATE TABLE `online_papers` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`mode` text DEFAULT 'practice' NOT NULL,
	`batch_id` text NOT NULL,
	`grade` integer NOT NULL,
	`exam_id` text,
	`instructions` text,
	`opens_at` integer,
	`closes_at` integer,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`shuffle` integer DEFAULT true NOT NULL,
	`is_ready` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `online_papers_exam_uq` ON `online_papers` (`exam_id`);--> statement-breakpoint
CREATE INDEX `online_papers_batch_idx` ON `online_papers` (`batch_id`,`grade`);--> statement-breakpoint
CREATE TABLE `online_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`kind` text DEFAULT 'choice' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`image` text,
	`options` text DEFAULT '[]' NOT NULL,
	`answer` text,
	`accepted` text DEFAULT '[]' NOT NULL,
	`marks` real DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `online_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `online_questions_paper_idx` ON `online_questions` (`paper_id`,`position`);