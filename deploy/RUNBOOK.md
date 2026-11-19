# Deploy runbook

How to deploy the DNH API to a VPS with Docker, written so that someone who has never done it can. Staging and production can run side by side on the same VPS; set up only production if staging isn't needed.

| | Staging | Production |
|---|---|---|
| Built from | `staging` branch | `main` branch |
| Listens on (VPS loopback) | `127.0.0.1:4816` | `127.0.0.1:4815` |
| Containers | `dnh-api-staging`, `dnh-redis-staging` | `dnh-api-production`, `dnh-redis-production` |
| Settings file | `/opt/dnh-server/.env.staging` | `/opt/dnh-server/.env.production` |
| Image | `dnh-api:staging` → `dnh-api:staging-<sha>` | `dnh-api:production` → `dnh-api:production-<sha>` |

```
 mobile app / HCP web app / Africa's Talking
   │ HTTPS
   ▼
 reverse proxy on the VPS (nginx, Caddy or Cloudflare Tunnel)
   │ http://127.0.0.1:4815 (production) / :4816 (staging)
   ▼
 dnh-api-<env> ──── dnh-redis-<env>     internal network, no published port
   │
   └── egress ──► MongoDB (another server), Firebase, Africa's Talking, SMTP, BetterStack
```

Each environment has its own Redis, settings file and database. Nothing is shared between them. MongoDB is **not** run on this VPS: each settings file points `DB_CONNECTION_STRING` at the database server.

Everything lives in one directory on the VPS:

```
/opt/dnh-server/                 root:root 755
├── deploy.sh                    755  builds and swaps the API      (from deploy/deploy.sh)
├── compose.yml                  644  runs the APIs and Redis       (from deploy/compose.yml)
├── deploy.conf                  644  optional: REPO=<git url>
├── .env.staging                 600  staging settings              (from deploy/.env.example)
├── .env.production              600  production settings
└── .deploy.lock                      stops two deploys running at once
```

The root `docker-compose.yml` in the repo is a different thing: a single-host stack that also runs MongoDB. It is not used here.

---

## 1. Prerequisites

### On the VPS

| What | Version | Check |
|---|---|---|
| Linux (Ubuntu 22.04/24.04 or Debian 12) | — | `cat /etc/os-release` |
| Docker Engine | 25 or newer | `docker version` |
| Docker Compose plugin | 2.24 or newer | `docker compose version` |
| git, flock (util-linux) | any | `git --version; flock --version` |
| A reverse proxy with TLS | — | section 8 |
| Firewall: only 22, 80 and 443 open | — | `sudo ufw status` |

Docker's published ports bypass `ufw`, which is why the APIs publish on `127.0.0.1` only.

### Access

| What | Why |
|---|---|
| SSH to the VPS with `sudo` | `deploy.sh`, `docker compose` and the settings files all need root |
| Read access to the GitHub repository | the VPS clones it on every deploy (section 7.1) |
| The MongoDB server's firewall allows the VPS's IP | the API connects to it |

### Secrets you will be handed, never commit

The settings file of each environment. A master copy is kept by the owner; you only touch the file on the VPS when a setting changes (section 5). Never paste a secret into chat, a ticket, a commit or a command line that gets logged. Compare two secrets by `sha256sum`, not by looking at them.

---

## 2. Before every deploy: what is going out

```bash
git fetch --prune origin
git log --oneline <live sha>..origin/staging      # staging; origin/main for production
```

The live sha is in the image tag: on the VPS, `sudo docker image ls dnh-api` lists `production-<sha>` and the `production` tag shares its IMAGE ID.

Check that range for anything that needs more than a code deploy:

| Look for | What to do |
|---|---|
| A new key in `deploy/.env.example` or `.envrc.example` | Add it to `/opt/dnh-server/.env.<env>` first (section 5). |
| Changes to `deploy/compose.yml` or `deploy/deploy.sh` | Copy them to the VPS first (section 6). |
| A new MongoDB index or data change the PR says needs a manual step | Agree it with the owner before deploying. Mongoose creates new indexes itself on start. |

---

## 3. Deploy

### Staging

```bash
ssh <you>@<vps>
sudo bash /opt/dnh-server/deploy.sh staging
```

It checks the settings file, clones `staging`, builds `dnh-api:staging-<sha>`, starts Redis if needed, swaps the API and waits for it to report healthy. A good run ends with:

```
api-staging is healthy on dnh-api:staging-<sha>, serving 127.0.0.1:4816.
```

### Production

Production only gets what staging has proven, when staging exists. Merge `staging` into `main` through a PR, then:

```bash
sudo bash /opt/dnh-server/deploy.sh production
```

It prints the commit and asks `Deploy <sha> to production (127.0.0.1:4815)? [y/N]`; answer `y`.

### What happens on a failure

| Fails at | Effect |
|---|---|
| Settings check | Lists every problem, deploys nothing. |
| Clone or `docker build` | The running API is untouched. |
| New API not healthy within 120s | Prints its last health checks and log lines and the rollback command. The broken container stays so you can read its logs; roll back to restore service. |

The swap restarts the API in place, so requests get connection errors for the few seconds it takes to start (about 10–20s). Deploy at a quiet time. Queued jobs wait in Redis and run once the new API is up.

### Rolling back

```bash
sudo bash /opt/dnh-server/deploy.sh <staging|production> --rollback <7-char sha>
```

It re-points the API at a kept image (the five newest per environment are kept) and never builds. Running it with a sha that isn't kept lists the ones that are.

---

## 4. Verify

