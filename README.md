# Dinau Treck

A private, one-screen ledger for Iven to record who owes him money (dinaus).

- Type a **name** and an **amount**, press Enter. No customer list to set up: new names are added automatically, and names you have used before are suggested as you type.
- Tap the green tick to mark a dinau **paid** (or **All paid** for a person). Every change has an **Undo** for a few seconds.
- **Owing** and **Paid** tabs, a live "Owed to you" total, search, optional due dates with an Overdue flag.

PHP 8.0+ and MySQL. No build step, no libraries.

## Run it locally
```sh
cp config.local.example.php config.local.php   # edit the database details
php scripts/setup.php                          # creates the tables
php scripts/create_user.php iven "a-strong-password"
php -S localhost:8000                          # then open http://localhost:8000
```

## Put it online
See [docs/infinityfree.md](docs/infinityfree.md). Upgrading from the old version? Run `migrations/002_simplify.sql` once to carry your old records over.

## Files
| Path | What it does |
|---|---|
| `Dinau.php` | The one screen |
| `login.php`, `logout.php`, `auth.php` | Sign-in, sessions, CSRF |
| `api/dinaus.php` | Add, mark paid, remove, list |
| `assets/` | `css/app.css`, `js/app.js`, `img/logo.svg` |
| `schema.sql`, `migrations/` | Database |
| `scripts/` | Command-line helpers (never upload) |
