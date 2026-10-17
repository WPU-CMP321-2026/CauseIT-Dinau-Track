<?php
/**
 * Integration test for the credit limit and part-payment rules, over HTTP.
 *   php scripts/test_limits.php http://localhost:8000 iven "your-password"
 *
 * RUN IT ONLY ON A DISPOSABLE DATABASE: it records test customers (names starting
 * "ZZ Test") and changes the default limit (it puts the original back at the end).
 */
if (PHP_SAPI !== 'cli') { exit("Run this from the command line.\n"); }
[$script, $base, $user, $pass] = array_pad($argv, 4, '');
if ($base === '' || $user === '' || $pass === '') { fwrite(STDERR, "Usage: php scripts/test_limits.php <base-url> <username> <password>\n"); exit(2); }
$base = rtrim($base, '/');
$jar = tempnam(sys_get_temp_dir(), 'jar');

function http(string $method, string $url, ?array $json = null, ?string $csrf = null, ?array $form = null): array
{
    global $jar;
    $ch = curl_init($url);
    $headers = [];
    if ($json !== null) { $headers[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($json)); }
    if ($form !== null) { curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($form)); }
    if ($csrf) { $headers[] = 'X-CSRF-Token: ' . $csrf; }
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar, CURLOPT_FOLLOWLOCATION => false]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, $body, json_decode((string) $body, true)];
}

// Sign in.
[, $html] = http('GET', "$base/login.php");
preg_match('/name="csrf_token" value="([^"]+)"/', $html, $m);
http('POST', "$base/login.php", null, null, ['csrf_token' => $m[1], 'username' => $user, 'password' => $pass]);
[, $page] = http('GET', "$base/Dinau.php");
if (!preg_match('/csrf-token" content="([^"]+)"/', $page, $m)) { fwrite(STDERR, "Could not sign in.\n"); exit(2); }
$csrf = $m[1];

$pass_n = 0; $fail_n = 0;
function check(string $label, bool $ok, string $extra = ''): void
{
    global $pass_n, $fail_n;
    if ($ok) { $pass_n++; echo "[PASS] $label\n"; } else { $fail_n++; echo "[FAIL] $label $extra\n"; }
}
function post(array $body): array { global $base, $csrf; return http('POST', "$base/api/dinaus.php", $body, $csrf); }
function snap(): array { global $base; return http('GET', "$base/api/dinaus.php")[2]; }
function owed(string $name): int
{
    $t = 0;
    foreach (snap()['dinaus'] as $d) if (strcasecmp($d['name'], $name) === 0) $t += $d['remaining_cents'];
    return $t;
}
function dinau_count(string $name): int
{
    return count(array_filter(snap()['dinaus'], fn ($d) => strcasecmp($d['name'], $name) === 0));
}

$original = snap()['default_limit_cents'];

echo "--- access\n";
[$c] = http('GET', "$base/api/dinaus.php", null, null); // still signed in
check('signed in can read', $c === 200);
[$c] = http('POST', "$base/api/dinaus.php", ['action' => 'add', 'name' => 'ZZ Test X', 'amount' => '1']);
check('POST without CSRF token is refused (403)', $c === 403, "got $c");

echo "--- the limit is configurable\n";
[$c, , $j] = post(['action' => 'set_default_limit', 'limit' => '10']);
check('Iven sets the limit to K10', $c === 200 && $j['default_limit_cents'] === 1000);
[$c] = post(['action' => 'set_default_limit', 'limit' => 'abc']);
check('a junk limit is rejected (422)', $c === 422);

