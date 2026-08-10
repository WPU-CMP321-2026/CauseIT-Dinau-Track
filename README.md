# CMP321 Week 4 — Service Layer & Exception Handling (Kokoa Treda)

This is the Week 4 Coding Lab starter/reference repository. It builds a
service layer on top of the Week 3 Farmer/Purchase models: purchase rules and
CRUD logic live in `services/purchaseService.js`, rather than being repeated
across route handlers, command-line tools, and tests.

Starter repository:
<https://github.com/WPU-CMP321-2026/cmp321-week4-business-logic>

## Learning goals

Students should be able to:

- explain why business logic belongs in a service layer rather than directly
  in route handlers or ORM models;
- implement Create, Read, Update, and Delete operations through a service
  method instead of adding ORM calls to each application caller;
- define and raise a custom exception type instead of a generic `Error`; and
- catch a specific exception type and decide what to do about it.

## Get your own working copy

Use the Week 4 assignment link in Moodle. Accept the GitHub Classroom task or
fork this starter before editing; do not push student work to the shared
starter branch. If GitHub access is unavailable, extract the source-only ZIP
provided in Moodle and follow the lecturer's repository instructions.

## Run the examples

Install a supported Node.js LTS release. Node.js 24 is recommended; Node.js 22
is also supported.

```bash
npm ci
npm test
npm run demo
```

The clean starter has eight passing tests. Package installation needs internet
once; the tests and demo then run offline.

## Repository map

| File | Teaching purpose |
| --- | --- |
| `services/purchaseService.js` | Service methods for Create, Read, Update, and Delete purchase operations. |
| `services/errors.js` | `FarmerNotFoundError`, `InvalidPurchaseError`, and `PurchaseNotFoundError`. |
| `demo.js` | Calls the service and catches two deliberate failures by type. |
| `tests/service.test.js` | Covers CRUD operations and exception paths. Test setup seeds prerequisite Farmer rows directly; assessed purchase operations go through `PurchaseService`. |
| `models/`, `db.js` | The Week 3 data-access layer on which this week's service layer depends. |

## Coding Lab task

Starting from `services/purchaseService.js`, add one new service method of your
own, such as `averagePriceForFarmer(farmerId)` or
`listPurchasesAbove(farmerId, weightKg)`. It must:

1. raise `FarmerNotFoundError` if the farmer does not exist;
2. keep any new purchase data access inside `PurchaseService` rather than
   adding ORM/SQL calls to a caller; and
3. be covered by at least one passing test in `tests/service.test.js`.

Follow the Coding Lab brief in Moodle for the submission evidence, reflection,
AI-use declaration, deadline, and five-mark rubric.

## Optional AI-assisted debugging exercise

After you have written your own code, you may ask an AI assistant:

> Explain three plausible causes of the first failing assertion in my test
> output. Do not write or change any code. Tell me what evidence I should
> inspect to distinguish the causes.

Use the response as hypotheses, not as a solution. Inspect the failure,
identify the real cause yourself, and declare any AI use in the Moodle
reflection. Your submitted method and test remain your responsibility.

## Lecturer reset

Every test and the demo build a fresh in-memory database, so nothing carries
over between runs.
