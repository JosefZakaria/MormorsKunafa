# Contributor procedure for the targeted history rewrite

This procedure is for Alper and Josef. The repository remains public by owner
decision, so the sensitive SQL dump, ZIP and extracted ZIP paths must be removed
from every affected ref as soon as credential rotation and the matching secure
deployment are complete.

The rewrite removes only the reviewed sensitive paths. It uses
`--prune-empty never` and `--prune-degenerate never`, and the guard compares ref
names plus total, merge and root commit counts before accepting the local
rewrite. Existing commit messages and code history remain, but every affected
commit and descendant receives a new SHA because its history changed.

## Freeze and preserve safe work

1. Alper announces a push freeze. Josef must not push, merge or rebase until the
   fresh remote has been verified.
2. Both developers run `git status` in every clone. Commit and push legitimate,
   non-sensitive work before the freeze, or save an ordinary patch containing
   only reviewed source changes outside the old repository. Never put leaked
   files, secrets or customer data in a patch or ticket.
3. Record the branch names that must remain. Close or merge open pull requests
   before the rewrite; old PR diffs can become unusable.
4. Alper creates the dedicated mirror and an offline recovery copy in a
   restricted location. That recovery copy still contains the incident data and
   must never be synced, shared or pushed.

## After Alper's force-push

1. Do **not** run `git pull` in an old clone. A pull/merge can reintroduce the
   removed history.
2. Clone the repository into a brand-new directory and check out the required
   branch. Confirm the expected files and recent commits are present.
3. Run `scripts/Test-GitHistorySanitization.ps1` in the fresh clone. Alper also
   compares all remote refs with the locally verified mirror and performs an
   independent secret/PII scan.
4. If Josef had an approved source-only patch, apply it to the fresh clone,
   review it and create a new commit. Never push an old branch or merge the old
   clone.
5. After all safe work is recovered, securely remove or isolate every old clone
   because each still contains the leaked customer data in `.git`.
6. Re-enable normal pushing only after the fresh remote verification and GitHub
   Support case have been recorded in the restricted incident journal.

The rewrite does not rotate a credential, erase third-party clones or decide
whether incident notification is required. Those remain separate gates.
