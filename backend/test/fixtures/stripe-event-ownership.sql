SET ROLE service_role;
DO $$
DECLARE a uuid; b uuid; state jsonb;
BEGIN
  PERFORM complete_stripe_event('evt_legacy_first','','completed');
  IF claim_stripe_event('evt_legacy_first','test',false) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Completed legacy event was not retained';
  END IF;
  BEGIN
    PERFORM complete_stripe_event('evt_legacy_retry','','stale');
    RAISE EXCEPTION 'Retried tokenless worker was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  state:=claim_stripe_event_v2('evt_legacy_retry','test',false); b:=(state->>'token')::uuid;
  PERFORM fail_stripe_event('evt_legacy_retry');
  IF (SELECT status FROM payment_provider_events WHERE event_id='evt_legacy_retry') <> 'processing' THEN
    RAISE EXCEPTION 'Legacy worker changed a new claim';
  END IF;
  IF NOT complete_stripe_event_v2('evt_legacy_retry',b,'','recovered') THEN RAISE EXCEPTION 'Recovery failed'; END IF;
  IF (SELECT outcome FROM payment_provider_events WHERE event_id='evt_legacy_done') <> 'preserved' THEN
    RAISE EXCEPTION 'Processed event changed during migration';
  END IF;
  state:=claim_stripe_event_v2('evt_ownership_test','test',false); a:=(state->>'token')::uuid;
  IF state->>'status'<>'claimed' OR a IS NULL THEN RAISE EXCEPTION 'No initial claim'; END IF;
  IF claim_stripe_event_v2('evt_ownership_test','test',false)->>'status'<>'busy' THEN RAISE EXCEPTION 'Live claim acknowledged'; END IF;
  BEGIN
    PERFORM claim_stripe_event('evt_ownership_test','test',false);
    RAISE EXCEPTION 'Legacy retry acknowledged a live claim';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  UPDATE payment_provider_events SET lease_expires_at=now()-interval '1 second' WHERE event_id='evt_ownership_test';
  state:=claim_stripe_event_v2('evt_ownership_test','test',false); b:=(state->>'token')::uuid;
  IF state->>'status'<>'claimed' OR b IS NULL OR a=b THEN RAISE EXCEPTION 'Claim was not renewed'; END IF;
  IF complete_stripe_event_v2('evt_ownership_test',a,'','stale') OR fail_stripe_event_v2('evt_ownership_test',a) THEN
    RAISE EXCEPTION 'Expired worker modified its replacement';
  END IF;
  IF NOT fail_stripe_event_v2('evt_ownership_test',b) THEN RAISE EXCEPTION 'Owner could not release'; END IF;
  state:=claim_stripe_event_v2('evt_ownership_test','test',false); a:=(state->>'token')::uuid;
  IF fail_stripe_event_v2('evt_ownership_test',b) THEN RAISE EXCEPTION 'Failed owner modified replacement'; END IF;
  IF NOT complete_stripe_event_v2('evt_ownership_test',a,'','success') THEN RAISE EXCEPTION 'Owner could not complete'; END IF;
  IF claim_stripe_event_v2('evt_ownership_test','test',false)->>'status'<>'processed' THEN RAISE EXCEPTION 'Completed event retried'; END IF;
  IF has_function_privilege('anon','claim_stripe_event_v2(text,text,boolean)','execute')
    OR has_function_privilege('authenticated','complete_stripe_event_v2(text,uuid,text,text)','execute')
    OR has_function_privilege('authenticated','fail_stripe_event_v2(text,uuid)','execute') THEN
    RAISE EXCEPTION 'Public event mutation permission';
  END IF;
END; $$;
RESET ROLE;
