CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_token_hash_unique` ON `players` (`token_hash`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`day` text NOT NULL,
	`version` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`elapsed_ms` integer,
	`mistakes` integer,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runs_player` ON `runs` (`player_id`,`status`);--> statement-breakpoint
CREATE TABLE `scores` (
	`day` text NOT NULL,
	`player_id` text NOT NULL,
	`elapsed_ms` integer NOT NULL,
	`mistakes` integer NOT NULL,
	`finished_at` integer NOT NULL,
	PRIMARY KEY(`day`, `player_id`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `score_order` ON `scores` (`day`,`elapsed_ms`,`mistakes`,`finished_at`);