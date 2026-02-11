ALTER TABLE `rooms` ADD `extensionExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `rooms` ADD `extensionLostAt` timestamp;--> statement-breakpoint
ALTER TABLE `rooms` DROP COLUMN `goldStarLostAt`;