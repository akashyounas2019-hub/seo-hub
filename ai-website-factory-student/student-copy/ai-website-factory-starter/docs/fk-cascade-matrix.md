# FK cascade matrix

Reference of what happens to dependent rows when a parent row is deleted.
Derived from `src/db/schema.ts` — keep in sync if you change a `references({ onDelete: ... })` clause.

Legend:
- **CASCADE** — child rows are deleted with the parent.
- **SET NULL** — child rows kept, FK set to NULL.
- **NO ACTION** — DB refuses if any child still references (default Drizzle when omitted).

## Sites (`sites`)

| Child table | FK | On site delete |
|---|---|---|
| `api_keys` | `site_id` | CASCADE |
| `leads` | `site_id` | CASCADE |
| `events` | `site_id` | CASCADE |
| `site_users` | `site_id` | CASCADE |
| `task_templates` | `site_id` | CASCADE |
| `tasks` | `site_id` | CASCADE |
| `screen_recordings` | `site_id` | SET NULL |
| `activity_events` | `site_id` | SET NULL |
| `wp_admin_grants` | `site_id` | CASCADE |
| `integrations_accounts` | `site_id` | CASCADE |
| `payments` | `site_id` | CASCADE |
| `traffic_snapshots` | `site_id` | CASCADE |
| `phone_numbers` | `site_id` | CASCADE |
| `calls` | `site_id` | CASCADE |

Deleting a site is therefore destructive — all leads, payments, calls, integrations etc. for that site go with it. Use deactivation (a future flag) for soft removal.

## Users (`users`)

| Child table | FK | On user delete |
|---|---|---|
| `site_users` | `user_id` | CASCADE |
| `sessions` | `user_id` | CASCADE |
| `task_templates` | `default_assignee_id` | SET NULL |
| `tasks` | `assignee_id` | SET NULL |
| `tasks` | `creator_id` | SET NULL |
| `task_comments` | `author_id` | SET NULL |
| `org_settings` | `updated_by` | SET NULL |
| `chat_threads` | `user_id` | CASCADE |
| `notifications` | `recipient_id` | CASCADE |
| `admin_actions` | `actor_id` | SET NULL (`actor_email` denormalized so audit survives) |
| `invite_tokens` | `user_id` / `created_by` | CASCADE / SET NULL |
| `lead_contact_attempts` | `user_id` | SET NULL |
| `desktop_sessions` | `user_id` | CASCADE |
| `screen_recordings` | `user_id` | CASCADE |
| `activity_events` | `user_id` | CASCADE |

User deletion preserves task/lead/comment history (FKs go null) but blows away their sessions, chat threads, notifications, and desktop session/recording artifacts.

## Leads (`leads`)

| Child table | FK | On lead delete |
|---|---|---|
| `lead_contact_attempts` | `lead_id` | CASCADE |
| `payments` | `lead_id` | SET NULL |
| `calls` | `lead_id` | SET NULL |

## Tasks (`tasks`)

| Child table | FK | On task delete |
|---|---|---|
| `task_comments` | `task_id` | CASCADE |
| `task_audits` | `task_id` | CASCADE |

## Task templates (`task_templates`)

| Child table | FK | On template delete |
|---|---|---|
| `tasks` | `template_id` | SET NULL |

## Desktop sessions (`desktop_sessions`)

| Child table | FK | On session delete |
|---|---|---|
| `screen_recordings` | `desktop_session_id` | CASCADE |
| `activity_events` | `desktop_session_id` | CASCADE |
| `wp_admin_grants` | `desktop_session_id` | CASCADE |

## Chat threads (`chat_threads`)

| Child table | FK | On thread delete |
|---|---|---|
| `chat_messages` | `thread_id` | CASCADE |

## Phone numbers (`phone_numbers`)

| Child table | FK | On phone number delete |
|---|---|---|
| `calls` | `phone_number_id` | SET NULL |

## Notes

- Append-only audit (`admin_actions`) deliberately denormalizes `actor_email` so deleting a user does not erase what they did.
- `notifications` cascade with the recipient — there's no archival history; if you want one, route via `admin_actions` first.
- Phone number rows are SET NULL on call attribution so historical Twilio CallSid stays intact even after a number is released.
