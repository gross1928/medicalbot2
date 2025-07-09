-- Enable Row Level Security (RLS)
-- This is a good practice for security in Supabase.

-- 1. USERS table
-- Stores information about the bot's users.
CREATE TABLE public.users (
  id BIGINT NOT NULL PRIMARY KEY, -- Telegram User ID
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Enable RLS for the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- Policy: Users can see their own data.
CREATE POLICY "Allow individual user access" ON public.users FOR SELECT
USING (auth.uid() = id::uuid);
-- Policy: Allow service roles to insert data (for our bot)
CREATE POLICY "Allow service role insert" ON public.users FOR INSERT
WITH CHECK (true);


-- 2. ANALYSES table
-- Stores the history of analyses for each user.
CREATE TABLE public.analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  input_text TEXT, -- For text-based submissions
  file_url TEXT, -- For file/photo submissions (URL to Supabase Storage)
  raw_openai_response JSONB, -- To store the full response from GPT
  status TEXT DEFAULT 'pending' -- e.g., 'pending', 'processing', 'completed', 'error'
);
-- Enable RLS
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
-- Policy: Users can see their own analyses.
CREATE POLICY "Allow individual user access" ON public.analyses FOR SELECT
USING (auth.uid() = user_id::uuid);
-- Policy: Allow service roles to manage data
CREATE POLICY "Allow service role access" ON public.analyses FOR ALL
USING (true) WITH CHECK (true);


-- 3. RECOMMENDATIONS table
-- Stores the recommendations generated from an analysis.
CREATE TABLE public.recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES public.analyses(id),
  user_id BIGINT NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  recommendation_text TEXT NOT NULL
);
-- Enable RLS
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
-- Policy: Users can see their own recommendations.
CREATE POLICY "Allow individual user access" ON public.recommendations FOR SELECT
USING (auth.uid() = user_id::uuid);
-- Policy: Allow service roles to manage data
CREATE POLICY "Allow service role access" ON public.recommendations FOR ALL
USING (true) WITH CHECK (true);
