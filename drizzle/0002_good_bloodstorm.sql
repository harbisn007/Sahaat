CREATE TABLE `sheeloha_broadcasts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(50) NOT NULL,
	`audioUrl` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sheeloha_broadcasts_id` PRIMARY KEY(`id`)
);
