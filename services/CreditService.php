<?php
/**
 * Service Layer: every credit rule lives here. api/dinaus.php only translates
 * between HTTP and these methods. Money is handled as whole toea (cents).
 *
 *   ValidationException          -> 422 (bad input)
 *   NotFoundException            -> 404
 *   CreditLimitExceededException -> 409 (a new dinau would pass the limit)
 *   ConflictException            -> 409 (e.g. paying something already paid)
 */

class ValidationException extends RuntimeException
{
    public function __construct(string $message, public ?string $field = null)
    {
        parent::__construct($message);
    }
}

class NotFoundException extends RuntimeException
{
}

class ConflictException extends RuntimeException
{
}

/** A new dinau would take the customer over their credit limit, so it is refused. */
class CreditLimitExceededException extends RuntimeException
{
    public function __construct(
        public string $customer,
        public int $balanceCents,
        public int $limitCents,
        public int $amountCents
    ) {
        $available = max(0, $limitCents - $balanceCents);
        $kina = fn (int $c): string => 'K' . number_format($c / 100, 2);
        if ($balanceCents <= 0) {
            $msg = "The limit is {$kina($limitCents)}, so the most that can be recorded for {$customer} is {$kina($limitCents)}. Raise the limit first.";
        } elseif ($available === 0) {
            $msg = "{$customer} already owes {$kina($balanceCents)} and the limit is {$kina($limitCents)}, so nothing more can be recorded. Record a payment or raise the limit first.";
        } else {
            $msg = "{$customer} already owes {$kina($balanceCents)} and the limit is {$kina($limitCents)}, so only {$kina($available)} more can be recorded. Record a payment or raise the limit first.";
        }
        parent::__construct($msg);
    }

    public function details(): array
    {
        return [
            'balance_cents'   => $this->balanceCents,
            'limit_cents'     => $this->limitCents,
            'available_cents' => max(0, $this->limitCents - $this->balanceCents),
        ];
    }
}

class CreditService
{
    private const MAX_CENTS = 9999999999;

    public function __construct(private PDO $pdo)
    {
    }

    /* ------------------------------------------------------------ helpers */

    private static function now(): string
    {
        return date('Y-m-d H:i:s');
    }

    private static function toCents($v): int
    {
        return (int) round(((float) $v) * 100);
    }

    private static function dec(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }

    private static function kina(int $cents): string
    {
        return 'K' . number_format($cents / 100, 2);
    }

    /** "5", "5.5", "5,50", "K5.00" -> whole toea, or null if not a valid amount. */
    public static function parseAmount($raw): ?int
    {
        $s = trim((string) $raw);
        $s = preg_replace('/^(?:pgk|k)\s*/i', '', $s);
        $s = str_replace(',', '.', $s);
        if (!preg_match('/^\d+(\.\d{1,2})?$/', $s)) {
            return null;
        }
        $c = self::toCents($s);
        return ($c > 0 && $c <= self::MAX_CENTS) ? $c : null;
    }

