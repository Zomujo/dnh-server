#!/usr/bin/env bash
# Builds and runs the DNH API on the VPS. Copy it to /opt/dnh-server/deploy.sh
# and run it there as root:
#
#   deploy.sh staging                               staging branch -> :4816
#   deploy.sh production                            main           -> :4815
#   deploy.sh <staging|production> --rollback <sha>
#
# A deploy clones the environment's branch, builds dnh-api:<env>-<sha>, makes
# sure that environment's Redis is up, then points dnh-api:<env> at the new
# image and recreates only that environment's API. A failed build never
# touches the running API. A rollback re-points dnh-api:<env> at a kept image
# and never builds. MongoDB is schemaless and is not run here, so there is no
# migration step.

set -euo pipefail

# DNH_SERVER_DIR and DNH_SERVER_REPO exist for testing the script away from
# the VPS. On the server, set the repository in $APP_DIR/deploy.conf instead
# (REPO=...), so that copying a new deploy.sh never resets it.
APP_DIR="${DNH_SERVER_DIR:-/opt/dnh-server}"
REPO="git@github.com-dnh-server:Zomujo/dnh-server.git"
if [ -f "$APP_DIR/deploy.conf" ]; then
  # shellcheck source=/dev/null
  . "$APP_DIR/deploy.conf"
fi
REPO="${DNH_SERVER_REPO:-$REPO}"

COMPOSE_FILE="$APP_DIR/compose.yml"
LOCK_FILE="$APP_DIR/.deploy.lock"
IMAGE="dnh-api"
KEEP=5
HEALTH_TIMEOUT=120
BUILT_LABEL="dnh-api.built"

usage() {
  cat >&2 <<'USAGE'
Usage:
  deploy.sh staging
  deploy.sh production
  deploy.sh <staging|production> --rollback <sha>
USAGE
  exit 1
}

ENV_NAME="${1:-}"
ROLLBACK_SHA=""
case "$#" in
  1) ;;
  3) [ "$2" = "--rollback" ] || usage
     ROLLBACK_SHA="$3"
     [[ "$ROLLBACK_SHA" =~ ^[0-9a-f]{7}$ ]] || usage ;;
  *) usage ;;
esac

case "$ENV_NAME" in
  staging)
    BRANCH="staging"
    OTHER_ENV="production"
    ADDRESS="127.0.0.1:4816"
    ;;
  production)
    BRANCH="main"
    OTHER_ENV="staging"
    ADDRESS="127.0.0.1:4815"
    ;;
  *) usage ;;
esac
SERVICE="api-$ENV_NAME"
REDIS_SERVICE="dnh-redis-$ENV_NAME"
ENV_FILE="$APP_DIR/.env.$ENV_NAME"
OTHER_ENV_FILE="$APP_DIR/.env.$OTHER_ENV"

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deploy is running (lock: $LOCK_FILE). Try again when it finishes." >&2
  exit 1
fi

