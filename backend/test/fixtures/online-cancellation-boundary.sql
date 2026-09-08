BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE v_id uuid := gen_random_uuid(); v_method text; v_state text;
BEGIN
  INSERT INTO orders(id,order_number,customer_phone) VALUES(v_id,'synthetic-cancellation','+46700000000');
  FOREACH v_method IN ARRAY ARRAY['card','app','swish'] LOOP
    UPDATE orders SET payment_method=v_method WHERE id=v_id;
    FOREACH v_state IN ARRAY ARRAY['pending','paid'] LOOP
      UPDATE orders SET payment_status=v_state, refund_status='none' WHERE id=v_id;
      BEGIN
        UPDATE orders SET status='avbruten' WHERE id=v_id;
        RAISE EXCEPTION 'unsafe online cancellation was accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
    END LOOP;
  END LOOP;
  -- The refund finalizer changes all three fields in one update.
  UPDATE orders SET payment_status='paid',refund_status='refunded',status='avbruten' WHERE id=v_id;
  -- A historical cancelled draft must still accept genuine late payment.
  UPDATE orders SET payment_status='pending',refund_status='none' WHERE id=v_id;
  IF NOT mark_order_paid_with_audit(v_id,now(),gen_random_uuid()) THEN
    RAISE EXCEPTION 'late payment was discarded';
  END IF;
  IF (SELECT status FROM orders WHERE id=v_id) <> 'avbruten' THEN
    RAISE EXCEPTION 'late payment reopened cancelled fulfillment';
  END IF;
  UPDATE orders SET payment_method='cash',payment_status='pending',status='ny' WHERE id=v_id;
  UPDATE orders SET status='avbruten' WHERE id=v_id;
END;
$$;
ROLLBACK;
