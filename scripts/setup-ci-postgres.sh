#!/usr/bin/env bash
set -euo pipefail

# This setup is only for disposable GitHub-hosted Ubuntu 24.04 runners.
# Official installation instructions and pinned package publication:
# https://www.postgresql.org/download/linux/ubuntu/
# https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-17/
if [[ "${GITHUB_ACTIONS:-}" != 'true' || "${RUNNER_ENVIRONMENT:-}" != 'github-hosted' ]]; then
  printf '%s\n' 'PostgreSQL CI setup requires a disposable GitHub-hosted runner.' >&2
  exit 1
fi
source /etc/os-release
if [[ "$ID" != 'ubuntu' || "$VERSION_ID" != '24.04' || "$(dpkg --print-architecture)" != 'amd64' ]]; then
  printf '%s\n' 'PostgreSQL CI setup requires Ubuntu 24.04 amd64.' >&2
  exit 1
fi

readonly task_pg_version='17.11-1.pgdg24.04+2'
readonly task_key_fingerprint='B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8'
readonly task_key_path='/usr/share/keyrings/mk-ci-postgresql.asc'
task_temp_dir="$(mktemp -d "${RUNNER_TEMP:?}/mk-pgdg.XXXXXX")"
readonly task_temp_dir
readonly task_key_file="$task_temp_dir/postgresql.asc"
trap 'rm -f -- "$task_key_file"; rmdir -- "$task_temp_dir"' EXIT

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  'https://www.postgresql.org/media/keys/ACCC4CF8.asc' --output "$task_key_file"
task_actual_fingerprint="$(gpg --batch --show-keys --with-colons "$task_key_file" \
  | awk -F: '$1 == "pub" { primary = 1; next } primary && $1 == "fpr" { print $10; primary = 0 }')"
if [[ "$task_actual_fingerprint" != "$task_key_fingerprint" ]]; then
  printf '%s\n' 'PostgreSQL repository signing-key fingerprint mismatch.' >&2
  exit 1
fi
sudo install -m 0644 "$task_key_file" "$task_key_path"
printf 'deb [arch=amd64 signed-by=%s] https://apt.postgresql.org/pub/repos/apt noble-pgdg main\n' \
  "$task_key_path" | sudo tee /etc/apt/sources.list.d/mk-ci-postgresql.list > /dev/null

# The test harness owns and stops its own loopback-only synthetic cluster.
# Do not let package installation create a separate default cluster.
sudo install -d /etc/postgresql-common
printf '%s\n' 'create_main_cluster = false' \
  | sudo tee /etc/postgresql-common/createcluster.conf > /dev/null
sudo apt-get update
sudo env DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends --allow-downgrades \
  "postgresql-17=$task_pg_version" "postgresql-client-17=$task_pg_version"

for task_package in postgresql-17 postgresql-client-17; do
  test "$(dpkg-query -W -f='${Version}' "$task_package")" = "$task_pg_version"
done
for task_binary in postgres psql pg_dump pg_restore; do
  "/usr/lib/postgresql/17/bin/$task_binary" --version \
    | grep -E 'PostgreSQL\) 17\.11([[:space:]]|$)'
done
printf '%s\n' 'Verified signed PostgreSQL 17.11 packages; the tests create their own isolated cluster.'
