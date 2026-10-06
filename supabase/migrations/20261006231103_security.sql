-- RLS, cross-user reference protection, signup bootstrap. Spec §5.3, §8.

-- ---------------------------------------------------------------- RLS: own rows only
do $$
declare t text;
begin
  foreach t in array array['profiles','accounts','categories','parties','loans','lendings','recurring_rules',
                           'recurring_skips','transactions','lending_reminders_sent','budgets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$create policy own_rows_select on public.%I for select to authenticated
                     using (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy own_rows_insert on public.%I for insert to authenticated
                     with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy own_rows_update on public.%I for update to authenticated
                     using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy own_rows_delete on public.%I for delete to authenticated
                     using (user_id = (select auth.uid()))$p$, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- referenced rows must share the owner
-- Trigger args: 'column:table' pairs. Security definer so it can see the referenced row regardless of RLS,
-- and compares owners explicitly.
create or replace function public.assert_same_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  arg text;
  col text;
  tbl text;
  ref uuid;
  ok boolean;
begin
  foreach arg in array tg_argv loop
    col := split_part(arg, ':', 1);
    tbl := split_part(arg, ':', 2);
    ref := (to_jsonb(new) ->> col)::uuid;
    if ref is not null then
      execute format('select exists (select 1 from public.%I where id = $1 and user_id = $2)', tbl)
        into ok using ref, new.user_id;
      if not ok then
        raise exception 'foreign key owner mismatch' using errcode = 'P0001', detail = col;
      end if;
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.assert_same_owner() from public, anon, authenticated;

create trigger loans_same_owner before insert or update on public.loans for each row
  execute function public.assert_same_owner('party_id:parties', 'default_account_id:accounts');
create trigger lendings_same_owner before insert or update on public.lendings for each row
  execute function public.assert_same_owner('party_id:parties');
create trigger recurring_rules_same_owner before insert or update on public.recurring_rules for each row
  execute function public.assert_same_owner('account_id:accounts', 'to_account_id:accounts', 'category_id:categories', 'party_id:parties');
create trigger recurring_skips_same_owner before insert or update on public.recurring_skips for each row
  execute function public.assert_same_owner('rule_id:recurring_rules');
create trigger transactions_same_owner before insert or update on public.transactions for each row
  execute function public.assert_same_owner('account_id:accounts', 'to_account_id:accounts', 'category_id:categories',
    'party_id:parties', 'recurring_rule_id:recurring_rules', 'loan_id:loans', 'lending_id:lendings');
create trigger lending_reminders_same_owner before insert or update on public.lending_reminders_sent for each row
  execute function public.assert_same_owner('lending_id:lendings');
create trigger budgets_same_owner before insert or update on public.budgets for each row
  execute function public.assert_same_owner('category_id:categories');

-- ---------------------------------------------------------------- signup bootstrap
create or replace function public.seed_default_categories(uid uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.categories (user_id, name, kind, icon, color, sort_order)
  select uid, v.name, v.kind, v.icon, v.color, v.ord
  from (values
    ('Food',              'expense', '🍛', 'amber',  1),
    ('Groceries',         'expense', '🛒', 'green',  2),
    ('Transport',         'expense', '🚕', 'blue',   3),
    ('Bills & Utilities', 'expense', '💡', 'teal',   4),
    ('Rent',              'expense', '🏠', 'violet', 5),
    ('Health',            'expense', '💊', 'rose',   6),
    ('Shopping',          'expense', '🛍️', 'orange', 7),
    ('Family',            'expense', '👪', 'rose',   8),
    ('Education',         'expense', '📚', 'blue',   9),
    ('Fun',               'expense', '🎬', 'violet', 10),
    ('Personal Care',     'expense', '🧴', 'teal',   11),
    ('Gifts',             'expense', '🎁', 'orange', 12),
    ('Other',             'expense', '•',  'slate',  13),
    ('Salary',            'income',  '💼', 'green',  1),
    ('Project / Freelance','income', '🧑‍💻', 'blue',   2),
    ('Bonus',             'income',  '✨', 'amber',  3),
    ('Refund',            'income',  '↩️', 'teal',   4),
    ('Other',             'income',  '•',  'slate',  5)
  ) as v(name, kind, icon, color, ord);
$$;
revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, user_id, display_name)
  values (new.id, new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  perform public.seed_default_categories(new.id);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- PowerSync logical replication
create publication powersync for table
  public.profiles, public.accounts, public.categories, public.parties, public.loans, public.lendings,
  public.recurring_rules, public.recurring_skips, public.transactions, public.lending_reminders_sent, public.budgets;
