CREATE INDEX `idx_reactions_article_user` ON `reactions` (`article_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_reactions_article_created` ON `reactions` (`article_id`,`created_at`);