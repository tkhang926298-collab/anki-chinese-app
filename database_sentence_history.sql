-- Bảng lưu lịch sử câu đặt của user
-- Copy và chạy trong Supabase SQL Editor

create table if not exists public.sentence_history (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  card_id uuid,                         -- card đang học (nullable nếu offline)
  hanzi text not null,                  -- từ mục tiêu (chữ Hán)
  pinyin text,                          -- phiên âm từ mục tiêu
  meaning text,                         -- nghĩa tiếng Việt
  sentence text not null,               -- câu user đã viết
  is_correct boolean not null,
  score integer,                        -- 1-10 nếu có AI check
  feedback text,                        -- nhận xét bằng tiếng Việt
  correction text,                      -- câu sửa lại (nếu sai)
  checked_by text,                      -- 'groq' | 'openai' | 'languagetool' | 'cloudflare' | 'google' | 'heuristic'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS: chỉ user tự đọc/ghi record của mình
alter table public.sentence_history enable row level security;

create policy "Users can view own sentence history"
  on public.sentence_history for select
  using (auth.uid() = user_id);

create policy "Users can insert own sentence history"
  on public.sentence_history for insert
  with check (auth.uid() = user_id);

-- Index để query nhanh theo user và thời gian
create index if not exists sentence_history_user_id_idx on public.sentence_history(user_id, created_at desc);
create index if not exists sentence_history_hanzi_idx on public.sentence_history(user_id, hanzi);
