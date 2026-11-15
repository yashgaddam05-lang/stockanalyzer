-- Saved result of the temperament quiz: { score, bot, tolerance, answers, at }.
alter table public.user_preferences add column if not exists temperament jsonb;
