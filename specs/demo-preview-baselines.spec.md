# Feature: Persistent preview baselines and deferred payroll synchronization

## Overview

Portfolio visitors need enough fictional data to understand each demo without doing setup work. The CN and RCMI previews will therefore restore a small generated baseline after every daily reset, while visitor-created records remain disposable. The shared notice and portfolio labels must distinguish these previews from live production deployments.

This specification also defines the Payroll Splitter hours interaction: dependent hours are calculated only after the edited hours field loses focus, preventing intermediate keystrokes from producing an incorrect derived value.

## User value

- A visitor can immediately inspect realistic application flows.
- A visitor knows the records are fictional and the environment is disposable.
- A portfolio reviewer can distinguish production links from Netlify/Supabase demo links.
- Payroll hours remain stable while a visitor is typing.

## Functional requirements

### FR-HINT-001: Generated sample disclosure

The preview system shall display that sample records are fictional, generated for the portfolio preview, and restored after the daily reset.

### FR-HINT-002: Demo hosting disclosure

The preview system shall display that the demo frontend is hosted on Netlify and the demo backend/database is hosted on Supabase.

### FR-HINT-003: Daily disposal disclosure

The preview system shall continuously display that visitor-created data is cleared daily at 00:00 in `Asia/Manila` and that real or sensitive information must not be entered.

### FR-CN-001: Default accounts

Where the CN demo is active, the system shall restore `admin/password`, `testteacher/password`, and `teststudent/password` as immutable default credentials after every reset.

### FR-CN-002: Non-master default administrator

While the `admin` default account is authenticated, the system shall treat it as a normal administrator and never as a master/developer administrator.

### FR-CN-003: Master-account prevention

When any demo visitor attempts to create or rename an account to the reserved master username `devpau`, the system shall reject the mutation at the server/database authorization boundary.

### FR-CN-004: Restricted navigation

While the `admin` default account is authenticated, the system shall omit `/remaining-classes/permissions`, `/remaining-classes/devtools`, and `/security` from all navigation and tab controls.

### FR-CN-005: Restricted direct access

While the `admin` default account is authenticated, when it directly requests a restricted route or related API operation, the system shall deny access without returning restricted data.

### FR-CN-006: Visible generated baseline

While the `admin` default account is authenticated, the system shall show the generated teachers, students, relative-date schedules, submitted class reports, receipts, class balances, usage, and annual/reporting views that it is allowed to access.

### FR-CN-007: Relative schedule dates

When the daily reset restores CN baseline schedules and reports, the system shall derive their dates from the current logical `Asia/Manila` reset date so that past, current, and upcoming examples remain meaningful.

### FR-RCMI-001: Generated directory baseline

Where the RCMI demo is active, the system shall restore a small fictional directory containing leaders, members, guests, leader relationships, and district-leader relationships.

### FR-RCMI-002: Generated attendance baseline

When the daily reset restores RCMI attendance, the system shall derive sample attendance dates from the current logical `Asia/Manila` reset date.

### FR-RESET-001: Baseline preservation

When the 00:00 daily reset runs, the system shall delete visitor-created data and idempotently restore the exact protected credentials and generated baseline records.

### FR-RESET-002: Stable baseline identity

When a reset is retried, the system shall use stable baseline keys or identifiers so that protected records are not duplicated.

### FR-PAYROLL-001: Draft while typing

While an hours input has focus, when the visitor types in Total Hours or any person-hours field, the system shall update only the active draft and shall not synchronize a dependent hours field.

### FR-PAYROLL-002: Synchronize on blur

While exactly one hours field can be derived, when the edited Total Hours or person-hours field loses focus, the system shall calculate the missing dependent field once using the completed value.

### FR-PAYROLL-003: Bidirectional behavior

When either Total Hours or a person-hours field loses focus, the system shall apply the same missing-field derivation rule regardless of which side was edited first.

### FR-PAYROLL-004: Active-field safety

While an hours field has focus, the system shall never overwrite that active field with a programmatically derived value.

### FR-PAYROLL-005: Invalid hours

When an hours value is empty, non-finite, negative, or otherwise invalid, the system shall avoid deriving a dependent field and shall show bounded validation feedback.

### FR-PORTFOLIO-001: Production and preview distinction

Where a portfolio project has both a live production link and a demo link, the portfolio shall label them separately and describe the demo as a disposable Netlify frontend with a Supabase backend/database.

## Non-functional requirements

### Security

- Route hiding is user experience only; server/database authorization is authoritative.
- No browser role may create a master account, grant itself restricted permissions, invoke reset routines, or modify protected credentials/baseline identity.
- All generated records must be fictional and contain no copied production or original runtime data.
- Errors must not expose password hashes, secret keys, internal SQL, or restricted security data.

### Reliability

- Baseline restore operations must be deterministic and idempotent.
- Partial reset retries must converge to one complete baseline without duplicates.
- Relative dates must use the logical `Asia/Manila` date, not the Edge Function region or browser timezone.

### Usability and accessibility

- Preview, generated-data, daily-reset, and hosting disclosures must remain keyboard-readable and visible on mobile layouts.
- Payroll blur behavior must also work for keyboard tab navigation.
- The portfolio must not visually imply that a disposable preview is the production deployment.

