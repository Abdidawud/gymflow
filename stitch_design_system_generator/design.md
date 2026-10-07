# GymFlow — Version 1 Frontend Design Specification

Use this document as the source of truth for Google Stitch and frontend implementation. Version 1 is a staff-facing gym membership and payment tracker for one gym. All names, totals, and transactions below are fictional design fixtures.

## 1. Product purpose and scope

The main workflow is: member arrives → staff searches by name, phone, or member ID → staff sees membership validity → staff records a payment and renews membership when needed.

### Included in Version 1

- Administrator and receptionist login, logout, password recovery, and change password.
- Dashboard with membership counts, revenue summaries, recent payments, and expiring members.
- Register, search, filter, view, and edit members; archive members without deleting history.
- Create, edit, and disable membership plans.
- Record full membership payments using cash, bank transfer, card, or mobile payment as manually recorded methods.
- Automatically calculate membership dates and status; renew an existing member.
- Payment and membership history; payment details and a printable receipt.
- Basic date-filtered revenue and membership reports.
- Administrator management of staff accounts and essential gym settings.
- Responsive layouts, light/dark appearance, validation, loading, empty, error, and success states.

### Deferred beyond Version 1

Attendance, check-in/check-out, QR scanning, automated SMS/email/WhatsApp reminders, notification feeds, online payment processing, partial payments/debt tracking, refunds, membership freezing, multiple branches, advanced analytics, retention forecasting, and Excel/PDF report export.

Do not show navigation links, buttons, counters, or placeholder features for deferred functionality. A browser-printable payment receipt is included; a separate PDF download service is not required.

## 2. Roles and permissions

| Capability | Administrator | Receptionist |
| --- | --- | --- |
| View dashboard and member status | Yes | Yes |
| Register/edit members | Yes | Yes |
| Record payments and renew memberships | Yes | Yes |
| View payment details, history, and receipts | Yes | Yes |
| Archive/reactivate member records | Yes | No |
| Create/edit/disable plans | Yes | No |
| View gym-wide financial reports | Yes | No |
| Manage staff and gym settings | Yes | No |
| Change own password and appearance | Yes | Yes |

Hide administrator-only navigation and actions for receptionists. Protected routes also need an access-denied screen; backend authorization must enforce the same rules. Receptionists see operational membership counts and recent payment activity; gym-wide revenue summary cards are administrator-only.

## 3. Design direction

Premium but practical SaaS dashboard. Prioritize fast member lookup, readable status labels, and short payment workflows. Use strong typography, generous whitespace, restrained shadows, clean tables, and minimal decorative effects.

### Design tokens

| Token | Light | Dark |
| --- | --- | --- |
| Page background | #F8FAFC | #0F172A |
| Surface | #FFFFFF | #1E293B |
| Primary text | #0F172A | #F8FAFC |
| Secondary text | #475569 | #CBD5E1 |
| Border | #E2E8F0 | #475569 |
| Primary action | #4338CA | #A5B4FC |
| Text on primary action | #FFFFFF | #0F172A |
| Active badge text/background | #166534 / #DCFCE7 | #BBF7D0 / #14532D |
| Expiring badge text/background | #92400E / #FEF3C7 | #FDE68A / #78350F |
| Expired badge text/background | #991B1B / #FEE2E2 | #FECACA / #7F1D1D |
| Neutral badge text/background | #334155 / #E2E8F0 | #E2E8F0 / #334155 |

- Typeface: Inter or a similar sans-serif; body 14–16px, page headings 26–32px, metric values 28–36px.
- Spacing: 8px base scale, with 4px for tight label/icon spacing.
- Card radius 12px; input/button radius 8px; pill status badges.
- Desktop sidebar 248px; header 72px; content padding 24–32px.
- Consistent outline icons; always pair unfamiliar icons with labels.
- Primary buttons use the primary action color. Red is reserved for destructive actions and expired/error states.
- Minimum 44px touch targets, visible keyboard focus, associated input labels, keyboard-accessible dialogs, and WCAG AA contrast verification.
- Status must always include text; color alone is insufficient.
- Respect reduced motion and avoid distracting animations.

