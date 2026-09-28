# Legacy product script review

Reviewed: 2026-08-20

No production database was contacted or changed during this review.

Two unreferenced MySQL-era mutation scripts were removed:

- `fix-database-products.ts` could insert a test product and overwrite names and
  prices from a hard-coded list;
- `fix-product-descriptions.ts` could overwrite public names and descriptions
  with hard-coded marketing text containing unverified ingredient claims.

Both scripts imported a database API that no longer exists, were absent from
the package scripts and bypassed the current product-information verification
flow. They must not be recreated or ported to Supabase. Product names, prices,
descriptions, ingredients, allergens and possible traces must instead be
reviewed by store staff and changed through the authenticated admin flow. Food
information is public only after the explicit verification timestamp is set.

The read-only `check-menu.ts` utility was retained, ported to Supabase and made
subject to the shared external-output guard. It requires an explicit absolute
output path outside the repository, refuses accidental overwrite and never
prints the extracted menu data to stdout.

The old WordPress-to-MySQL migration and SQL-generation commands were also
removed. They targeted the superseded database model, imported legacy orders
with inaccurate payment/status assumptions and could republish unreviewed
WordPress product copy. Historical WordPress material is incident evidence to
be protected and removed from Git history, not an approved production seed.
