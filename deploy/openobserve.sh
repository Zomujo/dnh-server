#!/usr/bin/env bash
# Sets up an environment's logging in the OpenObserve that compose.yml runs on
# this VPS. Copy it to /opt/dnh-server/openobserve.sh and run it there as root:
#
#   openobserve.sh setup <staging|production>            first time
#   openobserve.sh setup <staging|production> --rotate   new token for it
#
# It creates the environment's organization and a service account the API
# logs in with, then prints the two lines to put in that environment's
# settings file. The admin login comes from .env.openobserve and is passed to
# curl on stdin, never on the command line.

set -euo pipefail

APP_DIR="${DNH_SERVER_DIR:-/opt/dnh-server}"
COMPOSE_FILE="$APP_DIR/compose.yml"
OPENOBSERVE_ENV_FILE="$APP_DIR/.env.openobserve"
BASE="${OPENOBSERVE_LOCAL_URL:-http://127.0.0.1:5080}"

usage() {
  echo "Usage: openobserve.sh setup <staging|production> [--rotate]" >&2
  exit 1
}

[ "${1:-}" = "setup" ] || usage
ENV_NAME="${2:-}"
case "$ENV_NAME" in staging | production) ;; *) usage ;; esac
ROTATE=""
case "${3:-}" in "") ;; --rotate) ROTATE=1 ;; *) usage ;; esac
[ "$#" -le 3 ] || usage

ACCOUNT="api-$ENV_NAME@dnh.local"

# Same reading rules as deploy.sh: the last KEY= line, one pair of quotes off.
env_value() {
  local file="$1" key="$2" value
  value="$(sed -n "s/^$key=//p" "$file" | tail -n 1)"
  value="${value%$'\r'}"
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac
  printf '%s' "$value"
}

if [ ! -f "$OPENOBSERVE_ENV_FILE" ]; then
  echo "$OPENOBSERVE_ENV_FILE is missing; see deploy/RUNBOOK.md section 10." >&2
  exit 1
fi
ROOT_EMAIL="$(env_value "$OPENOBSERVE_ENV_FILE" ZO_ROOT_USER_EMAIL)"
ROOT_PASSWORD="$(env_value "$OPENOBSERVE_ENV_FILE" ZO_ROOT_USER_PASSWORD)"
if [ -z "$ROOT_EMAIL" ] || [ -z "$ROOT_PASSWORD" ]; then
  echo "ZO_ROOT_USER_EMAIL and ZO_ROOT_USER_PASSWORD must be set in $OPENOBSERVE_ENV_FILE." >&2
  exit 1
fi

# curl as the admin, with the login read from stdin.
admin_curl() {
  printf 'user = "%s:%s"\n' "$ROOT_EMAIL" "$ROOT_PASSWORD" \
    | curl -sS --max-time 10 -K - "$@"
}

if [ -z "${OPENOBSERVE_LOCAL_URL:-}" ]; then
  docker compose -f "$COMPOSE_FILE" up -d openobserve >/dev/null
fi
waited=0
until curl -fsS -o /dev/null --max-time 2 "$BASE/healthz"; do
  if [ "$waited" -ge 60 ]; then
    echo "OpenObserve is not answering on $BASE." >&2
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done

# OpenObserve creates an organization, named as given, on its first record.
response="$(admin_curl -XPOST "$BASE/api/$ENV_NAME/api/_json" \
  -H 'content-type: application/json' \
  -d "[{\"level\":\"log\",\"context\":\"openobserve.sh\",\"message\":\"Logging set up for $ENV_NAME\",\"service\":\"dnh-api\",\"environment\":\"$ENV_NAME\"}]")"
if ! grep -q '"successful":1' <<<"$response"; then
  echo "Could not create the $ENV_NAME organization: $response" >&2
  echo "Check ZO_ROOT_USER_EMAIL and ZO_ROOT_USER_PASSWORD; they only take effect the first time OpenObserve starts." >&2
  exit 1
fi

if [ -n "$ROTATE" ]; then
  response="$(admin_curl -XPUT "$BASE/api/$ENV_NAME/service_accounts/$ACCOUNT?rotateToken=true" \
    -H 'content-type: application/json' -d '{}')"
else
  response="$(admin_curl -XPOST "$BASE/api/$ENV_NAME/service_accounts" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$ACCOUNT\",\"first_name\":\"DNH API\",\"last_name\":\"$ENV_NAME\"}")"
  if grep -q 'already exists' <<<"$response"; then
    echo "$ACCOUNT already exists. Its token can't be shown again; run with --rotate for a new one" >&2
    echo "(the API logs nothing to OpenObserve until its settings file has the new token)." >&2
    exit 1
  fi
fi

token="$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' <<<"$response")"
if [ -z "$token" ]; then
  echo "OpenObserve did not return a token: $response" >&2
  exit 1
fi

cat <<EOF
The $ENV_NAME organization and its service account are ready. Put these lines
in the master copy of .env.$ENV_NAME, upload it and recreate the API
(deploy/RUNBOOK.md section 5):

OPENOBSERVE_URL=http://openobserve:5080
OPENOBSERVE_USER=$ACCOUNT
OPENOBSERVE_TOKEN=$token
EOF
