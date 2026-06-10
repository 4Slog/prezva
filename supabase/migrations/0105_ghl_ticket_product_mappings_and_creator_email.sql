-- GE-5a: GHL product→ticket type mapping table + embed event creator tracking

CREATE TABLE public.ticket_type_product_mappings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type_id   uuid NOT NULL REFERENCES public.ticket_types(id) ON DELETE CASCADE,
  event_id         uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL,
  ghl_location_id  text NOT NULL,
  ghl_product_id   text NOT NULL,
  ghl_price_id     text NOT NULL,
  ghl_product_name text,
  ghl_price_name   text,
  price_cents      integer,
  currency         text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_type_product_mappings ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX uq_ttpm_ticket_type ON public.ticket_type_product_mappings (ticket_type_id);
CREATE UNIQUE INDEX uq_ttpm_event_price ON public.ticket_type_product_mappings (event_id, ghl_price_id);
CREATE INDEX idx_ttpm_org ON public.ticket_type_product_mappings (org_id);
CREATE INDEX idx_ttpm_price ON public.ticket_type_product_mappings (ghl_price_id);

-- Track which GHL user (by email) created an event via the embed
ALTER TABLE public.events ADD COLUMN ghl_creator_email text;
