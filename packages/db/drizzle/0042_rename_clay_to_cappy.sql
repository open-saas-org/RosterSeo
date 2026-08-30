ALTER TABLE "clay_conversations" RENAME TO "cappy_conversations";--> statement-breakpoint
ALTER TABLE "clay_messages" RENAME TO "cappy_messages";--> statement-breakpoint
ALTER TABLE "clay_project_notes" RENAME TO "cappy_project_notes";--> statement-breakpoint
ALTER TABLE "projects" RENAME COLUMN "clay_provider" TO "cappy_provider";--> statement-breakpoint
ALTER TABLE "projects" RENAME COLUMN "clay_model" TO "cappy_model";--> statement-breakpoint
ALTER TABLE "cappy_conversations" RENAME CONSTRAINT "clay_conversations_pkey" TO "cappy_conversations_pkey";--> statement-breakpoint
ALTER TABLE "cappy_messages" RENAME CONSTRAINT "clay_messages_pkey" TO "cappy_messages_pkey";--> statement-breakpoint
ALTER TABLE "cappy_project_notes" RENAME CONSTRAINT "clay_project_notes_pkey" TO "cappy_project_notes_pkey";--> statement-breakpoint
ALTER TABLE "cappy_conversations" RENAME CONSTRAINT "clay_conversations_project_id_projects_id_fk" TO "cappy_conversations_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "cappy_conversations" RENAME CONSTRAINT "clay_conversations_user_id_user_id_fk" TO "cappy_conversations_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "cappy_messages" RENAME CONSTRAINT "clay_messages_conversation_id_clay_conversations_id_fk" TO "cappy_messages_conversation_id_cappy_conversations_id_fk";--> statement-breakpoint
ALTER TABLE "cappy_messages" RENAME CONSTRAINT "clay_messages_project_id_projects_id_fk" TO "cappy_messages_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "cappy_project_notes" RENAME CONSTRAINT "clay_project_notes_project_id_projects_id_fk" TO "cappy_project_notes_project_id_projects_id_fk";
