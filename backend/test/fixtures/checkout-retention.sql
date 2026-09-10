BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO orders(id,order_number,customer_phone,stripe_checkout_session_id,created_at)
SELECT gen_random_uuid(),'queue-'||n,'+46700000000','cs_test_queue_'||n,now()-interval '3 days'
FROM generate_series(1,45) n;
CREATE TEMP TABLE first_batch AS SELECT * FROM list_initiated_checkout_drafts(now()-interval '24 hours',40);
CREATE TEMP TABLE second_batch AS SELECT * FROM list_initiated_checkout_drafts(now()-interval '24 hours',40);
DO $$
DECLARE v_id uuid; v_reference text;
BEGIN
  IF (SELECT count(*) FROM first_batch) <> 40 OR
    (SELECT count(*) FROM (SELECT order_id FROM first_batch UNION SELECT order_id FROM second_batch) seen) <> 45 THEN
    RAISE EXCEPTION 'inconclusive drafts starved later reconciliation candidates';
  END IF;
  IF (SELECT count(*) FROM orders WHERE order_number LIKE 'queue-%') <> 45 THEN
    RAISE EXCEPTION 'listing deleted an unresolved payment';
  END IF;
  SELECT id,stripe_checkout_session_id INTO v_id,v_reference FROM orders WHERE order_number='queue-1';
  IF delete_reconciled_checkout_draft(v_id,'card','wrong-reference',now()-interval '24 hours') THEN
    RAISE EXCEPTION 'changed provider reference was deleted';
  END IF;
  UPDATE orders SET payment_status='paid' WHERE id=v_id;
  IF delete_reconciled_checkout_draft(v_id,'card',v_reference,now()-interval '24 hours') THEN
    RAISE EXCEPTION 'concurrent payment was deleted';
  END IF;
  SELECT id,stripe_checkout_session_id INTO v_id,v_reference FROM orders WHERE order_number='queue-2';
  IF NOT delete_reconciled_checkout_draft(v_id,'card',v_reference,now()-interval '24 hours') THEN
    RAISE EXCEPTION 'verified terminal draft could not be deleted';
  END IF;
END;
$$;
INSERT INTO orders(id,order_number,customer_phone,created_at,payment_status) VALUES
  (gen_random_uuid(),'uninitiated-old','+46700000000',now()-interval '25 hours','pending'),
  (gen_random_uuid(),'uninitiated-young','+46700000000',now()-interval '23 hours','pending'),
  (gen_random_uuid(),'uninitiated-paid','+46700000000',now()-interval '25 hours','paid');
DO $$
BEGIN
  IF cleanup_uninitiated_checkout_drafts(now()-interval '24 hours',500) <> 1 THEN
    RAISE EXCEPTION 'uninitiated draft cutoff failed';
  END IF;
  IF (SELECT count(*) FROM orders WHERE order_number IN ('uninitiated-young','uninitiated-paid')) <> 2 THEN
    RAISE EXCEPTION 'protected draft or paid order was removed';
  END IF;
END;
$$;
INSERT INTO orders(id,order_number,customer_phone,customer_name,customer_email,internal_notes,
  status,order_type,payment_method,payment_status,stripe_checkout_session_id,total_ore,
  refund_status,completed_at,operational_pii_legal_hold)
SELECT gen_random_uuid(),'retention-'||kind,'+46700000000','Synthetic','example@example.test','Private note',
  CASE WHEN kind='active' THEN 'ny' ELSE 'levererad' END,
  CASE WHEN kind='eligible' THEN 'eat-here' ELSE 'takeaway' END,
  'card',
  CASE WHEN kind IN ('unsettled','eligible') THEN 'pending' ELSE 'paid' END,
  CASE WHEN kind='eligible' THEN 'cs_test_retention_receipt' ELSE NULL END,
  CASE WHEN kind='eligible' THEN 11200 ELSE 100 END,
  CASE WHEN kind='refund' THEN 'pending' ELSE 'none' END,
  now()-interval '1200 days', kind='hold'
FROM unnest(ARRAY['eligible','active','unsettled','refund','duplicate','alert','hold']) kind;
-- Seed immutable ledger history as the synthetic database owner; service_role
-- intentionally has no direct INSERT permission on the refund ledger.
RESET ROLE;
INSERT INTO duplicate_stripe_refunds(id,stripe_event_id,order_id,stripe_session_id,payment_intent_id,
  amount_ore,idempotency_key,requested_by_admin_id)
SELECT gen_random_uuid(),'evt_test_pending_duplicate',id,'cs_test_pending_duplicate','pi_test_pending_duplicate',
  total_ore,'synthetic-duplicate-refund-key','synthetic-owner' FROM orders WHERE order_number='retention-duplicate';
INSERT INTO payment_provider_events(provider,event_id,event_type,livemode,status,attempts,order_id,outcome)
SELECT 'stripe','evt_test_unresolved_alert','checkout.session.completed',false,'processed',1,id::text,
  'alert_paid_session_validation_failed' FROM orders WHERE order_number='retention-alert';
SET LOCAL ROLE service_role;
INSERT INTO order_items(id,order_id,product_name_snapshot,quantity,price_ore,modifications_json)
SELECT gen_random_uuid(),id,'Synthetic cake',1,total_ore::integer,'{"notes":"Private note"}'
FROM orders WHERE order_number LIKE 'retention-%';
DO $$
DECLARE v_order_id uuid;
BEGIN
  SELECT id INTO v_order_id FROM orders WHERE order_number='retention-eligible';
  IF NOT mark_order_paid_with_audit(v_order_id,now()-interval '1201 days',gen_random_uuid()) THEN
    RAISE EXCEPTION 'eligible accounting order could not capture its paid VAT snapshot';
  END IF;
