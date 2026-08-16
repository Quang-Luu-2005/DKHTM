create extension if not exists pgcrypto;

-- 1. Drop existing tables if re-initializing schema
drop table if exists public.camera_snapshots cascade;
drop table if exists public.security_alerts cascade;
drop table if exists public.access_events cascade;
drop table if exists public.devices cascade;

-- 2. Create devices table
create table public.devices (
  id text primary key,
  name text not null,
  device_type text not null
    check (device_type in ('GATE_CONTROLLER', 'STREAM_CAMERA', 'HFR_CAMERA')),
  status text not null default 'OFFLINE'
    check (status in ('ONLINE', 'OFFLINE', 'DEGRADED')),
  ip_address inet,
  firmware_version text,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Create access_events table (using UUID primary key)
create table public.access_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event_type text not null,
  result text,
  auth_method text,
  employee_id text references public.employees(id) on delete set null,
  employee_name text,
  rfid_uid text,
  confidence real,
  reason text,
  gate_id text not null default 'GT-NORTH-01',
  source_device_id text references public.devices(id) on delete set null,
  payload jsonb not null default '{}'::jsonb
);

-- 4. Create security_alerts table (references access_events UUID)
create table public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  access_event_id uuid references public.access_events(id) on delete set null,
  occurred_at timestamptz not null default now(),
  alert_type text not null,
  gate_id text not null default 'GT-NORTH-01',
  distance_cm integer,
  auth_method text,
  failed_attempts integer not null default 0,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb
);

-- 5. Create camera_snapshots table
create table public.camera_snapshots (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid references public.security_alerts(id) on delete cascade,
  storage_path text not null unique,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

-- 6. Indexes
create index if not exists access_events_occurred_at_idx
  on public.access_events (occurred_at desc);
create index if not exists access_events_employee_id_idx
  on public.access_events (employee_id);
create index if not exists access_events_event_type_idx
  on public.access_events (event_type);
create index if not exists security_alerts_occurred_at_idx
  on public.security_alerts (occurred_at desc);
create index if not exists security_alerts_alert_type_idx
  on public.security_alerts (alert_type);

-- 7. Trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

-- 8. Row Level Security & Permissions
alter table public.devices enable row level security;
alter table public.access_events enable row level security;
alter table public.security_alerts enable row level security;
alter table public.camera_snapshots enable row level security;

revoke all on public.devices from anon;
revoke all on public.access_events from anon;
revoke all on public.security_alerts from anon;
revoke all on public.camera_snapshots from anon;

grant select on public.devices to authenticated;
grant select on public.access_events to authenticated;
grant select on public.security_alerts to authenticated;
grant select on public.camera_snapshots to authenticated;

drop policy if exists "authenticated_read_devices" on public.devices;
create policy "authenticated_read_devices"
on public.devices for select to authenticated using (true);

drop policy if exists "authenticated_read_access_events" on public.access_events;
create policy "authenticated_read_access_events"
on public.access_events for select to authenticated using (true);

drop policy if exists "authenticated_read_security_alerts" on public.security_alerts;
create policy "authenticated_read_security_alerts"
on public.security_alerts for select to authenticated using (true);

drop policy if exists "authenticated_read_camera_snapshots" on public.camera_snapshots;
create policy "authenticated_read_camera_snapshots"
on public.camera_snapshots for select to authenticated using (true);

-- 9. Insert initial default devices
insert into public.devices (id, name, device_type)
values
  ('gate-main', 'ESP32 Automatic Gate', 'GATE_CONTROLLER'),
  ('camera-stream', 'ESP32-CAM Stream + Face Detect', 'STREAM_CAMERA'),
  ('camera-hfr', 'ESP32-CAM HFR Recognition', 'HFR_CAMERA')
on conflict (id) do update set
  name = excluded.name,
  device_type = excluded.device_type;
