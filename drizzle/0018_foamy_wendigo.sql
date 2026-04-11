CREATE TABLE `admin_bans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(100) NOT NULL,
	`username` varchar(100) NOT NULL,
	`banType` enum('1h','24h','permanent') NOT NULL,
	`expiresAt` timestamp,
	`bannedBy` varchar(100) NOT NULL DEFAULT 'admin',
	`isActive` enum('true','false') NOT NULL DEFAULT 'true',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_bans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterUserId` varchar(100) NOT NULL,
	`reporterName` varchar(100) NOT NULL,
	`reportedUserId` varchar(100) NOT NULL,
	`reportedName` varchar(100) NOT NULL,
	`audioMessageId` int,
	`audioUrl` text NOT NULL,
	`messageType` enum('comment','tarouk') NOT NULL,
	`reason` enum('offensive_content','bad_behavior') NOT NULL,
	`status` enum('pending','reviewed','dismissed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
