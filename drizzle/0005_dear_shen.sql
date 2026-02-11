CREATE TABLE `recording_status` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(50) NOT NULL,
	`isRecording` enum('true','false') NOT NULL DEFAULT 'false',
	`recordingType` enum('comment','tarouk') NOT NULL DEFAULT 'tarouk',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recording_status_id` PRIMARY KEY(`id`)
);
