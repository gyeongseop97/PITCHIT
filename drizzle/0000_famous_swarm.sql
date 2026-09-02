CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`status` text NOT NULL,
	`mode` text NOT NULL,
	`home_id` text,
	`away_id` text,
	`home_name` text,
	`away_name` text,
	`inning` integer DEFAULT 1 NOT NULL,
	`half` text DEFAULT 'top' NOT NULL,
	`outs` integer DEFAULT 0 NOT NULL,
	`balls` integer DEFAULT 0 NOT NULL,
	`strikes` integer DEFAULT 0 NOT NULL,
	`home_score` integer DEFAULT 0 NOT NULL,
	`away_score` integer DEFAULT 0 NOT NULL,
	`bases` text DEFAULT '[0,0,0]' NOT NULL,
	`home_choice` text,
	`away_choice` text,
	`last_play` text,
	`message` text DEFAULT '상대를 기다리는 중입니다.' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_code_unique` ON `games` (`code`);