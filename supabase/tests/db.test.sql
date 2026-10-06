-- Hisab database tests. Self-contained: runs in one transaction and rolls back, so it is safe against
-- any environment (local, remote via MCP `execute_sql`, or `psql -f`). Output: one row per assertion;
-- the suite passes when no row has ok = false.
begin;

create schema tests;
create table tests.results (id serial primary key, ok boolean not null, name text not null, detail text);
grant usage on schema tests to authenticated, anon;
grant insert, select on tests.results to authenticated, anon;
grant usage on sequence tests.results_id_seq to authenticated, anon;

create function tests.log(ok boolean, name text, detail text default null) returns void
language sql security definer as $$ insert into tests.results (ok, name, detail) values (ok, name, detail) $$;

create function tests.is(got anyelement, want anyelement, name text) returns void
language plpgsql as $$
begin
  perform tests.log(got is not distinct from want, name, format('got %s, want %s', got, want));
end $$;

-- Runs sql as the current role; passes if it raises the given SQLSTATE (and message, if given).
create function tests.throws(sql text, state text, name text, msg text default null) returns void
language plpgsql as $$
begin
  execute sql;
  perform tests.log(false, name, 'did not raise');
exception when others then
  perform tests.log(sqlstate = state and (msg is null or sqlerrm = msg), name, format('%s: %s', sqlstate, sqlerrm));
end $$;

create function tests.lives(sql text, name text) returns void
language plpgsql as $$
begin
  execute sql;
  perform tests.log(true, name);
exception when others then
  perform tests.log(false, name, format('%s: %s', sqlstate, sqlerrm));
end $$;

