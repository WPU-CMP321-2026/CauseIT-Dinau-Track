# Putting Dinau Treck on InfinityFree

You need PHP 8.0+ (with PDO MySQL) and one MySQL database from the InfinityFree panel.

## 1. Database
1. In the InfinityFree panel create a MySQL database. Note the **host name** (it is not `localhost`), database name, username and password.
2. Open phpMyAdmin, select that empty database, and **Import** `schema.sql`.
3. On your own computer run `php scripts/generate_password_hash.php "your-password"` and copy the long text it prints.
4. In phpMyAdmin → SQL tab, run (paste your hash):
   ```sql
   INSERT INTO users (username, password_hash) VALUES ('iven', 'PASTE_HASH_HERE');
   ```
5. Upgrading an existing site? Back up (phpMyAdmin > Export), then run `migrations/003_limits_and_repayments.sql` once in the SQL tab. Do not import `schema.sql` over an existing database.

## 2. Upload
1. Copy `config.local.example.php` to `config.local.php` and fill in the values from step 1.
2. Upload these into `htdocs`: `api/`, `assets/`, `services/`, `.htaccess`, `auth.php`, `config.php`, `config.local.php`, `index.php`, `login.php`, `logout.php`, `Dinau.php`.
3. Do **not** upload `scripts/`, `migrations/`, `docs/`, `schema.sql`, `README.md` or any `.env` file.
4. Turn on HTTPS in the panel, open the site, sign in and record a test dinau.

## Check the privacy rules work
Visit `https://your-site/config.local.php` and `https://your-site/schema.sql`. Both must show **403 Forbidden**. If either shows content, your host is ignoring `.htaccess`: delete those files from the server.