## 4. Shared application shell

Sidebar brand: **GymFlow**. Display the configured gym name beneath it, for example **Adama Fitness**.

Main navigation: Dashboard, Members, Payments, Memberships.

Administrator management navigation: Membership Plans, Reports, Staff & Users, Settings.

Sidebar footer: user avatar/initials, name, role, My Account, Sign Out. Example: Abdi Dawud — Administrator.

Header: current page title, desktop member lookup shortcut, appearance toggle, user menu. Do not include a notification bell in Version 1.

Member lookup placeholder: **Search members by name, phone or ID…**. A selected result opens the member profile. Each result shows name, ID, phone, and membership status.

Use breadcrumbs on detail and form pages. Keep primary actions in a consistent upper-right location. On mobile, use a hamburger drawer and prominent local search.

## 5. Dates, payment rules, and status definitions

These rules must be consistent across every screen and mockup.

- Currency: ETB, formatted as **1,500.00 ETB**.
- Timezone: Africa/Addis_Ababa. Calculate “today” using the gym timezone.
- Dates use Gregorian calendar dates; display **Oct 07, 2026**. No Ethiopian calendar conversion is included in Version 1.
- Plans use a fixed number of days, not calendar-month arithmetic. “Monthly” means 30 days; show this beside the plan name.
- Start and end dates are inclusive. `end date = start date + duration days − 1`.
- Membership stays valid through the end date and expires the following day.
- Remaining days exclude today: `end date − today`. On the end date display **Expires today**, not “Expired.”
- Default expiration warning is 7 days, configurable by the administrator.
- Active: a paid membership covers today and has more than the warning threshold remaining.
- Expiring Soon: a paid membership covers today and has 0–7 remaining days under the default setting.
- Expired: no period covers today and the latest paid period ended before today.
- Unpaid: the member has never had a paid membership.
- Scheduled: the next paid membership begins in the future and no period covers today. Display **Starts Oct 12**; scheduled members do not currently have gym access.
- Archived is a separate member-account state. An archived account remains visible in history but cannot be renewed until reactivated.
- Payment status and membership status are different. A payment can be **Paid** while the purchased membership is now **Expired**.
- Registering a member does not mark them paid. Staff may save a member with no membership, then choose **Record Payment**.
- Full payment is required to create a membership. Version 1 has no pending, partial, failed gateway, or debt states.
- Active-member renewal starts the day after the latest end date in the member’s current continuous chain of paid periods. Show any scheduled renewals in the preview to avoid overlap.
- Expired/unpaid-member purchase defaults to today. Staff can select today or a future start date; backdating and overlapping periods are not supported in Version 1.
- Creating the payment and membership is one atomic operation. Disable repeated submission and prevent duplicate records on retries.
- Plan price/name/duration at purchase time remain preserved in history after a plan is edited. Disabled plans cannot be selected for new purchases.
- Posted payments are read-only in Version 1. Staff correct entry mistakes before confirmation; payment correction/refund workflows are deferred.

### Consistent design fixtures

Freeze mockup “today” at **Oct 07, 2026**. Actual implementation uses the current gym date.

| Member | Member ID | Phone | Plan | Paid membership period | Status on Oct 07 |
| --- | --- | --- | --- | --- | --- |
| Abebe Kebede | GYM-00124 | 0911 234 567 | Monthly — 30 days | Oct 01–Oct 30, 2026 | Active; 23 days left |
| Hana Tesfaye | GYM-00125 | 0922 456 789 | 3 Months — 90 days | Jul 13–Oct 10, 2026 | Expiring Soon; 3 days left |
| Dawit Bekele | GYM-00126 | 0933 567 890 | Monthly — 30 days | Sep 01–Sep 30, 2026 | Expired |
| Sara Mohammed | GYM-00127 | 0944 678 901 | None | None | Unpaid |
| Meron Alemu | GYM-00128 | 0955 789 012 | Monthly — 30 days | Oct 12–Nov 10, 2026 | Scheduled |

