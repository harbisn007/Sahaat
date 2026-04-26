CREATE TABLE `text_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`userId` varchar(100) NOT NULL,
	`username` varchar(50) NOT NULL,
	`text` varchar(300) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `text_messages_id` PRIMARY KEY(`id`)
);
