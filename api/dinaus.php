<?php
/**
 * GET  /api/dinaus.php -> everything the screen shows (see CreditService::snapshot)
 * POST /api/dinaus.php (JSON + X-CSRF-Token header). Replies with the fresh data
 * plus "result" describing what just happened.
 *   {action:"add", name, amount, note?, due_date?}   201; 409 if it would pass the limit
 *   {action:"repay", name, kind:"part"|"dinau"|"all", amount?, dinau_id?}   201
 *   {action:"remove", type:"dinau"|"repayment", ids:[..], removed:true|false}
 *   {action:"set_limit", name, limit}      this customer's own limit ("" = use default)
 *   {action:"set_default_limit", limit}    the limit for everyone else ("" = no limit)
 */
require __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../services/CreditService.php';

/** Clean ids from the request body.
 * @param mixed $raw @return int[] */
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

$service = new CreditService($pdo);

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        respond($service->snapshot());
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond_error('Method not allowed.', 405);
    }

    require_csrf();
    $b = json_input();
    $action = (string) ($b['action'] ?? '');
    $status = 200;

    switch ($action) {
        case 'add':
            $result = $service->addDinau((string) ($b['name'] ?? ''), $b['amount'] ?? '', $b['note'] ?? '', (string) ($b['due_date'] ?? ''));
            $status = 201;
            break;
        case 'repay':
            $result = $service->repay((string) ($b['name'] ?? ''), (string) ($b['kind'] ?? ''), (int) ($b['dinau_id'] ?? 0), $b['amount'] ?? '');
            $status = 201;
            break;
        case 'remove':
            $result = $service->remove((string) ($b['type'] ?? 'dinau'), clean_ids($b['ids'] ?? []), !empty($b['removed']));
            break;
        case 'set_limit':
            $service->setCustomerLimit((string) ($b['name'] ?? ''), $b['limit'] ?? '');
            $result = ['ok' => true];
            break;
        case 'set_default_limit':
            $service->setDefaultLimit($b['limit'] ?? '');
            $result = ['ok' => true];
            break;
        default:
            respond_error('Unknown action.', 422);
    }

    respond(array_merge($service->snapshot(), ['result' => $result]), $status);
} catch (ValidationException $e) {
    respond_error($e->getMessage(), 422, $e->field);
} catch (NotFoundException $e) {
    respond_error($e->getMessage(), 404);
} catch (CreditLimitExceededException $e) {
    respond(['error' => $e->getMessage(), 'field' => 'amount', 'limit' => $e->details()], 409);
} catch (ConflictException $e) {
    respond_error($e->getMessage(), 409);
} catch (PDOException $e) {
    respond_error('Something went wrong saving that. Please try again.', 500);
}