## 6. Screen inventory and routes

| Screen | Route or presentation | Access |
| --- | --- | --- |
| Login | /login | Public |
| Forgot password | /forgot-password | Public |
| Reset password | /reset-password | Valid reset link |
| Dashboard | /dashboard | Both roles |
| Members list | /members | Both roles |
| Register member | /members/new | Both roles |
| Member profile | /members/[id] | Both roles |
| Edit member | /members/[id]/edit | Both roles |
| Record payment / renew | Shared drawer from member, payments, or memberships | Both roles |
| Payments list | /payments | Both roles |
| Payment details / receipt | /payments/[id] | Both roles |
| Memberships list | /memberships | Both roles |
| Plans list and add/edit dialog | /plans | Administrator |
| Basic reports | /reports | Administrator |
| Staff list and add/edit dialog | /users | Administrator |
| Gym settings | /settings | Administrator |
| My Account | /account | Both roles |
| Access denied / not found | Shared error screens | Context-dependent |

## 7. Authentication screens

### Login

Desktop split layout: modest gym branding on the left and a focused form on the right. On mobile show branding above the form.

- Brand: GymFlow.
- Headline: **Manage your gym with confidence.**
- Supporting text: **Members, payments and memberships — all in one place.**
- Form heading: **Welcome back**.
- Description: **Sign in to manage your gym.**
- Required fields: Email address, Password.
- Controls: password visibility toggle, Forgot password?, Sign In.
- Loading label: **Signing in…**.
- Error: **Email or password is incorrect.** Do not reveal whether an account exists.
- Deactivated account/session errors should offer a route back to sign-in or help from the gym administrator.
- No public self-registration or member portal.

### Forgot and reset password

Forgot password: **Reset your password**, email field, **Send reset link**, **Back to sign in**. Confirmation: **If an account exists for this email, you’ll receive a reset link.**

Reset screen: New password, Confirm password, visibility toggles, **Reset Password**. Show configured password requirements before submission. Expired/invalid link state: **This reset link has expired or is invalid. Request a new link.** Success: **Password updated. Sign in with your new password.**

## 8. Dashboard

Title: **Dashboard**. Subtitle: **Here’s what’s happening at your gym today.** Primary action: **Add Member**; secondary action: **Record Payment**.

Membership cards: Total Members 350; Active 287; Expiring Soon 20; Expired 35; Unpaid 8. In this dashboard fixture there are no scheduled memberships. Active includes Expiring Soon; show helper text **Includes 20 expiring soon**. The totals reconcile: 287 + 35 + 8 = 350. Archived members are excluded.

Administrator revenue cards: Today’s Revenue **8,500.00 ETB**; This Month **125,000.00 ETB**. Do not show attendance metrics.

Administrator chart: **Revenue Overview**, a simple revenue trend with **7 Days / 30 Days** selector, ETB axis, date labels, and readable tooltip. Generate chart fixtures consistent with displayed totals.

**Expiring Soon** table: Member, Phone, Plan, Expiry Date, Days Left, View/Renew. Include Hana Tesfaye from the fixture. Link: **View all expiring memberships**.

**Recent Payments** table: Payment ID, Member, Plan, Amount, Method, Date, Paid badge. Link: **View all payments**. Receptionists see this operational list but no aggregated revenue chart/cards.

Empty first-run state: **Start managing your gym** with administrator **Create Plan** and both-role **Add Member** actions. If no plans exist, payment actions explain that an administrator must create a plan first.

## 9. Members list

Title: **Members**. Subtitle: **Find members and check their membership status.** Primary action: **Add Member**.

Search: **Search by name, phone number or member ID…**. Filters: Membership Status, Plan, Account Status (Current/Archived). Clear Filters button. Normalize spaces and phone formatting for lookup.

Table columns: Member avatar/name, Member ID, Phone, Current/Next Plan, Membership End, Status, Actions. Unpaid dates/plans display an em dash. Scheduled rows show start and end dates.