    private function transaction(callable $work)
    {
        $this->pdo->beginTransaction();
        try {
            $r = $work();
            $this->pdo->commit();
            return $r;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /** Remaining (unpaid) cents on each of one customer's dinaus, oldest first: [id => cents]. */
    private function remainingFor(string $name): array
    {
        $st = $this->pdo->prepare(
            'SELECT d.id, d.amount - COALESCE(x.paid, 0) AS remaining
             FROM dinaus d
             LEFT JOIN (SELECT a.dinau_id, SUM(a.amount) AS paid
                        FROM repayment_allocations a
                        JOIN repayments r ON r.id = a.repayment_id AND r.deleted_at IS NULL
                        GROUP BY a.dinau_id) x ON x.dinau_id = d.id
             WHERE d.customer_name = :n AND d.deleted_at IS NULL
             ORDER BY d.created_at, d.id'
        );
        $st->execute([':n' => $name]);
        $out = [];
        foreach ($st->fetchAll() as $r) {
            $out[(int) $r['id']] = self::toCents($r['remaining']);
        }
        return $out;
    }

    /** What the customer owes right now, after all repayments. */
    private function balanceFor(string $name): int
    {
        return array_sum($this->remainingFor($name));
    }

    /** The default limit, or null for "no limit". */
    private function defaultLimit(): ?int
    {
        $v = $this->pdo->query("SELECT value FROM settings WHERE name = 'credit_limit'")->fetchColumn();
        return ($v === false || trim((string) $v) === '') ? null : self::toCents($v);
    }

    /** This customer's limit: their own if Iven set one, otherwise the default. */
    private function limitFor(string $name): ?int
    {
        $st = $this->pdo->prepare('SELECT credit_limit FROM customer_limits WHERE customer_name = :n');
        $st->execute([':n' => $name]);
        $own = $st->fetchColumn();
        return $own !== false ? self::toCents($own) : $this->defaultLimit();
    }

    /** The spelling already stored for this name, so "mary" joins "Mary". */
    private function canonicalName(string $name): ?string
    {
        $st = $this->pdo->prepare('SELECT customer_name FROM dinaus WHERE customer_name = :n AND deleted_at IS NULL ORDER BY id LIMIT 1');
        $st->execute([':n' => $name]);
        $v = $st->fetchColumn();
        return $v === false ? null : $v;
    }

    /** Lock this customer's rows so two quick requests cannot both slip under the limit. */
    private function lockCustomer(string $name): void
    {
        $st = $this->pdo->prepare('SELECT id FROM dinaus WHERE customer_name = :n FOR UPDATE');
        $st->execute([':n' => $name]);
        $st->fetchAll();
    }

    /* ------------------------------------------------------------ reading */

    /** Everything the screen needs. Remaining amounts are worked out here, once. */
    public function snapshot(): array
    {
        $rows = $this->pdo->query(
            'SELECT d.id, d.customer_name, d.amount, d.note, d.due_date, d.created_at,
                    d.amount - COALESCE((SELECT SUM(a.amount)
                        FROM repayment_allocations a JOIN repayments r ON r.id = a.repayment_id
                        WHERE a.dinau_id = d.id AND r.deleted_at IS NULL), 0) AS remaining
             FROM dinaus d WHERE d.deleted_at IS NULL
             ORDER BY d.created_at DESC, d.id DESC LIMIT 5000'
        )->fetchAll();
        $dinaus = [];
        foreach ($rows as $r) {
            $dinaus[] = [
                'id' => (int) $r['id'], 'name' => $r['customer_name'],
                'cents' => self::toCents($r['amount']), 'remaining_cents' => self::toCents($r['remaining']),
                'note' => $r['note'], 'due_date' => $r['due_date'], 'created_at' => $r['created_at'],
            ];
        }

        $repayments = [];
        foreach ($this->pdo->query(
            'SELECT id, customer_name, amount, created_at FROM repayments WHERE deleted_at IS NULL
             ORDER BY created_at DESC, id DESC LIMIT 5000'
        )->fetchAll() as $r) {
            $repayments[] = ['id' => (int) $r['id'], 'name' => $r['customer_name'], 'cents' => self::toCents($r['amount']), 'created_at' => $r['created_at']];
        }

        $limits = [];
        foreach ($this->pdo->query('SELECT customer_name, credit_limit FROM customer_limits')->fetchAll() as $r) {
            $limits[] = ['name' => $r['customer_name'], 'cents' => self::toCents($r['credit_limit'])];
        }

        return [
            'today' => date('Y-m-d'),
            'default_limit_cents' => $this->defaultLimit(),
            'customer_limits' => $limits,
            'dinaus' => $dinaus,
            'repayments' => $repayments,
        ];
    }

    /* ---------------------------------------------------------- recording */

    /** Record a dinau. Refused if it would take the customer over their limit. */
    public function addDinau(string $name, $amountRaw, $noteRaw, string $due): array
    {
        $name = trim(preg_replace('/\s+/u', ' ', $name));
        if ($name === '') {
            throw new ValidationException('Type the customer\'s name.', 'name');
        }
        if (mb_strlen($name) > 100) {
            throw new ValidationException('That name is too long (100 letters max).', 'name');
        }
        $cents = self::parseAmount($amountRaw);
        if ($cents === null) {
            throw new ValidationException('Enter an amount like 5 or 12.50.', 'amount');
        }
        $note = trim((string) $noteRaw);
        if (mb_strlen($note) > 200) {
            throw new ValidationException('That note is too long (200 letters max).', 'note');
        }
        $due = trim($due);
        if ($due !== '') {
            $d = DateTime::createFromFormat('!Y-m-d', $due);
            if (!$d || $d->format('Y-m-d') !== $due) {
                throw new ValidationException('That due date is not valid.', 'due_date');
            }
        }
        if ($name === mb_strtolower($name)) {          // "mary jones" -> "Mary Jones"
            $name = mb_convert_case($name, MB_CASE_TITLE, 'UTF-8');
        }

        return $this->transaction(function () use ($name, $cents, $note, $due) {
            $name = $this->canonicalName($name) ?? $name;
            $this->lockCustomer($name);

            $balance = $this->balanceFor($name);
            $limit = $this->limitFor($name);
            if ($limit !== null && $balance + $cents > $limit) {
                throw new CreditLimitExceededException($name, $balance, $limit, $cents);
            }

            $this->pdo->prepare(
                'INSERT INTO dinaus (customer_name, amount, note, due_date, created_at) VALUES (:n, :a, :note, :due, :t)'
            )->execute([
                ':n' => $name, ':a' => self::dec($cents), ':note' => $note === '' ? null : $note,
                ':due' => $due === '' ? null : $due, ':t' => self::now(),
            ]);
            return [
                'dinau_id' => (int) $this->pdo->lastInsertId(), 'name' => $name, 'cents' => $cents,
                'balance_cents' => $balance + $cents, 'limit_cents' => $limit,
            ];
        });
    }

    /**
     * Record a repayment. The customer's balance drops by exactly that amount.
     *   kind "part":  pay some of it. The money settles the oldest unpaid dinau first.
     *   kind "dinau": settle what is left of one dinau.
     *   kind "all":   settle everything the customer owes.
     */
    public function repay(string $name, string $kind, int $dinauId, $amountRaw): array
    {
        return $this->transaction(function () use ($name, $kind, $dinauId, $amountRaw) {
            $name = $this->canonicalName(trim($name)) ?? '';
            if ($name === '') {
                throw new NotFoundException('That customer was not found.');
            }
            $this->lockCustomer($name);
            $open = array_filter($this->remainingFor($name), fn ($c) => $c > 0);
            $balance = array_sum($open);
            if ($balance <= 0) {
                throw new ConflictException($name . ' does not owe anything.');
            }

            if ($kind === 'dinau') {
                if (!isset($open[$dinauId])) {
                    throw new ConflictException('That dinau is already paid.');
                }
                $plan = [$dinauId => $open[$dinauId]];
            } elseif ($kind === 'all') {
                $plan = $open;
            } elseif ($kind === 'part') {
                $cents = self::parseAmount($amountRaw);
                if ($cents === null) {
                    throw new ValidationException('Enter an amount like 5 or 12.50.', 'amount');
                }
                if ($cents > $balance) {
                    throw new ValidationException($name . ' only owes ' . self::kina($balance) . '.', 'amount');
                }
                $plan = [];
                $left = $cents;
                foreach ($open as $id => $rem) {          // oldest first
                    if ($left <= 0) {
                        break;
                    }
                    $plan[$id] = min($left, $rem);
                    $left -= $plan[$id];
                }
            } else {
                throw new ValidationException('Unknown payment type.');
            }

            $total = array_sum($plan);
            $this->pdo->prepare('INSERT INTO repayments (customer_name, amount, created_at) VALUES (:n, :a, :t)')
                ->execute([':n' => $name, ':a' => self::dec($total), ':t' => self::now()]);
            $rid = (int) $this->pdo->lastInsertId();
            $alloc = $this->pdo->prepare('INSERT INTO repayment_allocations (repayment_id, dinau_id, amount) VALUES (:r, :d, :a)');
            foreach ($plan as $id => $amt) {
                $alloc->execute([':r' => $rid, ':d' => $id, ':a' => self::dec($amt)]);
            }
            return ['repayment_id' => $rid, 'name' => $name, 'cents' => $total, 'balance_cents' => $balance - $total];
        });
    }

    /** Soft-delete (or bring back) dinaus or repayments. $type is "dinau" or "repayment". */
    public function remove(string $type, array $ids, bool $removed): array
    {
        $table = ['dinau' => 'dinaus', 'repayment' => 'repayments'][$type] ?? null;
        if ($table === null || !$ids) {
            throw new ValidationException('Nothing was selected.');
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));

        if ($type === 'dinau' && $removed) {
            $st = $this->pdo->prepare(
                "SELECT COUNT(DISTINCT a.dinau_id) FROM repayment_allocations a
                 JOIN repayments r ON r.id = a.repayment_id AND r.deleted_at IS NULL
                 WHERE a.dinau_id IN ($marks)"
            );
            $st->execute($ids);
            if ((int) $st->fetchColumn() > 0) {
                throw new ConflictException('A dinau with payments on it cannot be removed. Undo its payments first.');
            }
        }

        $st = $this->pdo->prepare($removed
            ? "UPDATE $table SET deleted_at = ? WHERE id IN ($marks) AND deleted_at IS NULL"
            : "UPDATE $table SET deleted_at = NULL WHERE id IN ($marks)");
        $st->execute($removed ? array_merge([self::now()], $ids) : $ids);
        if ($removed && $st->rowCount() === 0) {
            throw new NotFoundException('Not found.');
        }
        return ['updated' => $st->rowCount()];
    }

    /* ------------------------------------------------------ credit limits */

    /** The limit for everyone without their own. "" means no limit. */
    public function setDefaultLimit($raw): void
    {
        $raw = trim((string) $raw);
        if ($raw !== '' && self::parseAmount($raw) === null) {
            throw new ValidationException('Enter a limit like 20 or 12.50.', 'limit');
        }
        $value = $raw === '' ? '' : self::dec(self::parseAmount($raw));
        $this->pdo->prepare("INSERT INTO settings (name, value) VALUES ('credit_limit', :v)
                             ON DUPLICATE KEY UPDATE value = VALUES(value)")->execute([':v' => $value]);
    }

    /** A limit for one customer. "" puts them back on the default limit. */
    public function setCustomerLimit(string $name, $raw): void
    {
        $name = $this->canonicalName(trim($name));
        if ($name === null) {
            throw new NotFoundException('That customer was not found.');
        }
        $raw = trim((string) $raw);
        if ($raw === '') {
            $this->pdo->prepare('DELETE FROM customer_limits WHERE customer_name = :n')->execute([':n' => $name]);
            return;
        }
        $cents = self::parseAmount($raw);
        if ($cents === null) {
            throw new ValidationException('Enter a limit like 20 or 12.50.', 'limit');
        }
        $this->pdo->prepare('INSERT INTO customer_limits (customer_name, credit_limit) VALUES (:n, :l)
                             ON DUPLICATE KEY UPDATE credit_limit = VALUES(credit_limit)')
            ->execute([':n' => $name, ':l' => self::dec($cents)]);
    }
}
