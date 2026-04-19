-- Persist "first line bold" display preference per note (mirrors UI `boldFirstLine`).
alter table public.notes
  add column if not exists bold_first_line boolean not null default false;

comment on column public.notes.bold_first_line is 'When true, render the first line of notes.text with emphasis in the client.';
