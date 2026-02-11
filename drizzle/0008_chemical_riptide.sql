CREATE TABLE `public_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`creatorId` varchar(100) NOT NULL,
	`creatorName` varchar(50) NOT NULL,
	`creatorAvatar` varchar(500) NOT NULL DEFAULT 'male',
	`roomName` varchar(100) NOT NULL,
	`status` enum('pending','displayed','expired') NOT NULL DEFAULT 'pending',
	`displayedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `public_invitations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `rooms` ADD `hasGoldStar` enum('true','false') DEFAULT 'false' NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `goldStarExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `rooms` ADD `lastPublicInviteAt` timestamp;