Actions: View Profile, Record Payment/Renew Membership, Edit Member; administrator-only Archive/Reactivate. Pagination shows **Showing 1–10 of 350 members**, page size options 10/25/50, and previous/next controls. Keep filters when opening a profile and returning.

No result copy: **No members found**. **Try another name, phone number or member ID.** Actions: Clear Filters, Add Member.

Archive confirmation: **Archive this member?** / **Their payment and membership history will be preserved.** Buttons: Cancel, Archive Member. Archived profile displays a clear banner and administrator Reactivate action.

## 10. Register and edit member

Heading: **Add New Member**. Description: **Register a gym member, then record their first payment.**

Personal Information: First Name*, Last Name*, Phone Number*, Email optional, Gender optional, Profile Photo optional. Use avatar initials when no photo is supplied.

Emergency Contact: Contact Name, Contact Phone, Relationship — all optional.

Additional Information: Address optional, Notes optional. Member ID and registration date are generated automatically and not editable.

Actions: Cancel, **Save Member**. After saving, open the profile and show **Member registered successfully.** Provide **Record First Payment**. Do not require a plan or claim payment occurred during registration.

Validation: trim names; require nonempty names; accept local Ethiopian and +251 phone forms and normalize storage; validate email when provided; warn on a phone already assigned to a member and let staff open that existing record. Version 1 assumes one unique primary phone per member. If either emergency name or phone is entered, require both. Photo accepts JPEG/PNG/WebP up to 5 MB; show preview, remove, and upload-error states.

Edit screen uses the same sections, existing values, **Save Changes**, and unsaved-change confirmation when leaving. Membership dates and payment records are not editable here.

## 11. Member profile

Breadcrumb: **Members > Abebe Kebede**. Header: avatar, name, GYM-00124, phone, optional email, status badge.

Actions: **Renew Membership** for a member with prior membership; **Record First Payment** for unpaid; **Edit Member**. Use the same payment drawer for both payment actions.

Membership card: Current Plan, Start Date, End Date, Days Remaining, and plain-language validity. Abebe: Monthly — 30 days; Oct 01–Oct 30; 23 days left. An optional duration progress bar must match the inclusive 30-day period. Show scheduled next periods separately.

Tabs:

- Overview: personal details, emergency contact, notes, registration date.
- Payment History: Payment ID, Payment Date, Plan, Method, Amount, Paid badge, View Receipt.
- Membership History: Plan snapshot, Start, End, derived Status, linked Payment ID.

Unpaid state: **No paid membership yet** and **Record First Payment**. Expired state: **Membership expired on Sep 30, 2026** and **Renew Membership**. Scheduled state: **Membership starts on Oct 12, 2026**. Never present future membership as currently valid.

## 12. Record payment and renewal drawer

Use one shared right-side drawer on desktop and a full-screen dialog on mobile. Titles: **Record Payment** or **Renew Membership**. Preserve the underlying screen when closing.

1. Select a member when opened globally. Search by name/phone/ID; show selected member and status. Preselect member when opened from their profile.
2. Select an enabled Membership Plan*. Show plan name, duration, and price.
3. Amount is populated from the plan and read-only in Version 1; show ETB clearly.
4. Payment Method*: Cash, Bank Transfer, Card, Mobile Payment. These record payments already received; no payment gateway is involved.
5. Payment Date*: default today; allow an earlier received date, but no future payment date.
6. Transaction Reference: required for bank transfer/card/mobile payment, optional for cash.
7. Membership Start*: today/future for expired or unpaid members; automatically determined and read-only for continuous renewals.
8. Notes optional.

Preview before confirmation: Member, Plan, Amount, Payment Method, Payment Date, Membership Start, Membership End, and current membership if any.

Abebe renewal example: existing end Oct 30; new start Oct 31; 30-day end Nov 29; amount 1,500.00 ETB. If another renewal already covers those dates, extend after it and update the preview.

Buttons: Cancel, **Confirm Payment**. Helper: **Confirm only after receiving the full payment.** Loading: **Recording payment…**. Prevent closing/submitting again during completion. Failure keeps entries and shows **Couldn’t record payment. Try again.** An uncertain network outcome must be resolved using the same submission identifier before creating another transaction.

