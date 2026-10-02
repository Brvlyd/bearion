-- Background jobs, scheduled from Supabase instead of the host.
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- Vercel's free plan only runs cron once a day, but PayPal reconcile needs to
-- run every 15 minutes. pg_cron (the same extension order-integrity-guards.sql
-- uses) fires on schedule and pg_net makes the HTTP call to the store.
--
-- The shared secrets are read from Supabase Vault at run time, never written
-- into this file or the cron table, so rotating a secret is a Vault update
-- (vault.update_secret) plus the same value in the host's env vars. No need to
-- re-run this file.
--
-- Before running:
--   1. Database -> Extensions: enable "pg_cron" and "pg_net".
--   2. Store the secrets (same values as the host's env vars):
--        select vault.create_secret('<PAYPAL_SYNC_SECRET>', 'paypal_sync_secret');
--        select vault.create_secret('<SHIPPING_SYNC_SECRET>', 'shipping_sync_secret');  -- optional
--   3. If the store moves to another domain, change site_url below and re-run.
--
-- Check it ran:  select * from cron.job_run_details order by start_time desc limit 10;
--                select status_code, content from net._http_response order by created desc limit 10;

DO $$
DECLARE
  site_url CONSTANT TEXT := 'https://www.bearions.store';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron is not enabled. Database -> Extensions -> enable "pg_cron", then re-run.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'pg_net is not enabled. Database -> Extensions -> enable "pg_net", then re-run.';
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN ('paypal-reconcile', 'shipping-sync-tracking');

  -- Every 15 minutes: finish PayPal payments whose browser capture never
  -- completed (see app/api/paypal/reconcile/route.ts).
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'paypal_sync_secret') THEN
    PERFORM cron.schedule(
      'paypal-reconcile',
      '*/15 * * * *',
      format(
        $job$
        SELECT net.http_post(
          url := %L,
          body := '{}'::jsonb,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'paypal_sync_secret')
          ),
          timeout_milliseconds := 30000
        )
        $job$,
        site_url || '/api/paypal/reconcile'
      )
    );
  ELSE
    RAISE NOTICE 'Vault secret "paypal_sync_secret" missing: PayPal reconcile NOT scheduled.';
  END IF;

  -- 08:00 and 20:00 WIB (01:00 and 13:00 UTC): refresh parcel tracking.
  -- Only useful while the Biteship account has balance.
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'shipping_sync_secret') THEN
    PERFORM cron.schedule(
      'shipping-sync-tracking',
      '0 1,13 * * *',
      format(
        $job$
        SELECT net.http_post(
          url := %L,
          body := '{}'::jsonb,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'shipping_sync_secret')
          ),
          timeout_milliseconds := 30000
        )
        $job$,
        site_url || '/api/shipping/sync-tracking'
      )
    );
  ELSE
    RAISE NOTICE 'Vault secret "shipping_sync_secret" missing: tracking sync NOT scheduled.';
  END IF;
END;
$$;
