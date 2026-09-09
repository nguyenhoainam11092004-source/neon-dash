-- NEON DASH cloud save table.
--
-- One row per signed-in player, holding their whole SaveManager document as
-- JSONB (the same single-JSON-document shape the game already writes to
-- localStorage) rather than a normalised column per field — the save's shape
-- is owned by SaveData.ts/SaveMigration.ts on the client, and mirroring it as
-- one blob means a schema change there needs no matching migration here.
--
-- Row Level Security is the actual access control: a signed-in player can
-- only ever read or write the one row whose id is their own auth.uid(). Run
-- this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

create policy "Players can read their own save"
  on public.saves for select
  using (auth.uid() = user_id);

create policy "Players can insert their own save"
  on public.saves for insert
  with check (auth.uid() = user_id);

create policy "Players can update their own save"
  on public.saves for update
  using (auth.uid() = user_id);

-- Keeps updated_at accurate for anyone querying the table directly (the
-- client itself compares the updatedAt field already inside the JSON, not
-- this column, so this is bookkeeping rather than something the app reads).
create or replace function public.touch_saves_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_saves_updated_at on public.saves;
create trigger set_saves_updated_at
  before update on public.saves
  for each row
  execute function public.touch_saves_updated_at();