Success: **Payment recorded successfully.** Show Payment ID, amount, membership period; actions **View Receipt**, **Done**. Refresh affected status, history, and totals.

## 13. Payments and receipt

### Payments list

Title: **Payments**. Subtitle: **View recorded membership payments.** Primary action: **Record Payment**.

Search: **Search member, payment ID or reference…**. Filters: Date Range, Method, Plan. All posted transactions are Paid; do not add a meaningless status filter.

Columns: Payment ID, Member, Plan, Amount, Method, Payment Date, Recorded By, Actions (View Details, Print Receipt). Administrator summary: Total Revenue and Transactions for the selected range; receptionist sees the transaction list.

### Payment details

Show payment ID, paid badge, member link, amount, method, payment date, reference, recorder, created timestamp, notes, purchased plan snapshot, membership start/end. Distinguish received date from entry timestamp. Primary action **Print Receipt**; secondary **Back to Payments**. No edit/delete actions on posted transactions.

### Printable receipt

Simple white print layout with gym name/logo, address/contact, heading **Membership Payment Receipt**, receipt/payment ID, member name/ID, payment date, plan/duration, covered start/end dates, method/reference, amount in ETB, **PAID**, recorder, and **Thank you for being part of Adama Fitness.**

Hide navigation, buttons, and unrelated content during printing. Example original payment: PAY-10234; Abebe Kebede; Monthly — 30 days; Oct 01–Oct 30, 2026; payment received Oct 01, 2026; Cash; 1,500.00 ETB; recorded by Abdi Dawud.

## 14. Memberships monitoring

Title: **Memberships**. Subtitle: **Monitor validity and upcoming renewals.**

Status tabs: All, Active, Expiring Soon, Expired, Scheduled, Unpaid. Active includes expiring memberships; explain this in its count label. Current-member monitoring shows one summary row per member; historical periods remain in the profile.

Search member name/phone/ID; filters Plan and Expiry Range. Columns: Member, ID, Plan, Start Date, End Date, Remaining/Start Label, Status, Action.

Active/expiring actions: Renew. Expired: Renew Membership. Unpaid: Record First Payment. Scheduled: View Profile with next start date. Status calculations must be identical to dashboard and member profile.

## 15. Membership plans

Administrator-only page. Title: **Membership Plans**. Subtitle: **Manage membership duration and pricing.** Primary action: **Add Plan**.

| Plan | Fixed duration | Price |
| --- | --- | --- |
| Daily Pass | 1 day | 150.00 ETB |
| Weekly | 7 days | 500.00 ETB |
| Monthly | 30 days | 1,500.00 ETB |
| 3 Months | 90 days | 4,000.00 ETB |
| 6 Months | 180 days | 7,500.00 ETB |
| Annual | 365 days | 14,000.00 ETB |

Cards show name, price, days, enabled/disabled badge. Actions Edit and Disable/Enable. Do not delete plans referenced by history.

Add/Edit modal: Plan Name*, Price (ETB)*, Duration in Days*, Description optional, Enabled toggle. Require unique nonempty name, positive price with at most two decimal places, and positive integer days.

Save helper: **Changes apply to future purchases. Existing memberships keep their original price and dates.** Disable confirmation explains that existing memberships remain valid but the plan cannot be purchased again.

## 16. Basic reports

Administrator-only. Title: **Reports**. Date selector: Today, Last 7 Days, This Month, Custom; From/To inputs and **Apply**. Reject From after To. Use inclusive received payment dates in the gym timezone.

Revenue cards: Total Revenue, Transactions, Average Payment. Average is Total Revenue / Transactions; display 0 when there are no transactions.

One revenue-over-time chart and two compact tables:

- Revenue by Plan: Plan, Transactions, Revenue.
- Revenue by Method: Method, Transactions, Revenue.

Membership summary: New Registrations during the selected range, Renewals purchased during the range, Current Active, Current Expiring Soon, Current Expired, Current Unpaid, Current Scheduled. Label current counts **As of today** so they are not mistaken for historical date-range metrics. A renewal is a purchase for a member with a prior paid membership; a first purchase is not a renewal.

