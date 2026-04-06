-- Phase 2: custom OTP auth (send-code only). Edge Function uses service role.

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);

create table if not exists public.email_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists email_otps_user_id_idx on public.email_otps (user_id);
create index if not exists email_otps_expires_at_idx on public.email_otps (expires_at);

alter table public.users enable row level security;
alter table public.email_otps enable row level security;

-- No policies: anon cannot read/write; Edge Function uses service role.
