CREATE TABLE `blocked_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockerId` varchar(100) NOT NULL,
	`blockedId` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocked_users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `appUserId` varchar(255);