No advanced retention charts, forecasting, attendance metrics, or export buttons.

## 17. Staff and essential settings

### Staff & Users

Administrator-only table: Full Name, Email, Role, Active/Deactivated, Actions. **Add Staff** modal: Full Name*, Email*, Role* (Administrator/Receptionist), Temporary Password* with visibility toggle. Require password change on first sign-in; show this state in the design.

Edit action updates name/role; Deactivate confirmation preserves recorded payments. Prevent deactivation/demotion of the last active administrator. No password values appear in table/detail views. Account recovery uses the reset flow.

### Gym Settings

Tabs: Gym Profile, Membership, Payments.

- Gym Profile: Gym Name*, optional logo/contact/address; currency fixed to ETB for Version 1; timezone fixed to Africa/Addis_Ababa.
- Membership: Expiration Warning Days*, default 7, integer from 0 to 30. Show a helper that the setting changes warnings, not membership end dates. Early renewal is supported by the stated renewal rule and does not need a toggle.
- Payments: Enabled recording methods. Keep at least one method enabled; show any references required by the selected method. Existing transactions retain their original methods.

Each tab has **Save Changes**, unsaved-change handling, success toast, field errors, and saving state.

### My Account

Both roles: name/email display, Change Password (Current Password, New Password, Confirm Password), Appearance (Light/Dark/System), Sign Out. Role changes are administrator-managed.

## 18. Shared components

AppShell, Sidebar, PageHeader, MemberLookup, Breadcrumbs, StatCard, StatusBadge, MemberAvatar, SearchInput, FilterBar, DateRangePicker, DataTable, Pagination, Tabs, PlanCard, FormField, Select, PhotoUpload, PaymentDrawer, MembershipPreview, ConfirmationDialog, ReceiptLayout, Toast, EmptyState, LoadingSkeleton, InlineError, AccessDenied.

Buttons need default/hover/focus/disabled/loading states. Tables need sortable headers where useful, accessible captions/labels, loading skeletons, empty states, and pagination. Dialogs trap focus, support Escape when safe, restore focus to their trigger, and expose an accessible title.

## 19. Responsive behavior

- Desktop (1024px+): persistent sidebar, multi-column metric rows, full tables, payment side drawer.
- Tablet (768–1023px): collapsible navigation, two-column metric cards, simplified table columns with detail actions.
- Mobile (below 768px): navigation drawer, single-column forms, member/payment cards instead of wide tables, full-screen payment dialog, readable status near every member name.
- Preserve name, status, expiry, and primary action on small screens. Move secondary data into details.
- Keep primary form actions visible without covering content or the mobile keyboard. No horizontal page scrolling.
- Print receipt independently of current theme or viewport.

## 20. Required UI states and copy

| State | Expected design |
| --- | --- |
| Loading | Skeleton layout; primary action shows progress and disables repeated submission |
| No members | “No members yet” + Add Member |
| No matching search | “No members found” + Clear Filters |
| No plans | “Create a plan before recording membership payments” + admin Create Plan |
| No payment history | “No payments recorded yet” + Record First Payment |
| No report data | “No payments in this date range” + Change Date Range |
| Validation failure | Error below field, error summary if needed, focus first invalid field |
| Data load failure | “Couldn’t load this information” + Retry |
| Payment saved | Payment ID and updated dates + View Receipt / Done |
| Member saved | “Member registered successfully” |
| Expired member | Expiry date and prominent Renew Membership |
| Session expired | “Your session expired. Sign in again.” Preserve safe return route |
| Access denied | “You don’t have permission to view this page” + Back to Dashboard |
| Not found | “This record could not be found” + Back to list |
| Unsaved changes | Stay / Discard Changes confirmation |

## 21. Google Stitch master prompt

