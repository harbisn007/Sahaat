ALTER TABLE `users` ADD `phoneNumber` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar` varchar(500);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_phoneNumber_unique` UNIQUE(`phoneNumber`);