create function tests.as_user(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

grant execute on all functions in schema tests to authenticated, anon;

-- users: A, B, C
insert into auth.users (id, email, aud, role, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.dev', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}', '{"full_name":"Amaiz"}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.dev', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-000000000003', 'c@test.dev', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

-- ================================================================ signup bootstrap
select tests.is((select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 1, 'signup: profile created');
select tests.is((select base_currency from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'BDT', 'signup: default currency BDT');
select tests.is((select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'Amaiz', 'signup: display name from metadata');
select tests.is((select count(*)::int from public.categories where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and kind = 'expense'), 13, 'signup: 13 expense categories');
select tests.is((select count(*)::int from public.categories where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and kind = 'income'), 5, 'signup: 5 income categories');

-- ================================================================ RLS isolation
select tests.as_user('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.accounts (id, name, type) values ('aaaaaaaa-0000-7000-8000-00000000a001', 'Cash A', 'cash');
insert into public.transactions (id, type, amount_minor, account_id, category_id, occurred_on)
  select 'aaaaaaaa-0000-7000-8000-00000000a002', 'expense', 3000, 'aaaaaaaa-0000-7000-8000-00000000a001', id, current_date
  from public.categories where kind = 'expense' order by sort_order limit 1;
select tests.is((select count(*)::int from public.accounts), 1, 'rls: A sees own account');
select tests.is((select user_id from public.accounts where id = 'aaaaaaaa-0000-7000-8000-00000000a001'), 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'rls: user_id defaults to auth.uid()');

select tests.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select tests.is((select count(*)::int from public.accounts), 0, 'rls: B cannot see A accounts');
select tests.is((select count(*)::int from public.transactions), 0, 'rls: B cannot see A transactions');
select tests.is((select count(*)::int from public.profiles), 1, 'rls: B sees only own profile');
select tests.is((select count(*)::int from public.categories), 18, 'rls: B sees only own categories');
update public.accounts set name = 'hacked' where id = 'aaaaaaaa-0000-7000-8000-00000000a001';
delete from public.accounts where id = 'aaaaaaaa-0000-7000-8000-00000000a001';
select tests.throws($q$insert into public.accounts (name, type, user_id) values ('x', 'cash', 'aaaaaaaa-0000-4000-8000-000000000001')$q$, '42501', 'rls: B cannot insert as A');
insert into public.accounts (id, name, type) values ('bbbbbbbb-0000-7000-8000-00000000b001', 'Cash B', 'cash');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, to_account_id, occurred_on)
  values ('transfer', 100, 'bbbbbbbb-0000-7000-8000-00000000b001', 'aaaaaaaa-0000-7000-8000-00000000a001', current_date)$q$,
  'P0001', 'rls: B cannot reference A account', 'foreign key owner mismatch');
select tests.throws($q$update public.accounts set user_id = 'aaaaaaaa-0000-4000-8000-000000000001' where id = 'bbbbbbbb-0000-7000-8000-00000000b001'$q$, '42501', 'rls: B cannot move a row to A');

select tests.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select tests.is((select name from public.accounts where id = 'aaaaaaaa-0000-7000-8000-00000000a001'), 'Cash A', 'rls: B update/delete had no effect on A');

reset role;
set local role anon;
select tests.throws($q$select count(*) from public.accounts$q$, '42501', 'rls: anon has no table access');
reset role;

-- ================================================================ constraints (as user C)
select tests.as_user('cccccccc-0000-4000-8000-000000000003');
insert into public.accounts (id, name, type) values
  ('cccccccc-0000-7000-8000-0000000c0001', 'Cash', 'cash'),
  ('cccccccc-0000-7000-8000-0000000c0002', 'Bank', 'bank');
insert into public.parties (id, name, kind, phone) values ('cccccccc-0000-7000-8000-0000000c0003', 'Rafiq', 'person', '+8801712345621');
insert into public.loans (id, name, emi_amount_minor, total_installments, first_due_date)
  values ('cccccccc-0000-7000-8000-0000000c0004', 'Home loan', 1500000, 24, '2026-01-10');
insert into public.lendings (id, party_id, direction, principal_minor, started_on)
  values ('cccccccc-0000-7000-8000-0000000c0005', 'cccccccc-0000-7000-8000-0000000c0003', 'lent', 1000000, '2026-09-02');
insert into public.recurring_rules (id, type, amount_minor, account_id, category_id, frequency, interval, anchor_date)
  select 'cccccccc-0000-7000-8000-0000000c0006', 'expense', 100000, 'cccccccc-0000-7000-8000-0000000c0001', id, 'monthly', 1, '2026-01-01'
  from public.categories where kind = 'expense' order by sort_order limit 1;
create temp table cat as select id from public.categories where kind = 'expense' order by sort_order limit 1;
grant select on cat to authenticated;

select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, category_id, occurred_on) values ('expense', 0, 'cccccccc-0000-7000-8000-0000000c0001', (select id from cat), current_date)$q$, '23514', 'tx: zero amount rejected');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, category_id, occurred_on) values ('expense', -5, 'cccccccc-0000-7000-8000-0000000c0001', (select id from cat), current_date)$q$, '23514', 'tx: negative amount rejected');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, occurred_on) values ('expense', 100, 'cccccccc-0000-7000-8000-0000000c0001', current_date)$q$, '23514', 'tx: expense without category rejected');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, occurred_on) values ('transfer', 100, 'cccccccc-0000-7000-8000-0000000c0001', current_date)$q$, '23514', 'tx: transfer without target rejected');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, to_account_id, occurred_on) values ('transfer', 100, 'cccccccc-0000-7000-8000-0000000c0001', 'cccccccc-0000-7000-8000-0000000c0001', current_date)$q$, '23514', 'tx: transfer to same account rejected');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, to_account_id, category_id, occurred_on) values ('transfer', 100, 'cccccccc-0000-7000-8000-0000000c0001', 'cccccccc-0000-7000-8000-0000000c0002', (select id from cat), current_date)$q$, '23514', 'tx: transfer with category rejected');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, occurred_on) values ('emi', 100, 'cccccccc-0000-7000-8000-0000000c0001', current_date)$q$, '23514', 'tx: emi without loan rejected');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, occurred_on) values ('lending_in', 100, 'cccccccc-0000-7000-8000-0000000c0001', current_date)$q$, '23514', 'tx: lending_in without lending rejected');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, category_id, occurred_on) values ('bogus', 100, 'cccccccc-0000-7000-8000-0000000c0001', (select id from cat), current_date)$q$, '23514', 'tx: unknown type rejected');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, category_id, original_amount_minor, occurred_on) values ('expense', 100, 'cccccccc-0000-7000-8000-0000000c0001', (select id from cat), 50, current_date)$q$, '23514', 'tx: partial fx fields rejected');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, category_id, original_amount_minor, original_currency, fx_rate, occurred_on) values ('income', 100, 'cccccccc-0000-7000-8000-0000000c0001', (select id from cat), 50, 'USD', '12,1', current_date)$q$, '23514', 'tx: malformed fx rate rejected');

select tests.lives($q$insert into public.transactions (type, amount_minor, account_id, to_account_id, occurred_on) values ('transfer', 100, 'cccccccc-0000-7000-8000-0000000c0001', 'cccccccc-0000-7000-8000-0000000c0002', current_date)$q$, 'tx: valid transfer ok');
select tests.lives($q$insert into public.transactions (type, amount_minor, account_id, category_id, original_amount_minor, original_currency, fx_rate, occurred_on) values ('income', 6070000, 'cccccccc-0000-7000-8000-0000000c0001', (select id from cat), 50000, 'USD', '121.4', current_date)$q$, 'tx: valid fx income ok');

