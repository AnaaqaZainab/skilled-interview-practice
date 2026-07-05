
CREATE TABLE public.favorite_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  interview_type text,
  difficulty text,
  interview_id uuid REFERENCES public.interviews(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, question)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_questions TO authenticated;
GRANT ALL ON public.favorite_questions TO service_role;
ALTER TABLE public.favorite_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own favorites" ON public.favorite_questions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX favorite_questions_user_idx ON public.favorite_questions(user_id, created_at DESC);
