# AAHAR - Codex Development Rules

Version: 2.0
Product Name: AAHAR
Document Type: Codex Development Rules
Status: Updated for Hospital → Store/F&B → Kitchen → Restaurant Architecture

---

# 1. Core Instruction

Codex must always treat the following files as the source of truth:

```text
docs/BRD.md
docs/ERD.md
docs/TRD.md
docs/FSD.md
docs/API_SPEC.md
docs/IMPLEMENTATION_PLAN.md
docs/CODEX_RULES.md
docs/CODEX_MASTER_PROMPT.md
```

Codex must not assume requirements outside these documents.

If there is a conflict between documents, priority order is:

```text
1. ERD.md
2. API_SPEC.md
3. TRD.md
4. FSD.md
5. BRD.md
6. IMPLEMENTATION_PLAN.md
7. CODEX_RULES.md
```

Reason:

```text
ERD defines database truth.
API_SPEC defines endpoint truth.
TRD defines architecture truth.
FSD defines screen and workflow truth.
BRD defines business truth.
```

---

# 2. Package Management Rules

AAHAR uses `pnpm` only.

Allowed:

```text
pnpm install
pnpm add
pnpm remove
pnpm dev
pnpm build
pnpm lint
```

Not allowed:

```text
npm install
yarn
bun
```

Commit:

```text
pnpm-lock.yaml
```

Do not commit:

```text
package-lock.json
yarn.lock
bun.lockb
```

If package-lock.json is created accidentally, remove it.

---

# 3. Technology Rules

Use the approved stack only.

## Frontend

```text
Next.js
TypeScript
TailwindCSS
ShadCN UI
Lucide React
React Hook Form
Zod
TanStack Query
```

## Backend

```text
NestJS
TypeScript
Prisma ORM
PostgreSQL
Redis
Swagger
JWT
RBAC
```

## Infrastructure

```text
Docker
Docker Compose
Azure-ready deployment
```

Do not introduce new major frameworks without approval.

Do not replace:

```text
NestJS
PostgreSQL
Prisma
Next.js
pnpm
```

---

# 4. Architecture Rules

AAHAR must follow:

```text
Domain Driven Design
Modular Architecture
API First Development
Clean Architecture
SOLID Principles
Repository Pattern
```

Do not create one large monolithic module.

Every domain should have:

```text
Controller
Service
DTOs
Repository
Swagger Documentation
RBAC Permission
Audit Logging
Validation
```

Controllers must not contain business logic.

Business logic belongs in services.

Database access should happen through repository/service layer, not directly from controllers.

---

# 5. Hospital-First Rule

AAHAR V2 uses this hierarchy:

```text
Hospital
│
├── Store/F&B --- inventory --- Restaurant 
├── Kitchen --- inventory --- Restaurant
└── Restaurant
      └── Counter
```

Hospital is mandatory.

All major business tables must include:

```text
hospital_id
```

Applies to:

```text
Store
Kitchen
Restaurant
Counter
Inventory
GRN
Production
Transfer
Order
Payment
Closing
Wastage
ERP
Reports
Audit
```

Do not build new business modules without hospital mapping.

---

# 6. Current Refactor Rule

Current code may still contain the old concept:

```text
Company
```

Target concept is:

```text
Hospital
```

Codex must refactor carefully.

Do not delete working Auth/User/RBAC foundation.

Required target APIs:

```text
/api/v1/hospitals
/api/v1/locations
/api/v1/stores
/api/v1/kitchens
/api/v1/restaurants
/api/v1/counters
```

Do not continue building Menu, Inventory, POS, Kitchen Production, Payments, Closing, or ERP until Organization refactor is complete.

---

# 7. Database Rules

All major tables must include:

