-- One-time codes for `..reset` master-key recovery (separate from sign-in email_otps).

create table if not exists public.master_key_reset_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists master_key_reset_otps_user_created_idx
  on public.master_key_reset_otps (user_id, created_at desc);

alter table public.master_key_reset_otps enable row level security;
