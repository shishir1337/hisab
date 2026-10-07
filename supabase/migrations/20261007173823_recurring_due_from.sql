-- Occurrences before `due_from` are never due: set when a rule is resumed or its schedule changes,
-- so pausing/rescheduling never back-posts old salaries or rents.
alter table public.recurring_rules add column due_from date;
