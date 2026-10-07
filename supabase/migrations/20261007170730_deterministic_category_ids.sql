-- Default category ids are deterministic: md5(user_id || ':' || kind || ':' || name)::uuid.
-- The apps seed the same rows locally when offline / before sync (packages/db/src/defaults.ts),
-- so the later upload is an idempotent upsert instead of a duplicate set of categories.
create or replace function public.seed_default_categories(uid uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.categories (id, user_id, name, kind, icon, color, sort_order)
  select md5(uid::text || ':' || v.kind || ':' || v.name)::uuid, uid, v.name, v.kind, v.icon, v.color, v.ord
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
  ) as v(name, kind, icon, color, ord)
  on conflict (id) do nothing;
$$;
revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;
