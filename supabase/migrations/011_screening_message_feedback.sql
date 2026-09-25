create table if not exists screening_message_feedback (
  id uuid default gen_random_uuid() primary key,
  screening_id uuid not null references screenings(id) on delete cascade,
  message_index int not null,
  feedback text not null check (feedback in ('like', 'dislike')),
  created_at timestamp default now(),
  unique(screening_id, message_index)
);

create index if not exists idx_screening_message_feedback_screening_id
  on screening_message_feedback(screening_id);
