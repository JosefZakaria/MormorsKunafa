DO $$
DECLARE
  v_location uuid;
  v_order uuid := gen_random_uuid();
  v_second_order uuid := gen_random_uuid();
  v_job uuid;
  v_token uuid;
  v_new_token uuid;
  v_state text;
BEGIN
  SELECT id INTO STRICT v_location FROM public.locations ORDER BY slug LIMIT 1;

  INSERT INTO public.orders (
    id, order_number, status, order_type, payment_method, payment_status,
    total_ore, customer_name, customer_email, customer_phone, location_id,
    estimated_ready_at
  ) VALUES (
    v_order, '#outbox-pickup', 'ny', 'takeaway', 'card', 'pending',
    1200, 'Synthetic', 'outbox@example.test', '+46700000000', v_location,
    now() + interval '30 minutes'
  );
  INSERT INTO public.order_items (
    id, order_id, product_name_snapshot, quantity, price_ore
  ) VALUES (gen_random_uuid(), v_order, 'Synthetic outbox item', 1, 1200);

  IF NOT public.mark_order_paid_with_audit_and_messages(v_order, now(), gen_random_uuid()) THEN
    RAISE EXCEPTION 'new paid transition was not applied';
  END IF;
  IF public.mark_order_paid_with_audit_and_messages(v_order, now(), gen_random_uuid()) THEN
    RAISE EXCEPTION 'duplicate paid transition was accepted';
  END IF;
  IF (SELECT count(*) FROM public.outbound_message_jobs WHERE order_id=v_order) <> 2 THEN
    RAISE EXCEPTION 'paid pickup order did not create exactly email and SMS jobs';
  END IF;

  IF NOT public.accept_order_with_messages(v_order, NULL, now()) THEN
    RAISE EXCEPTION 'new acceptance transition was not applied';
  END IF;
  IF public.accept_order_with_messages(v_order, now(), now()) THEN
    RAISE EXCEPTION 'duplicate acceptance transition was accepted';
  END IF;
  IF (SELECT count(*) FROM public.outbound_message_jobs WHERE order_id=v_order) <> 3 THEN
    RAISE EXCEPTION 'acceptance did not create exactly one additional SMS job';
  END IF;

  BEGIN
    INSERT INTO public.outbound_message_jobs(order_id,event_key,channel,event_at)
      VALUES (v_order,'order_confirmation','email',now());
    RAISE EXCEPTION 'duplicate order/event/channel job was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  UPDATE public.outbound_message_jobs
    SET next_attempt_at=now()+interval '1 day'
    WHERE order_id=v_order;
  UPDATE public.outbound_message_jobs
    SET next_attempt_at=now()
    WHERE order_id=v_order AND event_key='order_confirmation' AND channel='email'
    RETURNING id INTO v_job;

  SELECT claim_token INTO STRICT v_token
    FROM public.claim_outbound_message_jobs(1,30) WHERE job_id=v_job;
  IF NOT public.start_outbound_message_attempt(v_job,v_token) THEN
    RAISE EXCEPTION 'claimed job did not start';
  END IF;
  v_state := public.retry_outbound_message_job(v_job,v_token,'provider_rate_limited',429);
  IF v_state <> 'retryable' THEN RAISE EXCEPTION 'first retry was not scheduled'; END IF;
  UPDATE public.outbound_message_jobs SET next_attempt_at=now() WHERE id=v_job;
  SELECT claim_token INTO STRICT v_new_token
    FROM public.claim_outbound_message_jobs(1,30) WHERE job_id=v_job;
  IF public.complete_outbound_message_job(v_job,v_token,'stale') THEN
    RAISE EXCEPTION 'stale worker completed a replacement claim';
  END IF;
  IF NOT public.start_outbound_message_attempt(v_job,v_new_token)
    OR NOT public.mark_outbound_message_job_uncertain(
      v_job,v_new_token,'provider_response_uncertain',503
    ) THEN
    RAISE EXCEPTION 'uncertain delivery was not retained';
  END IF;
  IF (SELECT status FROM public.outbound_message_jobs WHERE id=v_job) <> 'uncertain' THEN
    RAISE EXCEPTION 'uncertain delivery became sendable again';
  END IF;

  -- A crash before the provider request is safe to reclaim with a new token.
  UPDATE public.outbound_message_jobs SET next_attempt_at=now()
    WHERE order_id=v_order AND event_key='order_confirmation' AND channel='sms'
    RETURNING id INTO v_job;
  SELECT claim_token INTO STRICT v_token
    FROM public.claim_outbound_message_jobs(1,30) WHERE job_id=v_job;
  UPDATE public.outbound_message_jobs SET lease_expires_at=now()-interval '1 second'
    WHERE id=v_job;
  SELECT claim_token INTO STRICT v_new_token
    FROM public.claim_outbound_message_jobs(1,30) WHERE job_id=v_job;
  IF v_new_token=v_token OR NOT public.start_outbound_message_attempt(v_job,v_new_token)
    OR NOT public.complete_outbound_message_job(v_job,v_new_token,'sms-safe-reclaim') THEN
    RAISE EXCEPTION 'pre-send lease was not safely reclaimed';
  END IF;

  -- A crash after request start must never become automatically sendable.
  UPDATE public.outbound_message_jobs SET next_attempt_at=now()
    WHERE order_id=v_order AND event_key='order_accepted' AND channel='sms'
    RETURNING id INTO v_job;
  SELECT claim_token INTO STRICT v_token
    FROM public.claim_outbound_message_jobs(1,30) WHERE job_id=v_job;
  IF NOT public.start_outbound_message_attempt(v_job,v_token) THEN
    RAISE EXCEPTION 'post-send lease fixture did not start';
  END IF;
  UPDATE public.outbound_message_jobs SET lease_expires_at=now()-interval '1 second'
    WHERE id=v_job;
  PERFORM public.claim_outbound_message_jobs(1,30);
  IF (SELECT status || ':' || last_error_code FROM public.outbound_message_jobs WHERE id=v_job)
    <> 'uncertain:provider_response_uncertain' THEN
    RAISE EXCEPTION 'expired post-send lease was not quarantined as uncertain';
  END IF;

  INSERT INTO public.orders (
    id, order_number, status, order_type, payment_method, payment_status,
    total_ore, customer_phone, location_id, estimated_ready_at
  ) VALUES (
    v_second_order, '#outbox-cap', 'mottagen', 'takeaway', 'card', 'paid',
    100, '+46700000001', v_location, now()+interval '20 minutes'
  );
  INSERT INTO public.order_items(id,order_id,product_name_snapshot,quantity,price_ore)
    VALUES (gen_random_uuid(),v_second_order,'Synthetic cap item',1,100);
  INSERT INTO public.outbound_message_jobs(
    order_id,event_key,channel,event_at,max_attempts
  ) VALUES (v_second_order,'order_accepted','sms',now(),1)
  RETURNING id INTO v_job;
  SELECT claim_token INTO STRICT v_token
    FROM public.claim_outbound_message_jobs(1,30) WHERE job_id=v_job;
  IF NOT public.start_outbound_message_attempt(v_job,v_token) THEN
    RAISE EXCEPTION 'max-attempt job did not start';
  END IF;
  v_state := public.retry_outbound_message_job(v_job,v_token,'provider_rate_limited',429);
  IF v_state <> 'permanent_failed'
    OR (SELECT attempt_count FROM public.outbound_message_jobs WHERE id=v_job) <> 1 THEN
    RAISE EXCEPTION 'maximum attempt bound was not enforced';
  END IF;

  IF has_table_privilege('anon','public.outbound_message_jobs','SELECT')
    OR has_table_privilege('authenticated','public.outbound_message_jobs','SELECT')
    OR has_function_privilege('anon','public.claim_outbound_message_jobs(integer,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.mark_order_paid_with_audit_and_messages(uuid,timestamptz,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'outbound-message state is exposed to a client role';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
    WHERE oid='public.outbound_message_jobs'::regclass) THEN
    RAISE EXCEPTION 'outbound-message RLS is not forced';
  END IF;
END
$$;
