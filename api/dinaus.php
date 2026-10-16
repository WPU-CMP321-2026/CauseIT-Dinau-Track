<?php
/**
 * GET  /api/dinaus.php  -> {dinaus: [...], today: "YYYY-MM-DD"}
 * POST /api/dinaus.php  (JSON, X-CSRF-Token header)
 *   {action:"add", name, amount, note?, due_date?}   -> the new dinau (201)
 *   {action:"set_paid", ids:[..], paid:true|false}   -> {updated: n}
 *   {action:"remove",  ids:[..], removed:true|false} -> {updated: n}
 */
require __DIR__ . '/_bootstrap.php';

const MAX_AMOUNT = 99999999.99;

function now_stamp(): string
{
    return date('Y-m-d H:i:s');
}

/** Shape a DB row for the browser. Money travels as whole toea (cents). */
function present(array $r): array
{
    return [
        'id'         => (int) $r['id'],
        'name'       => $r['customer_name'],
        'cents'      => (int) round(((float) $r['amount']) * 100),
        'note'       => $r['note'],
        'due_date'   => $r['due_date'],
        'created_at' => $r['created_at'],
        'paid_at'    => $r['paid_at'],
    ];
}

function fetch_one(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT id, customer_name, amount, note, due_date, created_at, paid_at FROM dinaus WHERE id = :id');
    $s->execute([':id' => $id]);
    return present($s->fetch());
}

/** Accepts "5", "5.5", "5,50", "K5.00". Returns a string like "5.50" or null. */
function parse_amount($raw): ?string
{
    $s = trim((string) $raw);
    $s = preg_replace('/^(?:pgk|k)\s*/i', '', $s);
    $s = str_replace(',', '.', $s);
    if (!preg_match('/^\d+(\.\d{1,2})?$/', $s)) {
        return null;
    }
    $n = (float) $s;
    if ($n <= 0 || $n > MAX_AMOUNT) {
        return null;
    }
    return number_format($n, 2, '.', '');
}

/** Clean ids from the request body. */
function clean_ids($raw): array
{
    if (!is_array($raw)) {
        return [];
    }
    $ids = [];
    foreach ($raw as $v) {
        if (is_int($v) || (is_string($v) && ctype_digit($v))) {
            $ids[] = (int) $v;
        }
    }
    return array_slice(array_values(array_unique(array_filter($ids, fn ($i) => $i > 0))), 0, 500);
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $rows = $pdo->query(
            'SELECT id, customer_name, amount, note, due_date, created_at, paid_at
             FROM dinaus WHERE deleted_at IS NULL
             ORDER BY created_at DESC, id DESC LIMIT 5000'
        )->fetchAll();
        respond(['dinaus' => array_map('present', $rows), 'today' => date('Y-m-d')]);
    }

    if ($method !== 'POST') {
        respond_error('Method not allowed.', 405);
    }

    require_csrf();
    $body   = json_input();
    $action = (string) ($body['action'] ?? '');

    if ($action === 'add') {
        $name = trim(preg_replace('/\s+/u', ' ', (string) ($body['name'] ?? '')));
        if ($name === '') {
            respond_error('Type the customer\'s name.', 422, 'name');
        }
        if (mb_strlen($name) > 100) {
            respond_error('That name is too long (100 letters max).', 422, 'name');
        }

        $amount = parse_amount($body['amount'] ?? '');
        if ($amount === null) {
            respond_error('Enter an amount like 5 or 12.50.', 422, 'amount');
        }

        $note = trim((string) ($body['note'] ?? ''));
        if (mb_strlen($note) > 200) {
            respond_error('That note is too long (200 letters max).', 422, 'note');
        }

        $due = trim((string) ($body['due_date'] ?? ''));
        if ($due !== '') {
            $d = DateTime::createFromFormat('!Y-m-d', $due);
            if (!$d || $d->format('Y-m-d') !== $due) {
                respond_error('That due date is not valid.', 422, 'due_date');
            }
        }

        // "mary jones" typed fast becomes "Mary Jones". Names with capitals are left alone.
        if ($name === mb_strtolower($name)) {
            $name = mb_convert_case($name, MB_CASE_TITLE, 'UTF-8');
        }

        // If "mary" already exists as "Mary", reuse that spelling so they stay one customer.
        $s = $pdo->prepare('SELECT customer_name FROM dinaus WHERE customer_name = :n AND deleted_at IS NULL ORDER BY id LIMIT 1');
        $s->execute([':n' => $name]);
        $existing = $s->fetchColumn();
        if ($existing !== false) {
            $name = $existing;
        }

        $ins = $pdo->prepare(
            'INSERT INTO dinaus (customer_name, amount, note, due_date, created_at)
             VALUES (:n, :a, :note, :due, :now)'
        );
        $ins->execute([
            ':n'    => $name,
            ':a'    => $amount,
            ':note' => $note === '' ? null : $note,
            ':due'  => $due === '' ? null : $due,
            ':now'  => now_stamp(),
        ]);
        respond(fetch_one($pdo, (int) $pdo->lastInsertId()), 201);
    }

    if ($action === 'set_paid' || $action === 'remove') {
        $ids = clean_ids($body['ids'] ?? []);
        if (!$ids) {
            respond_error('Nothing was selected.', 422);
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));

        if ($action === 'set_paid') {
            $paid = !empty($body['paid']);
            $sql  = $paid
                ? "UPDATE dinaus SET paid_at = ? WHERE id IN ($marks) AND deleted_at IS NULL AND paid_at IS NULL"
                : "UPDATE dinaus SET paid_at = NULL WHERE id IN ($marks) AND deleted_at IS NULL";
            $args = $paid ? array_merge([now_stamp()], $ids) : $ids;
        } else {
            $removed = !empty($body['removed']);
            $sql  = $removed
                ? "UPDATE dinaus SET deleted_at = ? WHERE id IN ($marks) AND deleted_at IS NULL"
                : "UPDATE dinaus SET deleted_at = NULL WHERE id IN ($marks)";
            $args = $removed ? array_merge([now_stamp()], $ids) : $ids;
        }

        $st = $pdo->prepare($sql);
        $st->execute($args);
        respond(['updated' => $st->rowCount()]);
    }

    respond_error('Unknown action.', 422);
} catch (PDOException $e) {
    respond_error('Something went wrong saving that. Please try again.', 500);
}
