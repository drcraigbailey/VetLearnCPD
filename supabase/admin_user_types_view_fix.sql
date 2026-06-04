-- Fix for existing admin_user_overview column order/name changes.
-- Run this once if admin_user_types_notifications.sql fails with:
-- ERROR: cannot change name of view column "role" to "location"

DROP VIEW IF EXISTS public.admin_user_overview;
