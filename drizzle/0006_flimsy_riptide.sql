CREATE TABLE `join_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(50) NOT NULL,
	`avatar` varchar(500) NOT NULL DEFAULT 'male',
	`status` enum('pending','accepted','rejected','expired') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `join_requests_id` PRIMARY KEY(`id`)
);
