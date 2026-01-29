ALTER TABLE `audio_messages` MODIFY COLUMN `userId` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `join_requests` MODIFY COLUMN `userId` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `khalooha_commands` MODIFY COLUMN `userId` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `reactions` MODIFY COLUMN `userId` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `recording_status` MODIFY COLUMN `userId` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `room_participants` MODIFY COLUMN `userId` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` MODIFY COLUMN `creatorId` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `sheeloha_broadcasts` MODIFY COLUMN `userId` varchar(100) NOT NULL;