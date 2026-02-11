ALTER TABLE `room_participants` ADD `avatar` varchar(500) DEFAULT 'male' NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `creatorAvatar` varchar(500) DEFAULT 'male' NOT NULL;