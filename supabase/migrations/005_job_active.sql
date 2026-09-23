alter table jobs
add column if not exists is_active boolean not null default true;