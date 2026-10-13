CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`class_id` text NOT NULL,
	`present` integer DEFAULT false NOT NULL,
	`date` integer NOT NULL,
	`counted_as_leave` integer DEFAULT false NOT NULL,
	`leave_cycle_at_record` integer,
	`remarks` text,
	`marked_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_student_class_uq` ON `attendance` (`student_id`,`class_id`);--> statement-breakpoint
CREATE INDEX `attendance_class_idx` ON `attendance` (`class_id`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`grades` text DEFAULT '[]' NOT NULL,
	`auto_promote` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `class_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`grade` integer NOT NULL,
	`date` integer NOT NULL,
	`time` text,
	`subject` text,
	`ended_at` integer,
	`ended_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ended_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `class_sessions_date_idx` ON `class_sessions` (`date`);--> statement-breakpoint
CREATE INDEX `class_sessions_batch_idx` ON `class_sessions` (`batch_id`,`grade`);--> statement-breakpoint
CREATE TABLE `counters` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cricket_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text,
	`title` text,
	`team_a` text NOT NULL,
	`team_b` text NOT NULL,
	`squad_a` text DEFAULT '[]' NOT NULL,
	`squad_b` text DEFAULT '[]' NOT NULL,
	`overs_per_innings` integer DEFAULT 20 NOT NULL,
	`venue` text,
	`start_at` integer,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`toss` text,
	`innings` text DEFAULT '[]' NOT NULL,
	`scores` text DEFAULT '[]' NOT NULL,
	`result` text,
	`player_of_match` text,
	`is_published` integer DEFAULT true NOT NULL,
	`rev` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `cricket_tournaments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_a`) REFERENCES `cricket_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_b`) REFERENCES `cricket_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cricket_matches_status_idx` ON `cricket_matches` (`status`,`start_at`);--> statement-breakpoint
CREATE INDEX `cricket_matches_tournament_idx` ON `cricket_matches` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `cricket_players` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'batter' NOT NULL,
	`is_captain` integer DEFAULT false NOT NULL,
	`is_keeper` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `cricket_teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cricket_players_team_idx` ON `cricket_players` (`team_id`,`sort`);--> statement-breakpoint
CREATE TABLE `cricket_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`color` text,
	`logo_url` text,
	`logo_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cricket_teams_name_unique` ON `cricket_teams` (`name`);--> statement-breakpoint
CREATE TABLE `cricket_tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`season` text,
	`venue` text,
	`overs_per_innings` integer DEFAULT 20 NOT NULL,
	`team_ids` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`points_win` integer DEFAULT 2 NOT NULL,
	`points_tie` integer DEFAULT 1 NOT NULL,
	`points_no_result` integer DEFAULT 1 NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`start_date` integer,
	`end_date` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cricket_tournaments_slug_unique` ON `cricket_tournaments` (`slug`);--> statement-breakpoint
CREATE TABLE `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`subject` text NOT NULL,
	`grade` integer NOT NULL,
	`batch_id` text NOT NULL,
	`exam_date` integer NOT NULL,
	`max_marks` real NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exams_batch_idx` ON `exams` (`batch_id`,`grade`);--> statement-breakpoint
CREATE TABLE `gallery_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text DEFAULT 'ksc' NOT NULL,
	`name` text NOT NULL,
	`cover_url` text,
	`cover_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_folders_name_unique` ON `gallery_folders` (`name`);--> statement-breakpoint
CREATE TABLE `gallery_images` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text NOT NULL,
	`url` text NOT NULL,
	`key` text,
	`caption` text,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `gallery_folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gallery_images_folder_idx` ON `gallery_images` (`folder_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `leave_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`registration_number` text,
	`student_name` text,
	`type` text NOT NULL,
	`cycle_generation` integer NOT NULL,
	`leave_count` integer NOT NULL,
	`leave_dates` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_alerts_uq` ON `leave_alerts` (`student_id`,`type`,`cycle_generation`);--> statement-breakpoint
CREATE TABLE `marks` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`student_id` text NOT NULL,
	`marks` real DEFAULT 0 NOT NULL,
	`is_absent` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marks_exam_student_uq` ON `marks` (`exam_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `marks_student_idx` ON `marks` (`student_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`date_of_birth` integer,
	`gender` text,
	`phone` text NOT NULL,
	`whatsapp` text,
	`email` text,
	`address` text,
	`nic` text,
	`guardian_name` text,
	`guardian_phone` text,
	`photo_url` text,
	`photo_key` text,
	`member_type` text,
	`job` text,
	`job_category` text,
	`annual_fee` integer,
	`payment_slip_url` text,
	`payment_slip_key` text,
	`valid_from` integer,
	`valid_until` integer,
	`renewal_status` text DEFAULT 'none' NOT NULL,
	`renewal` text,
	`member_code` text,
	`interest` text,
	`previous_club` text,
	`message` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`review_notes` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_member_code_unique` ON `members` (`member_code`);--> statement-breakpoint
CREATE INDEX `members_status_idx` ON `members` (`status`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text DEFAULT 'ksc' NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`content` text NOT NULL,
	`cover_url` text,
	`cover_key` text,
	`images` text DEFAULT '[]' NOT NULL,
	`category` text DEFAULT 'news' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`author` text DEFAULT 'Kavery Sports Club' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);--> statement-breakpoint
CREATE INDEX `posts_feed_idx` ON `posts` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `push_log` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`url` text,
	`sent_by` text,
	`delivered` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sent_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_id` text,
	`topics` text DEFAULT '[]' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`last_success_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_user_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`school` text,
	`address` text,
	`guardian_name` text NOT NULL,
	`guardian_phone` text NOT NULL,
	`whatsapp` text,
	`notes` text,
	`grade` integer NOT NULL,
	`photo_url` text,
	`photo_key` text,
	`qr_code` text NOT NULL,
	`registration_number` text,
	`registration_date` integer,
	`batch_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`total_leaves` integer DEFAULT 0 NOT NULL,
	`current_leave_cycle` integer DEFAULT 0 NOT NULL,
	`cycle_generation` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_qr_code_unique` ON `students` (`qr_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_registration_number_unique` ON `students` (`registration_number`);--> statement-breakpoint
CREATE INDEX `students_batch_idx` ON `students` (`batch_id`,`grade`);--> statement-breakpoint
CREATE INDEX `students_active_idx` ON `students` (`is_active`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'attendance' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);