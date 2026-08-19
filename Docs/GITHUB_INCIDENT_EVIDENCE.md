# GitHub incident evidence snapshot

Snapshot date: 2026-08-19 (Europe/Stockholm)

This file records only repository metadata. It deliberately excludes leaked
personal data, archive contents, environment values, credentials and author
email addresses. Preserve it with the restricted incident record before any
history rewrite.

## Confirmed objects

| Path | Blob SHA-1 | Git object size | First observed additions |
|---|---|---:|---|
| `Database/845466_f2374cba400138f050cfb9bde30d163e.sql` | `617582c42ec32691ae3487858071208745b9e0f1` | 57,242,398 bytes | `954190f58fe2ea5d409da13c8551b86690597428` |
| `backend/backend.zip` | `5bd3a0eec2181ab052eaec767c6f9ace51cb9f9c` | 27,239 bytes | `954190f58fe2ea5d409da13c8551b86690597428`, `5d50a7113c4b8d40925f3f377f5d006fb95af68e` |

Both introduction commits have timestamp `2026-02-06T20:18:27+01:00` and
subject `Replacing and reconnecting database`. The paths were untracked from
the `security-checks` line in commit
`d507fc95c2c42987c7e54b13f748b1499b078029` at
`2026-07-28T20:28:19+02:00`. Untracking does not remove historical blobs.

The extracted archive also has historical objects under
`backend/_zip_extract/`. Do not open, quote or copy the archive or dump into an
issue, support ticket or ordinary project log.

## Remote-tracking refs observed locally

The SQL introduction commit is reachable from these fetched refs:

- `origin/Admin-functionality`
- `origin/Admin-login-issue`
- `origin/frontend-menu-design`
- `origin/reciept-printer-sunmi`
- `origin/statistics-admin`

The second repository history containing the archive introduction commit
`5d50a711...` is reachable from 24 fetched remote refs, including `origin/main`
and `origin/security-checks`. Re-run the collection script immediately before
coordinated cleanup because remote refs may have changed since this snapshot.

## Evidence still requiring account access

- Record the exact time the organization first became aware of the exposure.
- Export GitHub organization/repository audit logs and visibility-change events.
- Preserve security-alert, secret-scanning and clone/traffic evidence available
  to the account without copying leaked payloads.
- Record credential rotation timestamps and identifiers, never secret values.
- Record the private-repository containment time, history rewrite time, all
  force-pushed refs and the GitHub Support case number.

Rotate every possibly exposed credential before rewriting history. A rewrite is
destructive and coordinated: do not perform it from an ordinary working clone.
Follow the incident procedure in `Docs/PRIVACY_OPERATIONS_RUNBOOK.md` and the
official GitHub sensitive-data removal process referenced by the master
checklist.

## Reproduction

Run the read-only collector from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/collect-git-incident-evidence.ps1
```

Store the output in the restricted incident journal, not in Git, if it contains
new account-specific ref names or operational timestamps.