-- recurring: one post per (rule, occurrence); soft-deleted occurrence does not block
insert into public.transactions (id, type, amount_minor, account_id, category_id, recurring_rule_id, occurrence_date, occurred_on)
  values ('cccccccc-0000-7000-8000-0000000c0010', 'expense', 100000, 'cccccccc-0000-7000-8000-0000000c0001', (select id from cat), 'cccccccc-0000-7000-8000-0000000c0006', '2026-10-01', '2026-10-01');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, category_id, recurring_rule_id, occurrence_date, occurred_on) values ('expense', 100000, 'cccccccc-0000-7000-8000-0000000c0001', (select id from cat), 'cccccccc-0000-7000-8000-0000000c0006', '2026-10-01', '2026-10-01')$q$, '23505', 'recurring: duplicate occurrence rejected');
update public.transactions set deleted_at = now() where id = 'cccccccc-0000-7000-8000-0000000c0010';
select tests.lives($q$insert into public.transactions (type, amount_minor, account_id, category_id, recurring_rule_id, occurrence_date, occurred_on) values ('expense', 100000, 'cccccccc-0000-7000-8000-0000000c0001', (select id from cat), 'cccccccc-0000-7000-8000-0000000c0006', '2026-10-01', '2026-10-01')$q$, 'recurring: soft-deleted occurrence allows re-post');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, category_id, recurring_rule_id, occurred_on) values ('expense', 100000, 'cccccccc-0000-7000-8000-0000000c0001', (select id from cat), 'cccccccc-0000-7000-8000-0000000c0006', current_date)$q$, '23514', 'recurring: rule without occurrence date rejected');

-- emi: one post per installment
insert into public.transactions (type, amount_minor, account_id, loan_id, installment_number, occurred_on)
  values ('emi', 1500000, 'cccccccc-0000-7000-8000-0000000c0001', 'cccccccc-0000-7000-8000-0000000c0004', 1, current_date);
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, loan_id, installment_number, occurred_on) values ('emi', 1500000, 'cccccccc-0000-7000-8000-0000000c0001', 'cccccccc-0000-7000-8000-0000000c0004', 1, current_date)$q$, '23505', 'emi: duplicate installment rejected');
select tests.throws($q$insert into public.transactions (type, amount_minor, account_id, category_id, loan_id, occurred_on) values ('expense', 100, 'cccccccc-0000-7000-8000-0000000c0001', (select id from cat), 'cccccccc-0000-7000-8000-0000000c0004', current_date)$q$, '23514', 'emi: loan on non-emi rejected');

-- lending
select tests.lives($q$insert into public.transactions (type, amount_minor, account_id, lending_id, occurred_on) values ('lending_in', 500000, 'cccccccc-0000-7000-8000-0000000c0001', 'cccccccc-0000-7000-8000-0000000c0005', current_date)$q$, 'lending: repayment ok');
select tests.throws($q$insert into public.lendings (party_id, direction, principal_minor, started_on) values ('cccccccc-0000-7000-8000-0000000c0003', 'sideways', 100, current_date)$q$, '23514', 'lending: bad direction rejected');
select tests.throws($q$insert into public.lendings (party_id, direction, principal_minor, started_on, due_on) values ('cccccccc-0000-7000-8000-0000000c0003', 'lent', 100, '2026-10-05', '2026-10-01')$q$, '23514', 'lending: due before start rejected');

-- other tables
select tests.throws($q$insert into public.loans (name, emi_amount_minor, total_installments, first_due_date) values ('x', 100, 0, current_date)$q$, '23514', 'loan: zero installments rejected');
select tests.throws($q$insert into public.loans (name, emi_amount_minor, total_installments, first_due_date, installments_paid_before) values ('x', 100, 12, current_date, 13)$q$, '23514', 'loan: paid-before over total rejected');
select tests.throws($q$insert into public.budgets (amount_minor) values (0)$q$, '23514', 'budget: zero rejected');
insert into public.budgets (amount_minor) values (3000000);
select tests.throws($q$insert into public.budgets (amount_minor) values (100)$q$, '23505', 'budget: one overall budget');
select tests.throws($q$insert into public.parties (name, phone) values ('x', '01712')$q$, '23514', 'party: non-E.164 phone rejected');
select tests.throws($q$insert into public.recurring_rules (type, amount_minor, account_id, frequency, anchor_date) values ('expense', 100, 'cccccccc-0000-7000-8000-0000000c0001', 'monthly', current_date)$q$, '23514', 'recurring: expense rule without category rejected');
select tests.throws($q$update public.profiles set number_grouping = 'indian'$q$, '23514', 'profile: bad grouping rejected');

-- updated_at trigger
update public.accounts set updated_at = '2000-01-01', name = 'Cash 2' where id = 'cccccccc-0000-7000-8000-0000000c0001';
select tests.is((select updated_at > '2001-01-01' from public.accounts where id = 'cccccccc-0000-7000-8000-0000000c0001'), true, 'updated_at bumped on update');

reset role;
select count(*) filter (where ok) as passed, count(*) as total,
  json_agg(json_build_object('name', name, 'detail', detail)) filter (where not ok) as failures
from tests.results;
rollback;
