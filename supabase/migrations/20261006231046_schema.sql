-- Hisab core schema. Spec: docs/superpowers/specs/2026-10-06-hisab-design.md §5
-- Conventions: client-generated UUIDv7 ids, user_id on every row, soft delete via deleted_at,
-- money as bigint minor units, enums as text + CHECK (PowerSync-friendly).

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text,
  base_currency text not null default 'BDT' check (base_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Dhaka',
  number_grouping text not null default 'south_asian' check (number_grouping in ('south_asian', 'western')),
  nudge_enabled boolean not null default true,
  nudge_time text not null default '21:00' check (nudge_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  lending_reminder_interval_days integer not null default 3 check (lending_reminder_interval_days between 1 and 60),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  app_lock_enabled boolean not null default false,
  hide_amounts boolean not null default false,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (user_id = id)
);

-- ---------------------------------------------------------------- accounts
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  type text not null check (type in ('cash', 'bank', 'mobile_wallet', 'card', 'savings')),
  opening_balance_minor bigint not null default 0,
  opening_date date not null default current_date,
  color text,
  icon text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------- categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  icon text,
  color text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------- parties
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  kind text not null default 'person' check (kind in ('person', 'company')),
  phone text check (phone is null or phone ~ '^\+[1-9]\d{6,14}$'),
  note text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------- loans (EMIs the user pays)
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  party_id uuid references public.parties (id) on delete set null,
  emi_amount_minor bigint not null check (emi_amount_minor > 0),
  total_installments integer not null check (total_installments between 1 and 600),
  first_due_date date not null,
  installments_paid_before integer not null default 0,
  default_account_id uuid references public.accounts (id) on delete set null,
  note text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (installments_paid_before between 0 and total_installments)
);

-- ---------------------------------------------------------------- lendings
create table public.lendings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  party_id uuid not null references public.parties (id) on delete cascade,
  direction text not null check (direction in ('lent', 'borrowed')),
  principal_minor bigint not null check (principal_minor > 0),
  started_on date not null,
  due_on date,
  reminder_interval_days integer check (reminder_interval_days is null or reminder_interval_days between 1 and 60),
  note text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (due_on is null or due_on >= started_on)
);

-- ---------------------------------------------------------------- recurring rules
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount_minor bigint not null check (amount_minor > 0),
  account_id uuid not null references public.accounts (id) on delete cascade,
  to_account_id uuid references public.accounts (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  party_id uuid references public.parties (id) on delete set null,
  note text,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  interval integer not null default 1 check (interval between 1 and 52),
  anchor_date date not null,
  end_date date,
  mode text not null default 'confirm' check (mode in ('confirm', 'auto')),
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((type = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id),
  check (type = 'transfer' or category_id is not null),
  check (end_date is null or end_date >= anchor_date)
);

create table public.recurring_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rule_id uuid not null references public.recurring_rules (id) on delete cascade,
  occurrence_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index recurring_skips_once on public.recurring_skips (rule_id, occurrence_date) where deleted_at is null;

-- ---------------------------------------------------------------- transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer', 'emi', 'lending_out', 'lending_in')),
  amount_minor bigint not null check (amount_minor > 0),
  account_id uuid not null references public.accounts (id) on delete cascade,
  to_account_id uuid references public.accounts (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  party_id uuid references public.parties (id) on delete set null,
  occurred_on date not null,
  occurred_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 500),
  original_amount_minor bigint check (original_amount_minor is null or original_amount_minor > 0),
  original_currency text check (original_currency is null or original_currency ~ '^[A-Z]{3}$'),
  fx_rate text check (fx_rate is null or fx_rate ~ '^\d{1,12}(\.\d{1,8})?$'),
  recurring_rule_id uuid references public.recurring_rules (id) on delete cascade,
  occurrence_date date,
  loan_id uuid references public.loans (id) on delete cascade,
  installment_number integer check (installment_number is null or installment_number >= 1),
  lending_id uuid references public.lendings (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tx_transfer_target check ((type = 'transfer') = (to_account_id is not null)),
  constraint tx_transfer_distinct check (to_account_id is null or to_account_id <> account_id),
  -- category: required for expense/income, forbidden otherwise. Rows are soft-deleted; hard deletes cascade (account deletion).
  constraint tx_category check ((type in ('expense', 'income')) = (category_id is not null)),
  constraint tx_emi check ((type = 'emi') = (loan_id is not null and installment_number is not null)),
  constraint tx_emi_only check (type = 'emi' or (loan_id is null and installment_number is null)),
  constraint tx_lending check ((type in ('lending_out', 'lending_in')) = (lending_id is not null)),
  constraint tx_fx_all_or_none check (
    (original_amount_minor is null) = (original_currency is null)
    and (original_currency is null) = (fx_rate is null)
  ),
  constraint tx_recurring_pair check ((recurring_rule_id is null) = (occurrence_date is null))
);

create unique index tx_recurring_once on public.transactions (recurring_rule_id, occurrence_date)
  where deleted_at is null and recurring_rule_id is not null;
create unique index tx_installment_once on public.transactions (loan_id, installment_number)
  where deleted_at is null and loan_id is not null;
create index tx_user_day on public.transactions (user_id, occurred_on desc);
create index tx_account on public.transactions (account_id);
create index tx_to_account on public.transactions (to_account_id) where to_account_id is not null;
create index tx_category on public.transactions (category_id) where category_id is not null;
create index tx_party on public.transactions (party_id) where party_id is not null;
create index tx_lending on public.transactions (lending_id) where lending_id is not null;

-- ---------------------------------------------------------------- lending reminders sent
create table public.lending_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lending_id uuid not null references public.lendings (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'sms', 'other')),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------- budgets
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade, -- null = overall monthly budget
  amount_minor bigint not null check (amount_minor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index budgets_one_per_category on public.budgets
  (user_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null;

-- ---------------------------------------------------------------- indexes + updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','accounts','categories','parties','loans','lendings','recurring_rules',
                           'recurring_skips','transactions','lending_reminders_sent','budgets'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    if t <> 'transactions' then
      execute format('create index %I on public.%I (user_id)', t || '_user_idx', t);
    end if;
  end loop;
end $$;

-- foreign-key helper indexes
create index loans_party_idx on public.loans (party_id);
create index loans_account_idx on public.loans (default_account_id);
create index lendings_party_idx on public.lendings (party_id);
create index recurring_account_idx on public.recurring_rules (account_id);
create index recurring_to_account_idx on public.recurring_rules (to_account_id);
create index recurring_category_idx on public.recurring_rules (category_id);
create index recurring_party_idx on public.recurring_rules (party_id);
create index tx_rule_idx on public.transactions (recurring_rule_id);
create index tx_loan_idx on public.transactions (loan_id);
create index reminders_lending_idx on public.lending_reminders_sent (lending_id);
create index budgets_category_idx on public.budgets (category_id);