END;
$$;
RESET ROLE;
INSERT INTO order_refunds(id,order_id,provider,amount_ore,status,idempotency_key,selection_json,
  provider_refund_id,requested_by_admin_id,created_at,updated_at,completed_at)
SELECT gen_random_uuid(),id,'stripe',5600,'succeeded','retention-accounting-refund',
  '[{"quantity":1,"amountOre":5600}]'::jsonb,'re_test_retention_accounting','synthetic-owner',
  now()-interval '1100 days',now()-interval '1100 days',now()-interval '1100 days'
FROM orders WHERE order_number='retention-eligible';
INSERT INTO order_refund_items(refund_id,order_item_id,quantity,amount_ore)
SELECT r.id,i.id,1,5600
FROM order_refunds r
JOIN orders o ON o.id=r.order_id
JOIN order_items i ON i.order_id=o.id
WHERE o.order_number='retention-eligible';
UPDATE orders SET refunded_amount_ore=5600,refund_status='partially_refunded'
WHERE order_number='retention-eligible';
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF (SELECT count(*) FROM preview_operational_order_pii_retention(now()-interval '90 days','operational_details',100)) <> 1 THEN
    RAISE EXCEPTION 'retention preview included protected evidence';
  END IF;
  IF anonymize_operational_order_pii(now()-interval '90 days','operational_details',100) <> 1 OR
    anonymize_operational_order_pii(now()-interval '1095 days','customer_contact',100) <> 1 THEN
    RAISE EXCEPTION 'retention removed the wrong set of orders';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM orders WHERE order_number='retention-eligible' AND customer_phone=''
    AND customer_name IS NULL AND customer_email IS NULL AND internal_notes IS NULL
    AND order_type='eat-here' AND payment_method='card' AND payment_status='paid'
    AND stripe_checkout_session_id='cs_test_retention_receipt'
    AND total_ore=11200 AND refunded_amount_ore=5600 AND refund_status='partially_refunded'
    AND receipt_vat_rate_percent=12 AND receipt_vat_ore=1200 AND completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'retention did not preserve financial data while removing contact data';
  END IF;
  IF (SELECT count(*) FROM orders WHERE order_number IN
    ('retention-active','retention-unsettled','retention-refund','retention-duplicate','retention-alert','retention-hold')
    AND customer_phone='+46700000000' AND internal_notes='Private note') <> 6 THEN
    RAISE EXCEPTION 'retention destroyed evidence for an unresolved or held order';
  END IF;
  IF (SELECT count(*) FROM order_items i JOIN orders o ON o.id=i.order_id
    WHERE o.order_number='retention-eligible' AND i.product_name_snapshot='Synthetic cake'
      AND i.price_ore=11200 AND i.quantity=1 AND i.modifications_json IS NULL) <> 1 THEN
    RAISE EXCEPTION 'retention damaged accounting items';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM order_refunds r JOIN orders o ON o.id=r.order_id
    WHERE o.order_number='retention-eligible' AND r.provider='stripe' AND r.amount_ore=5600
      AND r.status='succeeded' AND r.provider_refund_id='re_test_retention_accounting'
      AND r.requested_by_admin_id='synthetic-owner' AND r.completed_at IS NOT NULL
      AND r.selection_json='[{"quantity":1,"amountOre":5600}]'::jsonb) THEN
    RAISE EXCEPTION 'retention damaged the provider refund ledger';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM order_refund_items ri
    JOIN order_refunds r ON r.id=ri.refund_id JOIN orders o ON o.id=r.order_id
    WHERE o.order_number='retention-eligible' AND ri.quantity=1 AND ri.amount_ore=5600) THEN
    RAISE EXCEPTION 'retention damaged refund item allocation';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM security_audit_log a JOIN orders o ON o.id::text=a.resource_id
    WHERE o.order_number='retention-eligible' AND a.action='stripe_payment_confirmed'
      AND a.outcome='succeeded') THEN
    RAISE EXCEPTION 'retention damaged the verified payment timestamp';
  END IF;
  BEGIN
    UPDATE orders
    SET receipt_vat_rate_percent=6,receipt_vat_ore=634
    WHERE order_number='retention-eligible';
    RAISE EXCEPTION 'verified receipt VAT was rewritten';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF NOT EXISTS(SELECT 1 FROM orders WHERE order_number='retention-eligible'
    AND receipt_vat_rate_percent=12 AND receipt_vat_ore=1200) THEN
    RAISE EXCEPTION 'blocked VAT rewrite changed the historical snapshot';
  END IF;
  BEGIN
    DELETE FROM orders WHERE order_number='retention-eligible';
    RAISE EXCEPTION 'paid accounting history was physically deleted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF NOT EXISTS(SELECT 1 FROM orders WHERE order_number='retention-eligible') THEN
    RAISE EXCEPTION 'protected accounting order disappeared';
  END IF;
END;
$$;
-- Exercise the trigger as the disposable database owner. service_role is
-- already denied TRUNCATE on the protected refund ledgers before triggers run.
RESET ROLE;
DO $$
BEGIN
  BEGIN
    TRUNCATE TABLE public.orders CASCADE;
    RAISE EXCEPTION 'order accounting history was truncated';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF NOT EXISTS(SELECT 1 FROM orders WHERE order_number='retention-eligible') THEN
    RAISE EXCEPTION 'blocked truncate removed protected accounting history';
  END IF;
END;
$$;
ROLLBACK;
