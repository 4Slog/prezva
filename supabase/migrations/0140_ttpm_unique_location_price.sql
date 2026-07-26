-- R44: a GHL price belongs to exactly one event. GHL tracks inventory at the
-- PRICE level (price.trackInventory + availableQuantity), so two events
-- sharing one price would share one seat count — event A selling out would
-- block event B. A product IS allowed to be reused across events (inventory
-- is per-price, not per-product), so this constraint is deliberately on
-- (ghl_location_id, ghl_price_id), not on ghl_product_id.
--
-- Location-scoped rather than a bare UNIQUE(ghl_price_id) for multi-tenant
-- safety, consistent with how the payment webhook and the picker's guard
-- both already scope their lookups by location.
--
-- uq_ttpm_event_price (event_id, ghl_price_id) stays in place — it is now
-- redundant under this constraint, but dropping it is an unneeded write.
CREATE UNIQUE INDEX uq_ttpm_location_price
  ON public.ticket_type_product_mappings (ghl_location_id, ghl_price_id);
