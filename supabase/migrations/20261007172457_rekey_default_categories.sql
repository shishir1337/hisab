-- Re-key default categories created before 20261007170730 to the deterministic md5 ids, so devices
-- that seed defaults offline converge with the server instead of duplicating them. Only rows that
-- nothing references yet are touched (ids are primary keys referenced by transactions/rules/budgets).
do $$
declare r record;
begin
  for r in
    select c.id, md5(c.user_id::text || ':' || c.kind || ':' || c.name)::uuid as new_id
    from public.categories c
    join (values
      ('Food','expense'),('Groceries','expense'),('Transport','expense'),('Bills & Utilities','expense'),
      ('Rent','expense'),('Health','expense'),('Shopping','expense'),('Family','expense'),('Education','expense'),
      ('Fun','expense'),('Personal Care','expense'),('Gifts','expense'),('Other','expense'),
      ('Salary','income'),('Project / Freelance','income'),('Bonus','income'),('Refund','income'),('Other','income')
    ) d(name, kind) on d.name = c.name and d.kind = c.kind
    where c.id <> md5(c.user_id::text || ':' || c.kind || ':' || c.name)::uuid
      and not exists (select 1 from public.transactions t where t.category_id = c.id)
      and not exists (select 1 from public.recurring_rules rr where rr.category_id = c.id)
      and not exists (select 1 from public.budgets b where b.category_id = c.id)
      and not exists (select 1 from public.categories x where x.id = md5(c.user_id::text || ':' || c.kind || ':' || c.name)::uuid)
  loop
    update public.categories set id = r.new_id where id = r.id;
  end loop;
end $$;
