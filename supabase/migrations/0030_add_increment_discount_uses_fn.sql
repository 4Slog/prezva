-- B2-2: Create increment_discount_uses RPC function
-- Called by Stripe webhook after checkout.session.completed when a discount code was applied.
-- Atomically increments uses_count so concurrent webhooks cannot double-count.

-- discount_codes has no updated_at column in the initial schema — add it first
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION public.increment_discount_uses(code_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.discount_codes
  SET uses_count = uses_count + 1,
      updated_at = now()
  WHERE id = code_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_discount_uses(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_discount_uses(uuid) TO authenticated;

COMMENT ON FUNCTION public.increment_discount_uses(uuid) IS
  'Atomically increments discount_codes.uses_count. Called by Stripe webhook after successful checkout.';
