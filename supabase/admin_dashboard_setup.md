# VetLearn Admin Dashboard Setup

Run these in Supabase SQL Editor in this order:

1. `supabase/admin_dashboard_prerequisites.sql`
2. `supabase/admin_dashboard.sql`

## Create the first Super Admin

Replace the email address with your own VetLearn login email and run this in Supabase SQL Editor:

```sql
insert into public.admin_user_roles (user_id, role, is_active)
select id, 'super_admin', true
from auth.users
where email = 'craig685@gmail.com'
on conflict (user_id) do update set
  role = 'super_admin',
  is_active = true,
  updated_at = now();
```

After that, sign out and back in. The app menu will show `Admin`, and `/admin` will open the Admin Dashboard.

## Promote another user to Admin

Use the Admin Dashboard user list, or run:

```sql
select public.admin_set_user_role('USER_UUID_HERE', 'admin');
```

## Demote an Admin

```sql
select public.admin_set_user_role('USER_UUID_HERE', 'user');
```

## Password reset, logout and delete-user actions

Privileged Supabase Auth actions must run through an Edge Function, not directly in the browser.

Deploy the function:

```bash
supabase functions deploy admin-user-actions
```

The function uses the normal Supabase environment variables plus `SUPABASE_SERVICE_ROLE_KEY`. Optionally set a password reset redirect URL:

```bash
supabase secrets set PASSWORD_RESET_REDIRECT_URL=https://YOUR_APP_URL/settings
```

## Recovery if locked out

Run the first Super Admin SQL again from the Supabase SQL Editor with your own email address. This bypasses the app and restores access.

## What this adds

- Admin-only `/admin` route
- Admin/Super Admin role system
- User status management
- Subscription plan foundation
- Feature flags by subscription tier
- User feature override table for future expansion
- Admin announcements
- Audit logs
- System error and backup log tables
- Dashboard metrics RPC
- Edge Function foundation for password reset, remote logout and delete-user actions