```bash
P=http://127.0.0.1:4815                    # 4816 for staging; or the public https:// address
curl -s "$P/"                              # 200, the health route the container checks
curl -s -o /dev/null -w '%{http_code}\n' "$P/api/v1/patients/me"   # 401 without a token
```

On the VPS:

```bash
sudo docker compose -f /opt/dnh-server/compose.yml ps        # API healthy, Redis healthy
sudo docker logs --since 10m dnh-api-production 2>&1 | grep -iE 'error|warn'   # nothing new
```

Staging serves the API docs at `/docs`; production does not.

Report what went out: the image tag and commit sha, the PRs, any setting changed, and each check with its result.

---

## 5. Changing a setting

1. Edit the master copy and keep it mode 600.
2. Upload it and put it in place:

   ```bash
   scp -p .env.production <you>@<vps>:env.upload
   ssh -t <you>@<vps> 'sudo install -o root -g root -m 600 ~/env.upload /opt/dnh-server/.env.production && shred -u ~/env.upload'
   ```

3. Recreate the API so it reads the new value (no rebuild):

   ```bash
   sudo docker compose -f /opt/dnh-server/compose.yml up -d --force-recreate --no-deps api-production
   ```

---

## 6. Updating `compose.yml` or `deploy.sh` on the VPS

After a merged change to either, from a checkout of the branch you deploy:

```bash
scp deploy/compose.yml deploy/deploy.sh <you>@<vps>:
ssh -t <you>@<vps> '
  sudo install -o root -g root -m 644 ~/compose.yml /opt/dnh-server/compose.yml &&
  sudo install -o root -g root -m 755 ~/deploy.sh   /opt/dnh-server/deploy.sh &&
  rm ~/compose.yml ~/deploy.sh'
```

If `compose.yml` changed the Redis service, apply it with `sudo docker compose -f /opt/dnh-server/compose.yml up -d dnh-redis-<env>`; the next deploy picks up API changes.

---

## 7. Setting up the VPS (one time)

### 7.1 Repository access

The VPS needs to clone the repository as root. Use a read-only deploy key, so the VPS can read this one repository and nothing else:

```bash
sudo ssh-keygen -t ed25519 -N '' -C dnh-server-vps -f /root/.ssh/dnh-server
sudo cat /root/.ssh/dnh-server.pub
```

Add the public key on GitHub: repository → Settings → Deploy keys → Add, **without** write access. Then:

```bash
sudo tee -a /root/.ssh/config >/dev/null <<'EOF'
Host github.com-dnh-server
  HostName github.com
  User git
  IdentityFile /root/.ssh/dnh-server
  IdentitiesOnly yes
EOF
sudo ssh -T git@github.com-dnh-server        # "successfully authenticated", answer yes to the host key
```

`deploy.sh` clones `git@github.com-dnh-server:Zomujo/dnh-server.git`. To deploy from another repository (a fork), put its URL in `/opt/dnh-server/deploy.conf` (root, 644), using the same `github.com-dnh-server` host alias:

```bash
echo 'REPO=git@github.com-dnh-server:<owner>/dnh-server.git' | sudo tee /opt/dnh-server/deploy.conf
```

### 7.2 Files

```bash
sudo install -d -o root -g root -m 755 /opt/dnh-server
```

Copy `compose.yml` and `deploy.sh` as in section 6. Fill in `.env.<env>` from `deploy/.env.example` and upload it as in section 5. In it:

- `NODE_ENV` is the environment's name.
- `REDIS_URL` is `redis://dnh-redis-<env>:6379`.
- `DB_CONNECTION_STRING` and `DB_NAME` point at this environment's own database.
- `TRUST_PROXY=1` for a reverse proxy on this VPS.
- Every secret is generated separately for each environment.

### 7.3 First deploy

```bash
sudo bash /opt/dnh-server/deploy.sh staging        # or production
```

Then run the checks in section 4 against `127.0.0.1`.

---

## 8. Reverse proxy

The APIs listen on the VPS's loopback only. Put one of these in front, with TLS:

**nginx** (with a certificate from certbot):

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.gov.gh;
    # ssl_certificate / ssl_certificate_key from certbot
    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:4815;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;        # streamed (SSE) responses
        proxy_buffering off;
    }
}
```

**Caddy** (gets its own certificate):

```
api.example.gov.gh {
    reverse_proxy 127.0.0.1:4815
}
```

**Cloudflare Tunnel**: route the public hostname to `http://127.0.0.1:4815`. No inbound port needs to be open.

Any of these is one proxy hop: `TRUST_PROXY=1`. Then register the USSD callback with Africa's Talking as `https://<host>/api/v1/ussd?key=<USSD_CALLBACK_SECRET>`.

---

## 9. Gotchas

- **Always use `sudo` for `docker compose` on the VPS.** The settings files are root-only and `compose.yml` marks them `required: false`, so without root Compose silently starts the API with no settings.
- **No `export ` prefix in the settings files.** A copy of `.envrc` has them; `deploy.sh` refuses such a file.
- **Staging and production must not share a database.** Both run the reminder and notification jobs, so staging on production data would message real patients. `deploy.sh` refuses two files with the same `DB_NAME` on the same host.
- **Redis data is persistent** (`redis_<env>` volume, append-only file): queued jobs survive restarts. Removing the volume drops queued jobs, OTPs and USSD sessions, nothing else.
- **Logs** are rotated by Docker (5 × 10 MB per container). Errors and warnings also go to BetterStack when `LOGTAIL_*` are set.
- **Database backups** are the database server's job, not this VPS's.
- **Avoid `$` and ` #` in setting values.** Compose expands `$VAR` and treats ` #` as a comment in unquoted values; `openssl rand -hex 32` makes safe secrets. Wrap a value that needs them in single quotes.