```sql
id UUID PRIMARY KEY
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Use:

```text
UUID primary keys
Soft delete
Audit fields
Prisma migrations
```

Do not hard delete business records.

Do not manually change database tables outside Prisma migrations.

Do not break existing migration history without approval.

---

# 8. Prisma Rules

Use one canonical Prisma schema during MVP:

```text
prisma/schema.prisma
```

Every schema change must include:

```text
Prisma model update
Migration
Seed update if required
Type generation
```

Required commands after schema change:

```text
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm build
```

If Windows Prisma EPERM occurs:

```text
Stop pnpm dev
Then rerun pnpm db:generate
```

---

# 9. API Rules

All APIs must use base path:

```text
/api/v1
```

Swagger must be available at:

```text
/api/docs
```

Every API must return standard response.

## Success Response

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

## Error Response

```json
{
  "success": false,
  "message": "Validation Error",
  "errors": [],
  "requestId": "uuid",
  "timestamp": "ISO_DATE"
}
```

All list APIs must support:

```text
page
limit
search
sortBy
sortOrder
filters
```

All protected APIs must require:

```http
Authorization: Bearer <accessToken>
```

---

# 10. Swagger Rules

Every API must appear in Swagger.

Swagger must include:

```text
Controller tag
Request DTO schema
Response description
Error responses
Auth requirement
```

Swagger should not expose:

```text
Secrets
API keys
JWT secrets
Gateway secrets
Database URLs
```

---

# 11. Authentication Rules

Authentication uses:

```text
Mobile OTP
JWT Access Token
Refresh Token
Redis OTP Storage
```

OTP rules:

```text
6 digits
5 minute expiry
Stored in Redis
Logged only in development
Never logged in production
```

JWT payload should include:

```text
sub
mobile
email
roles
permissions
hospital_id
```

Do not bypass authentication for protected APIs.

---

# 12. RBAC Rules

Every protected API must check permissions.

Permission examples:

```text
HOSPITAL_CREATE
HOSPITAL_VIEW
HOSPITAL_UPDATE
HOSPITAL_DELETE

STORE_CREATE
STORE_VIEW
STORE_UPDATE
STORE_DELETE

KITCHEN_CREATE
KITCHEN_VIEW
KITCHEN_UPDATE
KITCHEN_DELETE

RESTAURANT_CREATE
RESTAURANT_VIEW
RESTAURANT_UPDATE
RESTAURANT_DELETE

COUNTER_CREATE
COUNTER_VIEW
COUNTER_UPDATE
COUNTER_DELETE

ITEM_CREATE
ITEM_VIEW
ITEM_UPDATE
ITEM_DELETE

GRN_CREATE
GRN_VIEW
GRN_POST

TRANSFER_CREATE
TRANSFER_VIEW
TRANSFER_DISPATCH
TRANSFER_ACKNOWLEDGE

POS_BILLING

CLOSING_SUBMIT
CLOSING_APPROVE

