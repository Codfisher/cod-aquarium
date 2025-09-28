CREATE TABLE `reactions` (
	`article_id` text NOT NULL,
	`user_id` text NOT NULL,
	`like` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`article_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_reactions_article_user` ON `reactions` (`article_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_reactions_article_updated` ON `reactions` (`article_id`,`updated_at`);