create table if not exists dashboard_snapshots (
  workspace_key text primary key,
  version bigint not null default 1,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists line_connections (
  connection_key text primary key check (connection_key = 'primary'),
  status text not null check (status in ('not_connected', 'pairing', 'connected', 'disabled')),
  encrypted_user_id text,
  display_name text,
  paired_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists line_pairing_codes (
  id uuid primary key,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists line_webhook_events (
  webhook_event_id text primary key,
  received_at timestamptz not null default now()
);

create table if not exists line_deliveries (
  id uuid primary key,
  idempotency_key text not null unique,
  content_id text not null,
  content_revision text not null,
  asset_id text not null,
  caption_snapshot text not null,
  status text not null check (status in ('queued', 'sent', 'failed')),
  attempt_count integer not null default 0,
  error_category text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