ERP_POST
```

Do not remove RBAC checks for convenience.

---

# 13. Audit Logging Rules

Audit logs are mandatory for critical actions.

Audit required for:

```text
Login
Logout
User creation/update/delete
Role changes
Permission changes
Hospital setup
Store setup
Kitchen setup
Restaurant setup
Counter setup
Item changes
GRN posting
Stock adjustment
Production posting
Transfer dispatch
Transfer acknowledgement
Order creation
Order cancellation
Payment status change
Refund
Closing submission
Supervisor approval
Wastage approval
ERP posting
```

Audit log must capture:

```text
user_id
hospital_id
entity_name
entity_id
action
old_value
new_value
ip_address
request_id
user_agent
created_at
```

---

# 14. Inventory Rules

AAHAR must use a single inventory engine:

```text
stock_ledgers
stock_balances
```

Used for:

```text
STORE
KITCHEN
RESTAURANT
COUNTER
```

Never update stock balance without stock ledger.

Every stock movement must create stock ledger.

Stock movement examples:

```text
GRN_IN
KITCHEN_PRODUCTION_IN
STORE_TO_RESTAURANT_OUT
KITCHEN_TO_RESTAURANT_OUT
RESTAURANT_RECEIVE_IN
SALE_OUT
WASTAGE_OUT
ADJUSTMENT_IN
ADJUSTMENT_OUT
```

---

# 15. MRP Inventory Rules

MRP items require:

```text
Batch Number
Expiry Date
GRN
FEFO logic
```

Rules:

```text
Batch number is mandatory.
Expiry date is mandatory.
Expired stock cannot be sold.
Expired stock should not be accepted during GRN.
Near-expiry warning should be supported.
Sale and transfer should follow FEFO.
```

FEFO means:

```text
First Expiry First Out
```

---

# 16. GRN Rules

GRN must support:

```text
Partial receiving
Multiple batches
Accepted quantity
Rejected quantity
Rejection reason
Expiry validation
Batch validation
```

Validation:

```text
Accepted Qty + Rejected Qty = Received Qty
```

Only accepted quantity is posted to stock.

Rejected quantity must not increase stock.

Posting GRN must create:

```text
stock_ledger entry
stock_balance update
audit log
```

---

# 17. Readymade Inventory Rules

Readymade items are kitchen-produced daily stock.

Rules:

```text
Chef selects item from Item Master.
Chef must not type free-text item names.
Only READYMADE items can be used in kitchen production.
Production posting increases Kitchen stock.
Readymade stock must be business-date aware.
Old readymade stock cannot carry indefinitely.
Day-end readymade wastage must be supported.
```

---

# 18. Live Item Rules

Live items are made on demand.

Rules:

```text
No finished stock deduction required in Phase 1.
Live item requires menu availability.
Live item requires valid time slot.
Live item requires KOT.
Preparation time applies.
```

---

# 19. Transfer Rules

Supported transfer flows:

```text
Store → Restaurant
Kitchen → Restaurant
Restaurant → Store Return
Restaurant → Kitchen Return
Restaurant → Counter
Counter → Restaurant Return
```

Rules:

```text
Every transfer must have transfer number.
Source stock reduces on dispatch.
Destination stock does not increase until acknowledgement.
Accepted quantity increases destination stock.
Rejected quantity must be traceable.
MRP transfer requires batch and expiry.
```

Do not directly increase restaurant stock during transfer creation.

---

# 20. Restaurant Acknowledgement Rules

Restaurant acknowledgement is mandatory for transfer receipt.

Restaurant user can:

```text
Accept full
Accept partial
Reject full
Add remarks
Upload proof
```

Validation:

```text
Accepted Qty + Rejected Qty = Sent Qty
```

Acknowledgement must create:

```text
stock ledger entry
stock balance update
audit log
```

---

# 21. Menu Availability Rules

Menu item should show only if:

```text
Restaurant is active
Item is active
Item is mapped to restaurant
Current day is allowed
Current time is within item time slot
Stock > 0 for MRP/READYMADE
Live item is available
Correct rate type selected
Discount rule applicable
```

MRP and READYMADE items with zero stock cannot be sold.

---

# 22. Order Engine Rules

Use one common order engine.

Supported order sources:

```text
ROOM_CALL
ROOM_QR
COUNTER_POS
TABLE_QR
EMPLOYEE_MOBILE
EMPLOYEE_QR
EMPLOYEE_COUNTER
```

Do not create separate backend order engines for each channel.

Use shared fields:

```text
order_source
customer_type
rate_type
delivery_type
business_date
```

---

# 23. POS Rules

POS must validate:

```text
Restaurant
Counter
Customer type
Employee ID if staff
Item availability
Stock
Time slot
Discount
Payment
```

POS must:

```text
Create order
Apply price
Apply discount
Capture payment
Generate invoice
Generate KOT if required
Deduct stock for MRP/READYMADE
```

---

# 24. Discount Rules

Discount logic must be centralized.

Do not hardcode discount logic only inside POS.

Discount engine must support:

```text
Normal customer discount
Staff discount
Item discount
Category discount
Event discount
Manual approval discount
```

Staff discount requires:

```text
Employee ID
Employee validation
Eligibility check
Audit log
```

---

# 25. Payment Safety Rules

Payment must be idempotent.

Rules:

```text
One active payment attempt per order.
Every payment attempt must have idempotency key.
If active attempt exists, return same attempt.
If payment already succeeded, block new attempt.
Duplicate callback must not duplicate payment.
Gateway payment must be verified server-side.
Do not trust frontend success alone.
Unknown payment state must go to reconciliation.
Refund must be audited.
```

Applies to:

```text
Pine Labs
PayU
Razorpay
UPI
Card
Cash
```

---

# 26. KOT Rules

KOT required for:

```text
LIVE items
Kitchen-prepared items
Configured READYMADE items if serving/packing ticket is required
```

KOT usually not required for:

```text
MRP packed items
```

KOT statuses:

```text
GENERATED
ACCEPTED
PREPARING
READY
DISPATCHED
DELIVERED
CANCELLED
```

---

# 27. Delivery Rules

Room delivery requires supervisor assignment.

Counter pickup may not require delivery operator.

Delivery statuses:

```text
PENDING_ASSIGNMENT
ASSIGNED
PICKED_UP
OUT_FOR_DELIVERY
DELIVERED
FAILED
CANCELLED
```

Every delivery status change must be auditable.

---

# 28. Restaurant Closing Rules

Restaurant closing must reconcile:

```text
Sales
Payments
Stock
Wastage
Returns
```

Formula:

```text
Expected Sale Amount = Total invoice value of sold items
Actual Collection Amount = Cash + Card + UPI + Pine Labs + PayU + Razorpay
Difference = Expected Sale Amount - Actual Collection Amount
```

If difference is not zero:

```text
Reason required
Proof may be required
Supervisor approval mandatory
```

Approved closing must be locked.

ERP posting can happen only after final approval.

---

# 29. Wastage Rules

Wastage applies to:

```text
Breakage
Expired stock
Day-end readymade
Spoiled items
Customer return
Manual adjustment
```

Approved wastage must create:

```text
stock ledger entry
stock balance update
audit log
```

Day-end readymade wastage requires supervisor approval.

---

# 30. Business Date Rules

Every transaction must capture:

```text
transaction_datetime
business_date
```

Business date is required because restaurant may close after midnight.

Business date applies to:

```text
GRN
Production
Transfer
Acknowledgement
Orders
Payments
KOT
Delivery
Closing
Wastage
ERP
Reports
```

---

# 31. ERP/SUN Rules

ERP should receive only final approved transactions.

Do not post:

```text
Failed payments
Cancelled orders
Unapproved closing mismatch
Unapproved wastage
Duplicate transactions
```

ERP posting statuses:

```text
NOT_READY
READY_TO_POST
POSTED
FAILED
RETRY_PENDING
CANCELLED
```

ERP posting must support retry.

Every ERP attempt must be logged.

---

# 32. Frontend UI Rules

Admin UI must be modern, clean, and enterprise-grade.

Use:

```text
ShadCN UI
TailwindCSS
Lucide icons
Responsive layout
Card-based design
Sidebar navigation
Top header
Status badges
Loading states
Empty states
Toast messages
Form validation
Search and filters
Pagination
```

Do not show technical terms to business users:

```text
JWT
RBAC
API
Sprint
Workspace
```

Login branding should show:

```text
AAHAR
Max Healthcare
Food & Cafeteria Management Platform
Food-related icons/graphics
```

---

# 33. Validation Rules

Backend:

```text
Use DTO validation.
Use class-validator.
Validate all payloads.
Reject invalid enum values.
Reject missing required fields.
```

Frontend:

```text
Use React Hook Form.
Use Zod.
Show field-level errors.
Show success/error toast.
```

---

# 34. Testing Rules

After implementation, run:

```text
pnpm lint
pnpm build
```

After database changes, run:

```text
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

