-- ============================================================
-- Phase 2, Stage A — location_members table + active_location_id
-- ============================================================
-- Purely additive. Nothing yet reads location_members or
-- active_location_id, so this cannot change current app behavior.
-- get_current_location_id() still reads user_profiles.location_id
-- until Stage B (00024) redefines it.

create table public.location_members (
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id)     on delete cascade,
  role        text not null default 'staff' check (role in ('admin','staff')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, location_id)
);
create index location_members_location_idx on public.location_members (location_id, role);
alter table public.location_members enable row level security;

create trigger handle_updated_at before update on public.location_members
  for each row execute procedure moddatetime (updated_at);

-- Backfill: one membership row per existing profile, admin/staff role
-- carried over verbatim.
insert into public.location_members (user_id, location_id, role, created_at)
  select id, location_id, role, created_at from public.user_profiles
  on conflict do nothing;

-- Active location pointer.
alter table public.user_profiles add column if not exists active_location_id uuid
  references public.locations(id);
update public.user_profiles set active_location_id = location_id where active_location_id is null;

-- (user_id, location_id) is location_members' PK, so this composite FK is
-- legal. It makes "active location you are not a member of" structurally
-- impossible, and ON DELETE SET NULL auto-clears the pointer when a
-- membership is revoked (no manual cleanup needed elsewhere).
alter table public.user_profiles
  add constraint user_profiles_active_location_is_membership
  foreign key (id, active_location_id)
  references public.location_members (user_id, location_id)
  on delete set null;

-- Rollback:
--   alter table public.user_profiles drop constraint user_profiles_active_location_is_membership;
--   alter table public.user_profiles drop column active_location_id;
--   drop table public.location_members;
