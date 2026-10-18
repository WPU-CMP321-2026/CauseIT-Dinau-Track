<?php
require 'auth.php';
require_login();
security_headers();
no_store_headers();
$e = fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1f2f66">
  <meta name="csrf-token" content="<?= $e(csrf_token()) ?>">
  <title>Dinau Treck</title>
  <link rel="icon" type="image/svg+xml" href="assets/img/logo.svg">
  <link rel="stylesheet" href="<?= $e(asset_url('assets/css/app.css')) ?>">
  <script src="<?= $e(asset_url('assets/js/logic.js')) ?>"></script>
  <script src="<?= $e(asset_url('assets/js/app.js')) ?>" defer></script>
</head>
<body>
  <div class="bg-orbs" aria-hidden="true"><span></span><span></span><span></span></div>

  <div class="shell">
    <header class="topbar">
      <h1 class="brand">
        <img src="assets/img/logo.svg" alt="" width="40" height="40">
        <span>Dinau Treck</span>
      </h1>
      <a href="logout.php" class="btn btn-ghost btn-sm">Sign out, <?= $e((string) current_user()) ?></a>
    </header>

    <main>
    <!-- Total owed -->
    <section class="hero" aria-labelledby="heroLabel">
      <p class="hero-label" id="heroLabel">Owed to you</p>
      <p class="hero-amount"><span class="hero-k">K</span><span id="heroAmount">0.00</span></p>
      <p class="hero-sub" id="heroSub" aria-live="polite">Loading…</p>
    </section>

    <!-- Record a dinau -->
    <section class="card add-card" aria-labelledby="addTitle">
      <h2 id="addTitle">Record a dinau</h2>
      <form id="addForm" novalidate autocomplete="off">
        <div class="add-grid">
          <div class="field field-name">
            <label for="name">Customer name</label>
            <input type="text" id="name" name="name" list="nameList" maxlength="100"
                   placeholder="Type a name" autocapitalize="words" autocomplete="off"
                   aria-describedby="nameHint" autofocus>
            <datalist id="nameList"></datalist>
          </div>
          <div class="field field-amount">
            <label for="amount">Amount</label>
            <div class="money">
              <span class="money-k" aria-hidden="true">K</span>
              <input type="text" id="amount" name="amount" inputmode="decimal" placeholder="0.00"
                     autocomplete="off">
            </div>
          </div>
          <div class="field field-note">
            <label for="note">What for? <span class="optional">optional</span></label>
            <input type="text" id="note" name="note" maxlength="200" placeholder="e.g. 2 pies and a drink" autocomplete="off">
          </div>
        </div>

        <p class="hint" id="nameHint" aria-live="polite"></p>

        <!-- Over the credit limit: the dinau cannot be recorded until this is fixed -->
        <div class="limit-block" id="limitBlock" role="alert" hidden>
          <p id="limitMsg"></p>
          <div class="limit-block-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="blockPay" hidden>Record a payment</button>
            <button type="button" class="btn btn-ghost btn-sm" id="blockLimit">Change the limit</button>
          </div>
        </div>
        <p class="error" id="formError" role="alert" hidden></p>

        <div class="due-row">
          <button type="button" class="link-btn" id="dueToggle" aria-expanded="false" aria-controls="duePanel">+ Add a due date</button>
          <div class="due-panel" id="duePanel" hidden>
            <label for="due">Due date</label>
            <input type="date" id="due" name="due">
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-block" id="saveBtn">
          <span class="btn-label" id="saveLabel">Record dinau</span>
          <span class="spinner" aria-hidden="true"></span>
        </button>
      </form>
    </section>

    <!-- Who owes what -->
    <section class="list-section" aria-labelledby="listTitle">
      <div class="list-head">
        <h2 id="listTitle" class="sr-only">Customers</h2>
        <div class="tabs" role="tablist" aria-label="Show">
          <button type="button" role="tab" class="tab is-active" id="tabOwing" data-tab="owing" aria-selected="true">Owing <span class="tab-count" id="countOwing">0</span></button>
          <button type="button" role="tab" class="tab" id="tabPaid" data-tab="paid" aria-selected="false">Paid <span class="tab-count" id="countPaid">0</span></button>
        </div>
        <label class="search" for="search">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="search" placeholder="Search names" autocomplete="off" aria-label="Search names">
        </label>
      </div>

      <div id="list" class="list" role="tabpanel" aria-labelledby="tabOwing" aria-busy="true"></div>
    </section>

    <!-- The credit limit: Iven can set it to any amount -->
    <details class="help card" id="settingsBox">
      <summary>Credit limit</summary>
      <form id="limitForm" class="inline-form settings-form" novalidate>
        <p class="hint" id="limitHint">The most any customer may owe you at once. A dinau that would go over it cannot be recorded until they pay something or you raise the limit. Leave it empty for no limit.</p>
        <label for="defaultLimit" class="sr-only">Credit limit in kina</label>
        <div class="money"><span class="money-k" aria-hidden="true">K</span><input type="text" id="defaultLimit" inputmode="decimal" placeholder="No limit" autocomplete="off"></div>
        <button type="submit" class="btn btn-primary btn-sm">Save limit</button>
        <p class="error" id="limitError" role="alert" hidden></p>
      </form>
    </details>

    <!-- Help: short and always available -->
    <details class="help card">
      <summary>How does this work?</summary>
      <ol>
        <li><strong>Record:</strong> type the customer's name and the amount, then press <kbd>Enter</kbd>. New names are added for you.</li>
        <li><strong>Credit limit:</strong> if a dinau would take someone over the limit, it is not recorded. Record a payment or raise the limit, then try again.</li>
        <li><strong>Get paid:</strong> tap the green tick for one dinau, <em>All paid</em> for everything, or <em>Part payment</em> when they pay some. The balance still owed updates straight away.</li>
        <li><strong>Made a mistake?</strong> Tap <em>Undo</em> in the message at the bottom, or the bin next to a payment.</li>
        <li><strong>Tap a name</strong> to see what they owe, what they have paid and every dinau. <em>Statement</em> lets them see it too.</li>
      </ol>
    </details>
    </main>
  </div>

  <!-- A customer's statement: what they took, what they paid, what is still owed -->
  <dialog id="sheet" class="sheet" aria-labelledby="sheetTitle">
    <div class="sheet-inner">
      <h2 id="sheetTitle"></h2>
      <div id="sheetBody"></div>
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="sheetCopy">Copy text</button>
        <button type="button" class="btn btn-ghost btn-sm" id="sheetPrint">Print</button>
        <button type="button" class="btn btn-primary btn-sm" id="sheetDone" autofocus>Done</button>
      </div>
    </div>
  </dialog>

  <!-- Undo / status messages -->
  <div class="toast-zone" aria-live="polite" aria-atomic="true">
    <div class="toast" id="toast" hidden>
      <span class="toast-text" id="toastText"></span>
      <button type="button" class="toast-undo" id="toastUndo">Undo</button>
      <span class="toast-bar" id="toastBar" aria-hidden="true"></span>
    </div>
  </div>
</body>
</html>
