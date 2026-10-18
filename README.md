# Dinau Treck

A private, one-screen ledger for Iven to record who owes him money (dinaus).

- Type a **name** and an **amount**, press Enter. No customer list to set up: new names are added automatically, and names you have used before are suggested as you type.
- **Credit limit.** Iven sets the limit to any amount (or none) in the *Credit limit* box, and can give one customer their own limit on their card. A dinau that would take someone over their limit is **refused**: the screen says so before the button is pressed, and the server refuses it too. It can go ahead once the customer pays something (part payment) or the limit is raised. Example: limit K10, customer owes K6, a K5 dinau is refused (only K4.00 more is allowed).
- **Part payments.** Tap *Part payment* on a customer, enter what they paid, and their balance drops by exactly that amount. A part payment settles their oldest unpaid dinau first. The card shows *Total taken / Paid so far / Still owed*, and *Statement* gives a copyable, printable page with every dinau and payment, so the customer can see what is still payable.
- Tap the green tick to settle one dinau, or *All paid* to settle everything. Every change has an **Undo**.
- **Owing** and **Paid** tabs, a live "Owed to you" total, search, optional due dates with an Overdue flag.

PHP 8.0+ and MySQL. No build step, no libraries.

## Live site
The app is hosted on **InfinityFree** and deployed automatically from this repository:

**https://dinau-track.infinityfree.me/** — sign in as Iven to use it.

## Deployment
Every push to `main` triggers the GitHub Actions workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which syncs the repository to the InfinityFree web server over FTP (SamKirkland/FTP-Deploy-Action). Credentials live in the repo's GitHub secrets (`FTP_USERNAME`, `FTP_PASSWORD`); `config.local.php` is excluded from the sync and exists only on the server. Tests run first (`.github/workflows/test.yml`: unit tests + `php -l` on every PHP file), so a failing build is caught before deployment.

## Run it locally
```sh
cp config.local.example.php config.local.php   # edit the database details
php scripts/setup.php                          # creates the tables
php scripts/create_user.php iven "a-strong-password"
php -S localhost:8000                          # then open http://localhost:8000
```

## Put it online (manual setup)
See [docs/infinityfree.md](docs/infinityfree.md) for the one-time host setup: creating the MySQL database, importing `schema.sql`, creating the Iven user, uploading `config.local.php` and checking that `.htaccess` blocks private files. After that, deploys happen automatically on every push to `main` (see *Deployment* above).

**Upgrading an existing database?** Back it up, then run `migrations/003_limits_and_repayments.sql` once. It keeps everyone's balance exactly as it is (dinaus ticked "paid" become full repayments) and starts the credit limit at K20.00, which you can change on the screen. Customers already over the limit keep their balance; the limit only stops *new* dinaus.

## Tests
```sh
npm test                                                   # unit tests for assets/js/logic.js (limit rule, balances)
php scripts/test_limits.php http://localhost:8000 iven "your-password"   # limit + part-payment rules over HTTP
```
`test_limits.php` records test customers and changes the limit (it restores it at the end), so **run it on a disposable database only**. It needs PHP's cURL extension.

## Files
| Path | What it does |
|---|---|
| `Dinau.php` | The one screen |
| `login.php`, `logout.php`, `auth.php` | Sign-in, sessions, CSRF |
| `api/dinaus.php` | The JSON endpoint (add, repay, remove, set limits) |
| `services/CreditService.php` | The credit rules: limit check, part payments, balances (Service Layer) |
| `assets/js/logic.js` | Pure logic shared with the tests (limit rule, grouping, money, dates) |
| `assets/js/app.js`, `assets/css/app.css` | The screen |
| `schema.sql`, `migrations/` | Database |
| `scripts/` | Command-line helpers and tests (never upload) |
| `.github/workflows/` | CI (tests) and auto-deploy to InfinityFree on push to `main` |
| `tests/` | Unit tests |
