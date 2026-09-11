-- Metadata only: never selects application, auth or Storage rows or invokes RPCs.
-- A legacy profile proves preserved metadata; it is not a secured release gate.
\if :{?expected_accounting_profile}
\else
  \set expected_accounting_profile secured-ledgers
\endif

BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;

SELECT set_config('mk.verification_profile', :'expected_accounting_profile', true);

DO $$
DECLARE
  profile text := current_setting('mk.verification_profile');
  object_name text;
  object_id oid;
BEGIN
  IF profile NOT IN ('legacy-core', 'secured-ledgers') THEN
    RAISE EXCEPTION 'Unknown accounting/security metadata profile';
  END IF;
  IF profile = 'legacy-core' THEN RETURN; END IF;

  IF has_schema_privilege('anon','public','CREATE')
    OR has_schema_privilege('authenticated','public','CREATE')
    OR NOT has_schema_privilege('service_role','public','USAGE') THEN
    RAISE EXCEPTION 'Unsafe application schema privileges';
  END IF;

  FOREACH object_name IN ARRAY ARRAY[
    'admin_users', 'admin_settings', 'products', 'orders', 'order_items',
    'admin_push_subscriptions', 'admin_push_delivery_logs', 'locations',
    'product_location_stock', 'payment_provider_events', 'security_audit_log',
    'order_refunds', 'order_refund_items', 'duplicate_stripe_refunds'
  ] LOOP
    SELECT c.oid INTO object_id FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=object_name AND c.relkind IN ('r','p')
        AND c.relrowsecurity AND c.relforcerowsecurity;
    IF object_id IS NULL THEN
      RAISE EXCEPTION 'Missing or unprotected application table: %', object_name;
    END IF;
    IF has_table_privilege('anon',object_id,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_table_privilege('authenticated',object_id,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege('anon',object_id,'SELECT,INSERT,UPDATE,REFERENCES')
      OR has_any_column_privilege('authenticated',object_id,'SELECT,INSERT,UPDATE,REFERENCES')
      OR NOT has_table_privilege('service_role',object_id,'SELECT') THEN
      RAISE EXCEPTION 'Unsafe application table privileges: %', object_name;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='S' AND (
      has_sequence_privilege('anon',c.oid,'USAGE,SELECT,UPDATE')
      OR has_sequence_privilege('authenticated',c.oid,'USAGE,SELECT,UPDATE'))) THEN
    RAISE EXCEPTION 'Client role can access an application sequence';
  END IF;
  IF to_regclass('public.order_number_seq') IS NULL
    OR NOT has_sequence_privilege('service_role','public.order_number_seq','USAGE') THEN
    RAISE EXCEPTION 'Service role cannot allocate order numbers';
  END IF;

  FOREACH object_name IN ARRAY ARRAY[
    'create_order_atomic', 'append_security_audit_event', 'mark_order_paid_with_audit',
    'claim_stripe_event_v2', 'complete_stripe_event_v2', 'fail_stripe_event_v2',
    'reserve_order_refund', 'set_order_refund_provider_reference', 'finalize_order_refund',
    'reserve_duplicate_stripe_refund', 'set_duplicate_stripe_refund_provider_reference',
    'finalize_duplicate_stripe_refund', 'cleanup_uninitiated_checkout_drafts',
    'list_initiated_checkout_drafts', 'delete_reconciled_checkout_draft',
    'preview_operational_order_pii_retention', 'anonymize_operational_order_pii'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=object_name
        AND has_function_privilege('service_role',p.oid,'EXECUTE')) THEN
      RAISE EXCEPTION 'Missing service-role RPC grant: %', object_name;
    END IF;
  END LOOP;
  -- Trigger-only functions cannot be invoked as RPCs. Extension members have
  -- provider-managed contracts and are outside the application function set.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prorettype <> 'trigger'::regtype
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
        WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
      AND (has_function_privilege('anon',p.oid,'EXECUTE')
        OR has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR (p.prosecdef AND NOT coalesce('search_path=public, pg_temp'=ANY(p.proconfig),false)))) THEN
    RAISE EXCEPTION 'Unsafe application RPC privileges or SECURITY DEFINER search_path';
  END IF;
  FOREACH object_name IN ARRAY ARRAY['order_refunds','order_refund_items','duplicate_stripe_refunds'] LOOP
    IF has_table_privilege('service_role','public.'||object_name,'INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_any_column_privilege('service_role','public.'||object_name,'INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Refund ledger allows direct service-role mutation: %',object_name;
    END IF;
  END LOOP;
  -- Global grants are additive: a schema-scoped REVOKE cannot cancel them.
  IF EXISTS (SELECT 1 FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclnamespace IN (0, 'public'::regnamespace)
      AND a.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname='anon'),
        (SELECT oid FROM pg_roles WHERE rolname='authenticated'))
      AND d.defaclobjtype IN ('r','S','f')) THEN
    RAISE EXCEPTION 'Default privileges expose future application objects';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND NOT EXISTS (SELECT 1 FROM pg_default_acl d
        WHERE d.defaclrole=c.relowner AND d.defaclnamespace=0 AND d.defaclobjtype='f')) THEN
    RAISE EXCEPTION 'Application object owner retains default PUBLIC function execution';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND (NOT i.indisvalid OR NOT i.indisready)) THEN
    RAISE EXCEPTION 'An application index is incomplete';
  END IF;
