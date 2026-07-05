# Secrets (Docker secrets)

`docker-compose.yml` mounts these files into the containers as Docker secrets
(`/run/secrets/<name>`) instead of passing plaintext values through the
environment. The entrypoint expands the `*_FILE` variables into the env vars the
app/Prisma read.

## Setup

```bash
cp session_secret.txt.example   session_secret.txt
cp postgres_password.txt.example postgres_password.txt
cp database_url.txt.example      database_url.txt
```

Then edit each file to a real value:

- **session_secret.txt** — sign session cookies. Generate: `openssl rand -hex 32`
- **postgres_password.txt** — the Postgres user password.
- **database_url.txt** — full connection string; the password inside it **must
  match** `postgres_password.txt`, e.g.
  `postgresql://tasktracker:<same-password>@postgres:5432/tasktracker?schema=public`

The real `*.txt` files are gitignored — only the `.example` files are committed.
Never commit filled-in secrets.
