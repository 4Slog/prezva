alter table public.issued_certificates
  add column ghl_synced_at timestamptz;

comment on column public.issued_certificates.ghl_synced_at is
  'R61: timestamp of a GENUINE GHL write success for this certificate — the merge-field
   PUT and the stage-move enqueue both completed. NULL means the GHL half never ran or
   failed, and is the signal the repair path keys on: issueCertificateCore, finding an
   existing certificate with ghl_synced_at NULL, re-runs the GHL half and stamps it.
   NEVER stamp on a skipped or failed GHL leg — a stamp on a failure permanently hides
   the certificate from repair. Certificates issued before this column existed are NULL
   and therefore repairable, which is correct: the embed path never wrote to GHL at all.';
