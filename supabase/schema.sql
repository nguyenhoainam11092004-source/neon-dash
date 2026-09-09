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
-- search_path is pinned so the function can't be tricked by an object
-- created earlier in a caller's search_path (Supabase security advisory
-- function_search_path_mutable).
create or replace function public.touch_saves_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_saves_updated_at on public.saves;
create trigger set_saves_updated_at
  before update on public.saves
  for each row
  execute function public.touch_saves_updated_at();

-- RLS above controls *who* can write a row; this controls *what* they can
-- write into it. Without it, the client (SaveManager/CloudSaveService) is the
-- only thing that ever computes currency, progress and stats, so a save
-- hand-edited in an exported JSON file and re-imported — or written directly
-- via the REST API with a player's own valid session — was accepted
-- verbatim. This can't tell a genuinely-earned stat from a forged one (that
-- needs server-replayed gameplay — a larger feature, see LeaderboardService's
-- design comment), but it does reject values real play cannot produce.
create or replace function public.validate_save_data()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  currency numeric;
  level_progress jsonb;
  stat_key text;
  stat_value text;
begin
  -- Real play earns currency from achievement rewards (655 total across the
  -- shipped catalogue) and 5 per collectible. 50000 leaves generous headroom
  -- for player-created levels with many collectibles while still rejecting
  -- an obviously fabricated value.
  currency := (new.data #>> '{inventory,currency}')::numeric;
  if currency is null or currency < 0 or currency > 50000 then
    raise exception 'saves.data.inventory.currency out of plausible range: %', currency;
  end if;

  for level_progress in
    select value from jsonb_each(coalesce(new.data->'progress', '{}'::jsonb))
  loop
    if coalesce((level_progress->>'bestProgress')::numeric, 0) not between 0 and 1 then
      raise exception 'saves.data.progress.bestProgress out of range: %', level_progress->>'bestProgress';
    end if;
    if coalesce((level_progress->>'bestPracticeProgress')::numeric, 0) not between 0 and 1 then
      raise exception 'saves.data.progress.bestPracticeProgress out of range: %', level_progress->>'bestPracticeProgress';
    end if;
    if coalesce((level_progress->>'attempts')::numeric, 0) < 0 then
      raise exception 'saves.data.progress.attempts is negative: %', level_progress->>'attempts';
    end if;
    if coalesce((level_progress->>'timePlayed')::numeric, 0) < 0 then
      raise exception 'saves.data.progress.timePlayed is negative: %', level_progress->>'timePlayed';
    end if;
  end loop;

  -- Every lifetime counter (totalAttempts, totalDeaths, coinsCollected, ...)
  -- must be a non-negative number; none of them can legitimately go backward.
  for stat_key, stat_value in
    select key, value from jsonb_each_text(coalesce(new.data->'stats', '{}'::jsonb))
  loop
    if stat_value !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'saves.data.stats.% is not a non-negative number: %', stat_key, stat_value;
    end if;
  end loop;

  for stat_key, stat_value in
    select key, value ->> 'progress'
    from jsonb_each(coalesce(new.data->'achievements', '{}'::jsonb)) as t(key, value)
  loop
    if stat_value is not null and stat_value !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'saves.data.achievements.%.progress is not a non-negative number: %', stat_key, stat_value;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists validate_saves_data on public.saves;
create trigger validate_saves_data
  before insert or update on public.saves
  for each row
  execute function public.validate_save_data();
