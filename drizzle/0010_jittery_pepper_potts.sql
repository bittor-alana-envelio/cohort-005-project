CREATE TABLE `refund_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text NOT NULL,
	`amount_refunded` integer,
	`requested_at` text NOT NULL,
	`resolved_at` text,
	`resolved_by_user_id` integer,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refund_requests_purchase_idx` ON `refund_requests` (`purchase_id`);--> statement-breakpoint
CREATE TABLE `seats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`course_id` integer NOT NULL,
	`code` text NOT NULL,
	`purchase_id` integer NOT NULL,
	`claimed_by_user_id` integer,
	`claimed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claimed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seats_code_unique` ON `seats` (`code`);--> statement-breakpoint
DROP TABLE `coupons`;--> statement-breakpoint
DROP TABLE `refunds`;