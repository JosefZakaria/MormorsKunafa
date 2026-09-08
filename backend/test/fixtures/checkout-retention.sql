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
  status,payment_status,refund_status,completed_at,operational_pii_legal_hold)
SELECT gen_random_uuid(),'retention-'||kind,'+46700000000','Synthetic','example@example.test','Private note',
  CASE WHEN kind='active' THEN 'ny' ELSE 'levererad' END,
  CASE WHEN kind='unsettled' THEN 'pending' ELSE 'paid' END,
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
SELECT gen_random_uuid(),id,'Synthetic cake',1,100,'{"notes":"Private note"}' FROM orders WHERE order_number LIKE 'retention-%';
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
    AND customer_name IS NULL AND internal_notes IS NULL AND total_ore=100 AND payment_status='paid') THEN
    RAISE EXCEPTION 'retention did not preserve financial data while removing contact data';
  END IF;
  IF (SELECT count(*) FROM orders WHERE order_number IN
    ('retention-active','retention-unsettled','retention-refund','retention-duplicate','retention-alert','retention-hold')
    AND customer_phone='+46700000000' AND internal_notes='Private note') <> 6 THEN
    RAISE EXCEPTION 'retention destroyed evidence for an unresolved or held order';
  END IF;
  IF (SELECT count(*) FROM order_items i JOIN orders o ON o.id=i.order_id
    WHERE o.order_number='retention-eligible' AND i.price_ore=100 AND i.quantity=1 AND i.modifications_json IS NULL) <> 1 THEN
    RAISE EXCEPTION 'retention damaged accounting items';
  END IF;
END;
$$;
ROLLBACK;