```text
Design GymFlow, a responsive Version 1 staff-facing gym membership and payment management web application for a single gym in Adama, Ethiopia.

Users: Administrator and Receptionist. Main workflow: search a member by name, phone or member ID; instantly see membership validity; record a received full payment and renew membership.

Use the design system, scope, screen fields, permissions, copy, fixtures and date rules in this specification. Produce a polished practical SaaS dashboard using Inter, a 248px desktop sidebar, clean white cards, an indigo primary accent, subtle borders, 8px spacing, 12px card corners, accessible status badges, and light/dark themes. Make search and membership status highly visible.

Version 1 screens: login, forgot/reset password, dashboard, members list, register/edit member, member profile with overview/payment/membership history, shared payment/renewal drawer, payments list, payment details/printable receipt, memberships monitoring, administrator plans, basic reports, staff management, essential gym settings, and My Account.

Use ETB and Gregorian dates in Africa/Addis_Ababa timezone. For mockups freeze today at October 7, 2026. Plans use fixed days and inclusive end dates. Monthly is 30 days: October 1–October 30. A renewal starts October 31 and ends November 29. Payment status Paid is distinct from Active/Expiring Soon/Expired/Unpaid/Scheduled membership status. Saving a new member does not create a paid membership.

Do not add attendance, QR codes, automated reminders, notification feeds, online checkout, partial payments, refunds, multi-branch features, advanced analytics, or report exports.

Show administrator and receptionist navigation variants; required validation, loading, empty, error and success states; desktop and mobile layouts. Use realistic fictional Ethiopian names and data from this specification. Keep reused components visually identical across screens.
```

## 22. Page-generation prompts

Paste the master prompt first. Generate screens in this order, supplying the matching detailed section above with each prompt.

1. **Dashboard:** “Create the GymFlow Version 1 administrator dashboard using section 8. Include operational member counts, admin revenue summaries, one revenue chart, expiring members and recent payments. Also show the receptionist variant. Follow the shared shell and reconciled totals.”
2. **Members:** “Preserve the dashboard design system. Create the members list, search/filter/no-results states, mobile cards, registration and edit forms from sections 9–10. Saving a member leads to an Unpaid profile with Record First Payment.”
3. **Member Profile:** “Create member profiles from section 11 for Active, Expiring Soon, Expired, Unpaid and Scheduled examples. Include overview, payment history and membership history only.”
4. **Payment/Renewal:** “Create the shared drawer from section 12 with member search, enabled plan, read-only amount, payment method/date/reference, membership date preview, validation and success receipt actions. Show the October 31–November 29 renewal example.”
5. **Payments/Receipt:** “Create the payments list, read-only transaction detail and printable receipt from section 13. Keep received payment date separate from membership coverage dates.”
6. **Memberships:** “Create the monitoring page from section 14 with consistent calculated statuses, filters, dates and contextual payment/renewal actions.”
7. **Plans/Reports:** “Create administrator plan management and basic reports from sections 15–16. Use fixed-day plan durations and clearly distinguish date-range revenue from current membership counts.”
8. **Staff/Settings/Account:** “Create the administrator staff/settings pages and both-role account page from section 17. Include first-login password change and last-administrator protection states.”
9. **Authentication:** “Create login and password recovery screens from section 7 using the established brand and mobile form behavior.”
10. **Responsive and States:** “Produce mobile variants and all required states from sections 19–20, preserving every component, label, permission and date rule.”

## 23. Version 1 design acceptance checklist

- Staff can find a member’s validity immediately by name, phone, or ID.
- Member registration works without payment and displays Unpaid correctly.
- A full payment creates the correct dated membership and one transaction.
- Early renewal extends after current/scheduled continuous coverage without losing paid days.
- Expiry-day, warning-day, expired, scheduled and unpaid examples are visually correct.
- Profile, membership list and dashboard use the same status rules.
- Payments and plans preserve historical values and expose no destructive financial-history action.
- Administrator and receptionist views follow the permission matrix.
- All Version 1 routes, forms, dialogs, histories and receipt have consistent desktop/mobile designs.
- Empty, loading, validation, failure, success and access states are designed.
- Tables, forms, navigation and dialogs support keyboard use and readable contrast.
- No Version 2 navigation or nonfunctional feature buttons appear.
