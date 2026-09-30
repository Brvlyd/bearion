-- Order integrity guards. Run in Supabase SQL Editor. Safe to run more than once.
--
-- 1. Stock can no longer go negative.
--    /api/orders/create checks stock before inserting, but two customers
--    checking out the last unit at the same moment both passed that check and
--    the trigger happily took stock below zero (overselling). The trigger now
--    only decrements when enough stock is left, and otherwise aborts the insert
--    with INSUFFICIENT_STOCK, which the API turns into a friendly 409.
--
-- 2. Customers can only touch the payment columns their flow needs.
--    add-user-payments-update-policy.sql lets a customer UPDATE their own
--    payment row so they can attach a transfer proof — but RLS cannot limit
--    columns, so the same policy also let them rewrite amount, currency,
--    transaction_id, status 'success', or mark their own proof 'verified'
--    directly through the public Supabase API. A trigger now rejects any
--    customer change outside the proof-upload fields.
--
-- 3. Unpaid orders expire.
--    Stock is reserved at checkout, not at payment. A customer who closes the
--    PayPal window or never transfers used to lock that stock forever.
--    expire_stale_pending_orders() cancels pending, unpaid orders with no proof
--    uploaded after 24 hours and gives their stock back. Section 3b schedules it
--    hourly when the pg_cron extension is enabled.

-- ---------------------------------------------------------------------------
-- 1. Stock guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_product_stock_after_order()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- The row lock taken by this UPDATE serialises concurrent checkouts for the
  -- same product, so the second buyer sees the already-reduced stock.
  UPDATE products
  SET stock = stock - NEW.quantity
  WHERE id = NEW.product_id
    AND stock >= NEW.quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK'
      USING DETAIL = 'product_id=' || NEW.product_id::text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-declared here so this file works even if customer-cancel-pending-order.sql
-- was never run.
CREATE OR REPLACE FUNCTION restore_order_stock(target_order_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE products
  SET stock = products.stock + order_items.quantity
  FROM order_items
  WHERE order_items.order_id = target_order_id
    AND order_items.product_id = products.id;
$$;

REVOKE ALL ON FUNCTION restore_order_stock(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION restore_order_stock(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Customer payment update guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_customer_payment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Columns the proof-upload flow (lib/payments.ts) is allowed to write.
  customer_columns TEXT[] := ARRAY[
    'status',
    'payment_proof_url',
    'proof_verification_status',
    'proof_verified_by',
    'proof_verified_at',
    'gateway_response',
    'updated_at'
  ];
  new_row JSONB := to_jsonb(NEW);
  old_row JSONB := to_jsonb(OLD);
BEGIN
  -- Service role (API routes) and the SQL editor run without a user id.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins review proofs and edit payments from the dashboard.
  IF EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
     OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN NEW;
  END IF;

  -- jsonb keeps this working whether or not the optional proof_* columns exist.
  IF (new_row - customer_columns) IS DISTINCT FROM (old_row - customer_columns) THEN
    RAISE EXCEPTION 'PAYMENT_FIELD_LOCKED'
      USING DETAIL = 'Customers may only attach a payment proof.';
  END IF;

  IF new_row->>'status' IS DISTINCT FROM old_row->>'status'
     AND new_row->>'status' NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'PAYMENT_FIELD_LOCKED'
      USING DETAIL = 'Customers cannot set payment status to ' || (new_row->>'status');
  END IF;

  IF new_row->>'proof_verification_status' IS DISTINCT FROM old_row->>'proof_verification_status'
     AND new_row->>'proof_verification_status' <> 'pending' THEN
    RAISE EXCEPTION 'PAYMENT_FIELD_LOCKED'
      USING DETAIL = 'Customers cannot verify their own payment proof.';
  END IF;

  IF new_row->>'proof_verified_by' IS NOT NULL
     AND new_row->>'proof_verified_by' IS DISTINCT FROM old_row->>'proof_verified_by' THEN
    RAISE EXCEPTION 'PAYMENT_FIELD_LOCKED'
      USING DETAIL = 'Customers cannot verify their own payment proof.';
  END IF;

  -- PayPal's gateway_response is the audit trail of a real capture.
  IF old_row->>'payment_gateway' = 'paypal'
     AND new_row->'gateway_response' IS DISTINCT FROM old_row->'gateway_response' THEN
    RAISE EXCEPTION 'PAYMENT_FIELD_LOCKED'
      USING DETAIL = 'PayPal payment records are managed by the server.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_customer_payment_update ON payments;
CREATE TRIGGER guard_customer_payment_update
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION guard_customer_payment_update();

-- ---------------------------------------------------------------------------
-- 3. Expire unpaid orders
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION expire_stale_pending_orders(max_age INTERVAL DEFAULT INTERVAL '24 hours')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stale RECORD;
  expired_count INTEGER := 0;
BEGIN
  FOR stale IN
    SELECT o.id
    FROM orders o
    WHERE o.status = 'pending'
      AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
      AND o.created_at < NOW() - max_age
      -- Never expire an order whose money may have moved: a proof waiting for
      -- review, or a payment already marked successful.
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.order_id = o.id
          AND (p.status IN ('success', 'processing') OR p.payment_proof_url IS NOT NULL)
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE orders
    SET status = 'cancelled', cancelled_at = NOW()
    WHERE id = stale.id AND status = 'pending';

    IF FOUND THEN
      UPDATE payments
      SET status = 'expired', expired_at = NOW()
      WHERE order_id = stale.id AND status <> 'success';

      PERFORM restore_order_stock(stale.id);
      expired_count := expired_count + 1;
    END IF;
  END LOOP;

  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION expire_stale_pending_orders(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_stale_pending_orders(INTERVAL) TO service_role;

-- 3b. Hourly schedule. Needs pg_cron: Supabase Dashboard -> Database ->
-- Extensions -> enable "pg_cron", then re-run this file. Skipped quietly
-- otherwise, so the rest of the file still applies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'expire-stale-pending-orders';

    PERFORM cron.schedule(
      'expire-stale-pending-orders',
      '0 * * * *',
      'SELECT public.expire_stale_pending_orders()'
    );
  ELSE
    RAISE NOTICE 'pg_cron is not enabled: unpaid orders will not expire automatically.';
  END IF;
END;
$$;
