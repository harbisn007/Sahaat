CREATE TABLE `user_interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromUserId` varchar(100) NOT NULL,
	`toUserId` varchar(100) NOT NULL,
	`type` enum('like','follow','dislike') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_interactions_id` PRIMARY KEY(`id`)
);