echo "--- the K10 limit with K6 already owed (the brief's example)\n";
[$c, , $j] = post(['action' => 'add', 'name' => 'ZZ Test Mary', 'amount' => '6', 'note' => 'pies']);
check('K6 dinau is recorded', $c === 201 && owed('ZZ Test Mary') === 600);
[$c, , $j] = post(['action' => 'add', 'name' => 'ZZ Test Mary', 'amount' => '5']);
check('an extra K5 dinau is REFUSED (409)', $c === 409, "got $c");
check('the refusal names the balance, the limit and what is left', isset($j['error']) && str_contains($j['error'], 'K6.00') && str_contains($j['error'], 'K10.00') && str_contains($j['error'], 'only K4.00 more'), $j['error'] ?? '');
check('the refusal tells Iven how to fix it', str_contains($j['error'] ?? '', 'Record a payment or raise the limit'));
check('the refused dinau was NOT stored', owed('ZZ Test Mary') === 600 && dinau_count('ZZ Test Mary') === 1);
check('the reply carries the numbers (available K4.00)', ($j['limit']['available_cents'] ?? null) === 400);
[$c] = post(['action' => 'add', 'name' => 'zz test mary', 'amount' => '5']);
check('capital letters in the name do not dodge the limit', $c === 409);
[$c] = post(['action' => 'add', 'name' => 'ZZ Test Mary', 'amount' => '4']);
check('K4 more is allowed: exactly at the limit', $c === 201 && owed('ZZ Test Mary') === 1000);
[$c, , $j] = post(['action' => 'add', 'name' => 'ZZ Test Mary', 'amount' => '0.01']);
check('even 1 toea more is refused, "nothing more can be recorded"', $c === 409 && str_contains($j['error'], 'nothing more'));

echo "--- partial repayments\n";
[$c, , $j] = post(['action' => 'repay', 'name' => 'ZZ Test Mary', 'kind' => 'part', 'amount' => '3']);
check('Iven records a K3 part payment', $c === 201 && $j['result']['balance_cents'] === 700);
check('the remaining balance is updated automatically (K7.00)', owed('ZZ Test Mary') === 700);
$reps = array_values(array_filter(snap()['repayments'], fn ($r) => $r['name'] === 'ZZ Test Mary'));
check('the repayment is listed with its amount and date', count($reps) === 1 && $reps[0]['cents'] === 300 && $reps[0]['created_at'] === date('Y-m-d H:i:s', strtotime($reps[0]['created_at'])));
$mine = array_values(array_filter(snap()['dinaus'], fn ($d) => $d['name'] === 'ZZ Test Mary'));
usort($mine, fn ($a, $b) => $a['id'] <=> $b['id']);
check('the part payment settled the OLDEST dinau first (K6 -> K3 left; K4 untouched)', $mine[0]['remaining_cents'] === 300 && $mine[1]['remaining_cents'] === 400);
[$c, , $j] = post(['action' => 'repay', 'name' => 'ZZ Test Mary', 'kind' => 'part', 'amount' => '50']);
check('paying more than is owed is refused (422)', $c === 422 && str_contains($j['error'], 'only owes K7.00'));
[$c] = post(['action' => 'repay', 'name' => 'ZZ Test Mary', 'kind' => 'part', 'amount' => '-2']);
check('a negative payment is refused (422)', $c === 422);
[$c, , $j] = post(['action' => 'repay', 'name' => 'ZZ Test Mary', 'kind' => 'part', 'amount' => '4']);
check('a payment that spans two dinaus works (K3 + K1)', $c === 201 && owed('ZZ Test Mary') === 300);
$mine = array_values(array_filter(snap()['dinaus'], fn ($d) => $d['name'] === 'ZZ Test Mary'));
usort($mine, fn ($a, $b) => $a['id'] <=> $b['id']);
check('...first dinau fully paid, second has K3 left', $mine[0]['remaining_cents'] === 0 && $mine[1]['remaining_cents'] === 300);

echo "--- paying down makes room under the limit\n";
[$c] = post(['action' => 'add', 'name' => 'ZZ Test Mary', 'amount' => '8']);
check('K8 more is refused (3 owed + 8 > 10)', $c === 409);
[$c] = post(['action' => 'add', 'name' => 'ZZ Test Mary', 'amount' => '7']);
check('K7 more is allowed once the balance was reduced (3 + 7 = 10)', $c === 201 && owed('ZZ Test Mary') === 1000);

