-- API keys table for the public read-only API
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz,
  request_count bigint DEFAULT 0
);

CREATE INDEX api_keys_hash_idx ON public.api_keys (key_hash) WHERE is_active = true;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- No permissive policies: anon/authenticated cannot access this table.
-- The service role bypasses RLS automatically.

-- Atomic usage tracking called fire-and-forget on each API request
CREATE OR REPLACE FUNCTION public.increment_api_key_usage(key_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.api_keys
  SET request_count = request_count + 1,
      last_used_at = now()
  WHERE id = key_id;
$$;