After starting app, verify:

```text
http://localhost:3000
http://localhost:4001/api/docs
http://localhost:4002/api/docs
http://localhost:4003/api/docs
```

Swagger must be tested before UI integration.

---

# 35. Files Modification Rules

Codex must modify only the requested files/modules.

Example:

If prompt says:

```text
Modify only organization-service
```

Codex must not modify:

```text
auth-service
user-service
inventory-service
payment-service
admin UI
```

unless explicitly required.

Codex must always report:

```text
Files created
Files modified
APIs added
Migration name
Commands to run
How to test
```

---

# 36. Module Implementation Order

Codex must follow this order:

```text
1. Hospital Administration
2. Master Data
3. Store/F&B Inventory
4. Kitchen Production
5. Distribution and Acknowledgement
6. Restaurant Stock
7. POS
8. Common Order Engine
9. KOT
10. QR / Room / Employee Ordering
11. Payment and Reconciliation
12. Delivery
13. Closing and Supervisor Approval
14. Wastage
15. ERP/SUN
16. Reports
17. Production Hardening
```

Do not skip foundation modules.

---

# 37. Immediate Next Implementation

The current next implementation task is:

```text
Phase 1 Foundation Refactor
```

Goal:

```text
Refactor Company-based Organization to Hospital-based Organization.
```

Target APIs:

```text
/api/v1/hospitals
/api/v1/locations
/api/v1/stores
/api/v1/kitchens
/api/v1/restaurants
/api/v1/counters
```

Do not implement:

```text
Item Master
Inventory
GRN
Kitchen Production
Transfer
POS
Orders
Payments
Closing
ERP
```

until Phase 1 Foundation Refactor is complete.

---

# 38. Definition of Done

A task is complete only when:

```text
Code is implemented
DTO validation is added
Swagger is updated
RBAC is applied
Audit logging is added
Migration is created if needed
Seed is updated if needed
UI is connected if applicable
pnpm lint passes
pnpm build passes
Manual testing is completed
No regression in existing modules
```

---

# 39. Final Rule

AAHAR must be built as a secure, auditable, hospital-first Food & Beverage Operations Platform.

The system must prioritize:

```text
Inventory traceability
Payment safety
Hospital data security
Auditability
ERP readiness
Business-date accuracy
Production scalability
```

Never trade correctness or security for speed.