WORK=""
cleanup() {
  if [ -n "$WORK" ]; then
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# The value of KEY in an env file, read the way Compose reads it: the last
# KEY= line, with one pair of surrounding quotes removed.
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

# Refuses an env file that could leak, that was written for the other
# environment, or that points this environment's API at anything but its own
# Redis, or at the other environment's database. Runs before anything is built.
check_env_file() {
  local mode key url problems=()
  if [ ! -f "$ENV_FILE" ]; then
    echo "$ENV_FILE is missing. Copy deploy/.env.example there and fill it in." >&2
    exit 1
  fi
  mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE")"
  [ "$mode" = "600" ] || problems+=("its mode is $mode; run chmod 600 $ENV_FILE")

  # Lines copied from .envrc keep their "export " prefix, which Compose does
  # not strip the same way a shell does.
  if grep -q '^[[:space:]]*export[[:space:]]' "$ENV_FILE"; then
    problems+=("remove the 'export ' prefix from every line (KEY=value only)")
  fi

  [ "$(env_value "$ENV_FILE" NODE_ENV)" = "$ENV_NAME" ] \
    || problems+=("NODE_ENV must be $ENV_NAME")

  for key in DB_CONNECTION_STRING DB_NAME JWT_SECRET TRUST_PROXY LOGTAIL_SOURCE_TOKEN; do
    [ -n "$(env_value "$ENV_FILE" "$key")" ] || problems+=("$key must be set")
  done

  # The API won't start outside development without the Logtail token, and the
  # endpoint replaces the library's default: unset, the API crashes on start;
  # empty, every log send fails silently.
  [[ "$(env_value "$ENV_FILE" LOGTAIL_HOST)" =~ ^https:// ]] \
    || problems+=("LOGTAIL_HOST must be the BetterStack source's https:// ingesting host")

  url="$(env_value "$ENV_FILE" REDIS_URL)"
  [[ "$url" =~ ^redis://$REDIS_SERVICE:6379(/[0-9]+)?$ ]] \
    || problems+=("REDIS_URL must be redis://$REDIS_SERVICE:6379")

  # Both APIs run the reminder and notification jobs, so staging pointed at
  # production's database would message real patients. Hosts are not compared:
  # one server can be spelled many ways (port, case, IP, SRV record).
  if [ -r "$OTHER_ENV_FILE" ] \
    && [ "$(env_value "$ENV_FILE" DB_NAME)" = "$(env_value "$OTHER_ENV_FILE" DB_NAME)" ]; then
    problems+=("DB_NAME is the same as in $OTHER_ENV_FILE; give each environment its own database name")
  fi

  if [ "${#problems[@]}" -gt 0 ]; then
    echo "$ENV_FILE is not ready, nothing was deployed:" >&2
    printf '  - %s\n' "${problems[@]}" >&2
    exit 1
  fi
}

confirm() {
  local answer=""
  printf 'Deploy %s to %s (%s)? [y/N] ' "$1" "$ENV_NAME" "$ADDRESS" >&2
  read -r answer || true
  if [ "$answer" != "y" ]; then
    echo "Nothing deployed."
    exit 0
  fi
}

# The <env>-<sha> tags of this environment, newest build first. The order comes
# from the BUILT_LABEL each build stamps, not from the image's Created time:
# BuildKit sets Created from the newest layer it ran, so once the runtime
# stage's layers are cached every later image reports the same Created.
kept_tags() {
  local tag
  docker image ls "$IMAGE" --format '{{.Tag}}' | grep "^$ENV_NAME-" \
    | while read -r tag; do
        printf '%s|%s\n' \
          "$(docker image inspect --format "{{index .Config.Labels \"$BUILT_LABEL\"}}" "$IMAGE:$tag")" "$tag"
      done | sort -r | cut -d'|' -f2 || true
}

# The <env>-<sha> tag the live <env> tag points at, if any.
live_tag() {
  local id
  id="$(docker image inspect --format '{{.Id}}' "$IMAGE:$ENV_NAME" 2>/dev/null)" || return 0
  docker image inspect --format '{{range .RepoTags}}{{println .}}{{end}}' "$id" \
    | grep "^$IMAGE:$ENV_NAME-" | head -n1 | sed "s|^$IMAGE:||" || true
}

# Starts this environment's Redis if it is not running, and waits until it
# reports healthy.
start_redis() {
  echo "Starting $REDIS_SERVICE..."
  compose up -d --wait --wait-timeout 60 "$REDIS_SERVICE"
}

release() {
  local tag="$1" previous="$2" container status waited=0
  docker tag "$IMAGE:$tag" "$IMAGE:$ENV_NAME"
  compose up -d --no-deps "$SERVICE"

  container="$(compose ps -q "$SERVICE")"
  echo "Waiting up to ${HEALTH_TIMEOUT}s for $SERVICE to report healthy..."
  while :; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")"
    if [ "$status" = "healthy" ]; then
      echo "$SERVICE is healthy on $IMAGE:$tag, serving $ADDRESS."
      return 0
    fi
    if [ "$status" = "unhealthy" ] || [ "$waited" -ge "$HEALTH_TIMEOUT" ]; then
      break
    fi
    sleep 2
    waited=$((waited + 2))
  done

  echo "$SERVICE is not healthy after ${waited}s (status: $status)." >&2
  echo "Its last health checks:" >&2
  docker inspect --format '{{if .State.Health}}{{range .State.Health.Log}}  exit {{.ExitCode}}: {{.Output}}{{println}}{{end}}{{end}}' "$container" \
    | sed '/^[[:space:]]*$/d' | tail -n 3 >&2 || true
  echo "Its last log lines:" >&2
  docker logs --tail 20 "$container" 2>&1 | sed 's/^/  /' >&2 || true
  if [ -n "$previous" ] && [ "$previous" != "$tag" ]; then
    echo "The previous image is still kept. To go back: deploy.sh $ENV_NAME --rollback ${previous#"$ENV_NAME-"}" >&2
  fi
  exit 1
}

# Keeps the KEEP newest <env>-<sha> images, counting the live one, which is
# never removed.
prune() {
  local live tag count=0
  live="$(live_tag)"
  [ -n "$live" ] && count=1
  for tag in $(kept_tags); do
    [ "$tag" = "$live" ] && continue
    if [ "$count" -lt "$KEEP" ]; then
      count=$((count + 1))
    else
      docker image rm "$IMAGE:$tag" >/dev/null
      echo "Removed $IMAGE:$tag."
    fi
  done
  # A rebuild of a SHA that is already kept moves its tag to the new image and
  # leaves the old one untagged; build stages leave dangling cache images too.
  docker image prune -f --filter "label=$BUILT_LABEL" >/dev/null
}

check_env_file
PREVIOUS="$(live_tag)"

if [ -n "$ROLLBACK_SHA" ]; then
  TAG="$ENV_NAME-$ROLLBACK_SHA"
  if ! docker image inspect "$IMAGE:$TAG" >/dev/null 2>&1; then
    KEPT="$(kept_tags | sed "s|^$ENV_NAME-||" | paste -sd' ' -)"
    echo "No $IMAGE:$TAG image on this machine. Kept: ${KEPT:-none}" >&2
    exit 1
  fi
  if [ "$ENV_NAME" = "production" ]; then
    confirm "$ROLLBACK_SHA (rollback)"
  fi
  start_redis
  release "$TAG" "$PREVIOUS"
  exit 0
fi

WORK="$(mktemp -d)"
git clone --quiet --depth 1 --single-branch --branch "$BRANCH" "$REPO" "$WORK/src"
FULL_SHA="$(git -C "$WORK/src" rev-parse HEAD)"
SHA="${FULL_SHA:0:7}"
echo "$BRANCH is at $(git -C "$WORK/src" log -1 --format='%h %s (%cd)' --date=format:'%Y-%m-%d %H:%M')"

if [ "$ENV_NAME" = "production" ]; then
  confirm "$SHA"
fi

TAG="$ENV_NAME-$SHA"
docker build \
  --label "$BUILT_LABEL=$(date -u +%Y%m%dT%H%M%SZ)" \
  --label "org.opencontainers.image.revision=$FULL_SHA" \
  -t "$IMAGE:$TAG" \
  "$WORK/src"

start_redis
release "$TAG" "$PREVIOUS"
prune