### Performance

- The small baseline shall remain within free-tier quotas and be restored in one bounded database transaction per application.
- Payroll blur synchronization shall complete without perceptible delay for the supported number of people.

## Acceptance criteria

### AC-001: CN login hint uses the new administrator

Given a visitor opens the CN login page
When the shared demo credentials are displayed
Then the administrator username is `admin`
And `devpau` is not offered as a login credential.

### AC-002: CN sample data is visible

Given the visitor signs in as `admin`
When they open accounts, schedules, reports, and allowed remaining-class views
Then the generated teachers, students, schedules, reports, receipts, balances, and usage are visible
And the records are identified collectively as fictional preview data.

### AC-003: CN restricted controls are absent

Given the visitor is signed in as `admin`
When navigation and Remaining Classes tabs render
Then Permissions, Dev Tools, and Security controls are absent.

### AC-004: CN direct authorization is denied

Given the visitor is signed in as `admin`
When they directly request a restricted route or corresponding API
Then the request is redirected or returns a generic forbidden response
And no restricted payload is returned.

### AC-005: Master username cannot be created

Given the visitor is signed in as `admin`
When they attempt to create or rename any admin to `devpau`, including through a direct API call
Then the mutation is rejected
And no master-capable account is stored.

### AC-006: Persistent reset baseline

Given visitors have added, edited, or deleted demo records
When the daily reset completes or is safely retried
Then visitor-created changes are removed
And the approved baseline appears exactly once
And all protected credentials remain unchanged.

### AC-007: RCMI opens with sample records

Given the RCMI reset has completed
When a visitor opens the directory and attendance views
Then eight fictional directory entries and a small relative-date attendance history are available.

### AC-008: Shared deployment disclosure

Given any demo page is open
When the persistent notice renders
Then it identifies Netlify as the demo frontend host
And Supabase as the demo backend/database
And it states that sample data is fictional and restored after reset.

### AC-009: Payroll does not derive while typing

Given exactly one related hours field is empty
When a visitor types multiple characters into Total Hours or a person-hours field without leaving it
Then the dependent field does not change between keystrokes.

### AC-010: Payroll derives on blur in either direction

Given exactly one related hours field is empty and all required values are valid
When the edited Total Hours or person-hours field loses focus
Then the missing field is calculated once from the completed value
And keyboard tabbing produces the same result as pointer focus changes.

### AC-011: Portfolio labels production separately

Given a project card contains production and preview destinations
When the portfolio renders the project actions
Then the production destination retains its production deployment description
And the preview destination is labeled as a disposable Netlify/Supabase portfolio demo.

## Error handling

| Condition | Required behavior | Public message |
| --- | --- | --- |
| Default credential mutation | Reject at server/database boundary | `Demo credentials cannot be changed.` |
| Restricted CN route/API | Return no restricted data; redirect or 403 | `This area is not available in the portfolio demo.` |
| Reserved `devpau` username | Reject create/update transaction | `That username is unavailable in this demo.` |
| Baseline reference is invalid | Abort reset transaction and retain retryable state | Generic delayed-reset status only |
| Baseline restore partially fails | Roll back database stage or preserve durable partial state | Generic delayed-reset status only |
| Payroll hours are invalid | Keep dependent field unchanged | `Enter valid non-negative hours.` |
| Demo backend is unavailable | Fail closed for protected actions | Generic temporary-unavailable message |

## Implementation TODO

### Shared platform

- [x] Replace the CN public administrator credential contract with `admin/password`.
- [x] Add generated-data and Netlify/Supabase deployment disclosures.
- [x] Define immutable CN and RCMI baseline records with relative dates and stable keys.
- [x] Define the payroll blur-synchronization behavior contract.
- [ ] Map each baseline contract to its future PostgreSQL app schema and reset handler.

### CN demo adaptation

- [ ] Seed the approved accounts, teachers, students, schedules, reports, transactions, and usage.
- [ ] Prevent `devpau` creation/rename and all master privilege escalation at the database/API layers.
- [ ] Hide restricted navigation and deny direct route/API access for `admin`.
- [ ] Add direct authorization, reset-idempotency, and credential-immutability tests.

### RCMI demo adaptation

- [ ] Seed members, hierarchy, role history, and attendance from the approved baseline.
- [ ] Add reset-idempotency and visitor-data disposal tests.

### Payroll demo adaptation

- [ ] Move dependent-hours synchronization from `input` to `blur` in the isolated demo copy.
- [ ] Add keyboard, pointer, invalid-value, and bidirectional calculation tests.

### Portfolio integration

- [ ] Add distinct production and preview actions during the final portfolio phase.
- [ ] Label the preview hosting and disposable-data behavior.

## Out of scope for this sub-phase

- Importing or modifying any original project source.
- Creating the app-specific PostgreSQL schemas or seed migrations.
- Deploying to Supabase or Netlify.
- Editing the portfolio before the final integration phase.

## Open questions

None. The baseline sizes and generic display names are intentionally conservative and can be expanded in a later approved sub-phase without changing the reset/security rules.