echo "--- adjusting the limit\n";
[$c] = post(['action' => 'add', 'name' => 'ZZ Test Mary', 'amount' => '5']);
check('blocked again at K10', $c === 409);
[$c, , $j] = post(['action' => 'set_limit', 'name' => 'ZZ Test Mary', 'limit' => '25']);
check('Iven gives Mary her own K25 limit', $c === 200);
[$c] = post(['action' => 'add', 'name' => 'ZZ Test Mary', 'amount' => '5']);
check('the K5 dinau now goes through', $c === 201 && owed('ZZ Test Mary') === 1500);
[$c] = post(['action' => 'add', 'name' => 'ZZ Test Tom', 'amount' => '11']);
check("another customer still has the K10 default: K11 refused", $c === 409);
[$c, , $j] = post(['action' => 'add', 'name' => 'ZZ Test Tom', 'amount' => '10']);
check("...and K10 is fine for a new customer", $c === 201);
[$c] = post(['action' => 'set_limit', 'name' => 'ZZ Test Mary', 'limit' => '']);
check("Mary goes back to the default limit", $c === 200);
[$c] = post(['action' => 'add', 'name' => 'ZZ Test Mary', 'amount' => '1']);
check('over the limit already (K15 > K10): new dinaus are refused, old balance kept', $c === 409 && owed('ZZ Test Mary') === 1500);
post(['action' => 'set_default_limit', 'limit' => '']);
[$c] = post(['action' => 'add', 'name' => 'ZZ Test Mary', 'amount' => '500']);
check('with the limit cleared ("no limit") anything goes through', $c === 201);

echo "--- other repayment kinds, undo\n";
[$c, , $j] = post(['action' => 'repay', 'name' => 'zz test tom', 'kind' => 'all']);
check('"all paid" clears Tom (balance K0.00)', $c === 201 && $j['result']['balance_cents'] === 0 && owed('ZZ Test Tom') === 0);
$rid = $j['result']['repayment_id'];
[$c] = post(['action' => 'repay', 'name' => 'ZZ Test Tom', 'kind' => 'all']);
check('paying someone who owes nothing is refused (409)', $c === 409);
[$c] = post(['action' => 'remove', 'type' => 'repayment', 'ids' => [$rid], 'removed' => true]);
check('Undo of a payment puts the debt back (K10.00)', $c === 200 && owed('ZZ Test Tom') === 1000);
$tomD = array_values(array_filter(snap()['dinaus'], fn ($d) => $d['name'] === 'ZZ Test Tom'))[0];
[$c, , $j] = post(['action' => 'repay', 'name' => 'ZZ Test Tom', 'kind' => 'dinau', 'dinau_id' => $tomD['id']]);
check('tick on one dinau pays what is left on it', $c === 201 && owed('ZZ Test Tom') === 0);
[$c] = post(['action' => 'remove', 'type' => 'dinau', 'ids' => [$tomD['id']], 'removed' => true]);
check('a dinau that has payments cannot be removed (409)', $c === 409);
$newD = post(['action' => 'add', 'name' => 'ZZ Test Tom', 'amount' => '2'])[2]['result']['dinau_id'];
[$c] = post(['action' => 'remove', 'type' => 'dinau', 'ids' => [$newD], 'removed' => true]);
check('an unpaid dinau can be removed, and Undo brings it back', $c === 200 && owed('ZZ Test Tom') === 0);
post(['action' => 'remove', 'type' => 'dinau', 'ids' => [$newD], 'removed' => false]);
check('...restored', owed('ZZ Test Tom') === 200);

// Put the default limit back the way it was.
post(['action' => 'set_default_limit', 'limit' => $original === null ? '' : number_format($original / 100, 2, '.', '')]);
@unlink($jar);
echo "\n== $pass_n passed, $fail_n failed ==\n";
exit($fail_n === 0 ? 0 : 1);
