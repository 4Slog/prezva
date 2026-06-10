-- Rebind GHL location 4KrDX2FYA2XZ68q88rFS to opensource-atl org for richer demo data
UPDATE public.ghl_location_links
SET org_id = '44444444-4444-4444-8444-444444444401'
WHERE ghl_location_id = '4KrDX2FYA2XZ68q88rFS';
