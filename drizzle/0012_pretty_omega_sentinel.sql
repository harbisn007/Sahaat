ALTER TABLE `rooms` ADD `taroukController` enum('creator','player1','player2');--> statement-breakpoint
ALTER TABLE `rooms` ADD `clappingDelay` varchar(10) DEFAULT '0.80';