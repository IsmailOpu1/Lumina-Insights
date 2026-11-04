# Database backups

The live database is on Supabase's free plan, which keeps no backups of its
own. Two GitHub Actions jobs cover that:

- **Nightly database backup** (`.github/workflows/backup.yml`) dumps the
  business data (`public`), logins (`auth`) and file records (`storage`)
  every night at 02:43 Dhaka time, encrypts the dump and keeps it for 30 days
  under the run's artifacts. It fails, and GitHub emails the owner, if the
  dump is missing any of the main tables.
- **Keep database awake** (`.github/workflows/keep-awake.yml`) makes one small
  read a day so Supabase never pauses the project for inactivity.

Uploaded files themselves (profile photos) are not in the dump, only their
records; they are small and users can upload them again.

## Secrets

Repo Settings -> Secrets and variables -> Actions:

| Secret | What it is |
|---|---|
| `SUPABASE_DB_URL` | Supabase dashboard -> Connect -> **Session pooler** connection string, with the database password in place of `[YOUR-PASSWORD]`. The direct connection doesn't work from GitHub (it needs IPv6). |
| `BACKUP_PASSPHRASE` | A long random passphrase. Keep a copy in a password manager: without it no backup can be opened. |

If the database password is reset, update `SUPABASE_DB_URL` too.

## Running one now

Actions -> Nightly database backup -> Run workflow.

## Restoring

1. Download the backup from the run's Artifacts and unzip it to get
   `lumina.dump.enc`.
2. Decrypt it:
   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in lumina.dump.enc -out lumina.dump
   ```
3. Look before restoring anything. To see what's inside:
   ```bash
   pg_restore --list lumina.dump
   ```
   To get one table's data as SQL, for example after rows were deleted by
   mistake:
   ```bash
   pg_restore --data-only --table=orders --file=orders.sql lumina.dump
   ```
4. Restoring into the live database overwrites what's there, so restore into
   a new or spare Supabase project first, check it, and only then copy back
   what's needed.

Restoring needs PostgreSQL 17 client tools (`pg_restore`), which can be run
with Docker: `docker run --rm -v "$PWD:/w" -w /w postgres:17 pg_restore --list lumina.dump`.
