CREATE TABLE IF NOT EXISTS public.community_reply_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  milestone int NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, milestone)
);
ALTER TABLE public.community_reply_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_reply_milestones_service_only" ON public.community_reply_milestones
  FOR ALL TO service_role USING (true) WITH CHECK (true);