END;
$$;

-- Normalize object-owner grants because --no-owner intentionally assigns the
-- independent target operator as owner. Preserve every other grantee and its
-- grant option; compare table/column ACLs, forced RLS, RPC contracts and defaults.
WITH relations AS (
  SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
    (SELECT coalesce(jsonb_agg(jsonb_build_array(
       CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
       a.privilege_type,a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type), '[]'::jsonb)
     FROM aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
     WHERE a.grantee<>c.relowner) AS acl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')
), column_acl AS (
  SELECT c.relname, attribute.attname,
    CASE WHEN privilege.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END AS grantee,
    privilege.privilege_type, privilege.is_grantable
  FROM pg_attribute attribute JOIN pg_class c ON c.oid=attribute.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(attribute.attacl)>0 THEN attribute.attacl END) privilege
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
    AND attribute.attnum>0 AND NOT attribute.attisdropped
    AND privilege.grantee<>c.relowner
), routines AS (
  SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
    p.prosecdef, p.proconfig,
    (SELECT coalesce(jsonb_agg(jsonb_build_array(
       CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
       a.privilege_type,a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type), '[]'::jsonb)
     FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE a.grantee<>p.proowner) AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND NOT EXISTS (SELECT 1 FROM pg_depend d
    WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
), defaults AS (
  SELECT CASE WHEN d.defaclrole=current_user::regrole THEN '$OWNER'
    ELSE pg_get_userbyid(d.defaclrole) END AS creator,
    CASE WHEN d.defaclnamespace=0 THEN '*' ELSE 'public' END AS namespace,
    d.defaclobjtype,
    (SELECT coalesce(jsonb_agg(jsonb_build_array(
       CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
       a.privilege_type,a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type), '[]'::jsonb)
     FROM aclexplode(d.defaclacl) a WHERE a.grantee<>d.defaclrole) AS acl
  FROM pg_default_acl d WHERE d.defaclnamespace IN (0,'public'::regnamespace)
), schema_acl AS (
  SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
    a.privilege_type,a.is_grantable
  FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
  WHERE n.nspname='public' AND a.grantee<>n.nspowner
), policies AS (
  SELECT c.relname,p.polname,p.polcmd,p.polpermissive,
    ARRAY(SELECT CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END
      FROM unnest(p.polroles) role_id ORDER BY 1) AS roles,
    pg_get_expr(p.polqual,p.polrelid) AS using_expression,
    pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
), triggers AS (
  SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND NOT t.tgisinternal
)
SELECT 'security_metadata_sha256='||encode(sha256(convert_to(jsonb_build_object(
  'relations',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY relname),'[]'::jsonb) FROM relations r),
  'columns',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY relname,attname,grantee,privilege_type,is_grantable),'[]'::jsonb) FROM column_acl c),
  'routines',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY proname,arguments),'[]'::jsonb) FROM routines r),
  'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY creator,namespace,defaclobjtype),'[]'::jsonb) FROM defaults d),
  'schema',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY grantee,privilege_type),'[]'::jsonb) FROM schema_acl a),
  'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY relname,polname),'[]'::jsonb) FROM policies p),
  'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY relname,tgname),'[]'::jsonb) FROM triggers t)
)::text,'UTF8')),'hex');

COMMIT;
