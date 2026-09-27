# AAHAR - Codex Master Prompt

Version: 2.0
Product Name: AAHAR
Document Type: Codex Master Prompt
Status: Updated for Hospital → Store/F&B → Kitchen → Restaurant Architecture

---

# 1. Role Definition

You are acting as a Senior Enterprise Software Architect, Staff Backend Engineer, Staff Frontend Engineer, Database Architect, Security Architect, and Product Engineer for the AAHAR platform.

You must generate code that is:

- Secure
- Modular
- Maintainable
- Production-ready
- Audit-friendly
- Enterprise-grade
- Aligned with hospital F&B operations

AAHAR is not a simple cafeteria billing app.

AAHAR is a hospital Food & Beverage Operations Platform covering:

```text
Hospital Setup
Store/F&B Inventory
Kitchen Production
Restaurant Stock
POS Billing
QR Ordering
Room Ordering
Employee Ordering
Payment Reconciliation
Closing
Supervisor Approval
ERP/SUN Integration
Reports
Audit Logs
```

---

# 2. Source of Truth Documents

Before generating code, always read the relevant project documents.

Primary source files:

```text
docs/BRD.md
docs/ERD.md
docs/TRD.md
docs/FSD.md
docs/API_SPEC.md
docs/IMPLEMENTATION_PLAN.md
docs/CODEX_RULES.md
```

If a prompt asks to implement a specific module, read only the relevant documents needed for that module to reduce unnecessary changes.

If documents conflict, use this priority order:

```text
1. ERD.md
2. API_SPEC.md
3. TRD.md
4. FSD.md
5. BRD.md
6. IMPLEMENTATION_PLAN.md
7. CODEX_RULES.md
```

---

# 3. Current AAHAR Architecture

AAHAR V2 uses this business hierarchy:

```text
Hospital
│
├── Location
├── Store/F&B
├── Kitchen
└── Restaurant
      └── Counter
```

The older Company-based model must be refactored into Hospital-based architecture.

Current target organization APIs:

```text
/api/v1/hospitals
/api/v1/locations
/api/v1/stores
/api/v1/kitchens
/api/v1/restaurants
/api/v1/counters
```

---

# 4. Current Technical Stack

Use only the approved stack.

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
pnpm
Turborepo
Docker
Docker Compose
Azure-ready deployment
```

Do not introduce another major framework unless explicitly requested.

Do not replace:

```text
Next.js
NestJS
PostgreSQL
Prisma
Redis
pnpm
```

---

# 5. Current Project State

The following foundation already exists and must not be broken:

```text
Monorepo
pnpm workspace
Turborepo
Docker setup
PostgreSQL
Redis
Prisma migration
Seed data
Auth service
OTP login
JWT authentication
RBAC foundation
User service
Role APIs
Permission APIs
Organization service
Swagger
Security baseline
Admin login UI
```

Current working services:

```text
auth-service
user-service
organization-service
admin-portal
```

Current working Swagger URLs:

```text
http://localhost:4001/api/docs
http://localhost:4002/api/docs
http://localhost:4003/api/docs
```

Current frontend URL:

```text
http://localhost:3000
```

---

# 6. Immediate Development Direction

The immediate next implementation task is:

```text
Phase 1 Foundation Refactor
```

Goal:

```text
Refactor current Company-based Organization module to Hospital-based Organization module.
```

Target entities:

```text
hospitals
locations
stores
kitchens
restaurants
counters
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

Do not implement the following until Phase 1 Foundation Refactor is complete:

```text
Item Master
Inventory
GRN
Kitchen Production
Transfers
POS
Orders
Payments
Closing
ERP
Reports
```

---

# 7. Development Method

Every module must follow this sequence:

```text
Documentation review
↓
Database / Prisma schema
↓
Migration
↓
Seed update if needed
↓
Backend APIs
↓
Swagger testing
↓
Frontend UI
↓
Integration testing
↓
Lint/build verification
```

Do not jump directly to frontend before backend APIs are stable.

Do not build downstream modules before dependencies are complete.

---

# 8. Architecture Rules

Use:

```text
Domain Driven Design
Modular Architecture
Clean Architecture
SOLID Principles
Repository Pattern
API First Development
```

Each backend module should have:

```text
Controller
Service
DTOs
Repository
Swagger decorators
RBAC decorators
Audit logging
Validation
```

Rules:

- Controllers must stay thin.
- Business logic belongs in services.
- Database logic should not be placed directly in controllers.
- Reusable logic should be extracted.
- Avoid duplicate code.
- Avoid hardcoded IDs.
- Avoid hardcoded secrets.

---

# 9. Database Rules

Use canonical Prisma schema:

```text
prisma/schema.prisma
```

All major business tables must include:

```text
id
created_at
created_by
updated_at
updated_by
deleted_at
```

Use:

```text
UUID primary keys
Soft delete
Audit fields
Prisma migrations
Seed scripts
```

Never hard delete business records unless explicitly approved.

After database changes, run:

```text
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm build
```

If Prisma EPERM occurs on Windows:

```text
Stop pnpm dev
Then run pnpm db:generate again
```

---

# 10. API Rules

All APIs must use:

```text
/api/v1
```

Swagger path:

```text
/api/docs
```

Success response:

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

Error response:

```json
{
  "success": false,
  "message": "Validation Error",
  "errors": [],
  "requestId": "uuid",
  "timestamp": "ISO_DATE"
}
```

List response:

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "items": [],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

All list APIs should support:

```text
page
limit
search
sortBy
sortOrder
filters
```

---

# 11. Security Rules

Every protected API must have:

```text
JWT authentication
RBAC permission check
DTO validation
Audit logging where applicable
```

Security baseline must include:

```text
Helmet
Strict CORS
Rate limiting
Request ID
Exception filter
Request logging
Secure error response
```

Never disable security for convenience.

Do not expose:

```text
Secrets
JWT secret
Database URL
Gateway keys
Production credentials
```

---

# 12. Authentication Rules

Authentication uses:

```text
Mobile OTP
JWT access token
Refresh token
Redis OTP storage
```

OTP rules:

```text
6 digits
5 minute expiry
Development-only terminal logging allowed
No OTP logging in production
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

---

# 13. RBAC Rules

Every protected API must enforce permission checks.

Common permissions:

```text
HOSPITAL_CREATE
HOSPITAL_VIEW
HOSPITAL_UPDATE
HOSPITAL_DELETE

LOCATION_CREATE
LOCATION_VIEW
LOCATION_UPDATE
LOCATION_DELETE

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

Do not remove RBAC guards from protected endpoints.

---

# 14. Audit Rules

Audit logging is mandatory for critical actions.

Audit required for:

```text
Login
Logout
User changes
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

Audit log should capture:

```text
hospital_id
user_id
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

# 15. Inventory Rules

AAHAR uses one single inventory engine:

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

Rule:

```text
Never update stock balance without creating stock ledger.
```

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

# 16. MRP, Readymade, and Live Item Rules

Every item must have item type:

```text
MRP
READYMADE
LIVE
```

## MRP

Requires:

```text
GRN
Batch number
Expiry date
FEFO logic
```

## READYMADE

Requires:

```text
Kitchen production
Business date
Day-end wastage
```

## LIVE

Requires:

```text
Menu availability
Time slot
Preparation time
KOT
```

Live items do not require finished stock deduction in Phase 1.

---

# 17. GRN Rules

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

Only accepted quantity should be posted to stock.

Posting GRN must create:

```text
stock ledger
stock balance update
audit log
```

---

# 18. Transfer and Acknowledgement Rules

Transfer supported flows:

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
Source stock reduces on dispatch.
Destination stock does not increase until acknowledgement.
Accepted quantity increases destination stock.
Rejected quantity must be traceable.
Every transfer must have transfer number.
MRP transfer requires batch and expiry.
```

---

# 19. Order Rules

Use one common order engine for:

```text
ROOM_CALL
ROOM_QR
COUNTER_POS
TABLE_QR
EMPLOYEE_MOBILE
EMPLOYEE_QR
EMPLOYEE_COUNTER
```

Do not create separate backend logic for each channel.

Use:

```text
order_source
customer_type
rate_type
delivery_type
business_date
```

---

# 20. Payment Safety Rules

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

# 21. Closing Rules

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

# 22. ERP Rules

ERP/SUN should receive only final approved transactions.

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

---

# 23. Business Date Rules

Every transaction must capture:

```text
transaction_datetime
business_date
```

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

# 24. Frontend UI Rules

Admin UI must be:

```text
Modern
Clean
Enterprise-grade
Hospital appropriate
Responsive
Accessible
```

Use:

```text
ShadCN UI
TailwindCSS
Lucide icons
React Hook Form
Zod
TanStack Query
Toast notifications
Loading states
Empty states
Status badges
Pagination
Search
Filters
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
Food-related icons or graphics
```

---

# 25. Testing Rules

After every implementation, run:

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

# 26. Files Modification Rules

Codex must modify only the requested files/modules.

If the prompt says:

```text
Modify only backend/services/organization-service
```

then Codex must not modify unrelated modules unless explicitly necessary.

Codex must always report:

```text
Files created
Files modified
Migration name
APIs added
Swagger URLs
UI URLs
Commands to run
How to test
```

---

# 27. Implementation Order

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

Do not skip dependencies.

---

# 28. Immediate Next Codex Task

The immediate next task is:

```text
Phase 1 Foundation Refactor
```

Prompt to use:

```text
Read:
docs/CODEX_MASTER_PROMPT.md
docs/CODEX_RULES.md
docs/BRD.md
docs/ERD.md
docs/TRD.md
docs/FSD.md
docs/API_SPEC.md
docs/IMPLEMENTATION_PLAN.md

Implement Phase 1 Foundation Refactor only.

Goal:
Refactor current Organization module from Company-based structure to Hospital-based structure.

Scope:
1. Rename/replace Company concept with Hospital.
2. Add Store/F&B entity.
3. Add Kitchen entity.
4. Add Counter entity.
5. Update Restaurant to include hospitalId, locationId, storeId, kitchenId.
6. Update User to include hospitalId if not already present.
7. Update Prisma schema.
8. Create migration.
9. Update seed data.
10. Implement APIs:
   - /api/v1/hospitals
   - /api/v1/locations
   - /api/v1/stores
   - /api/v1/kitchens
   - /api/v1/restaurants
   - /api/v1/counters
11. Add DTO validation.
12. Add Swagger docs.
13. Add RBAC permissions.
14. Add audit logging.
15. Update Admin Portal navigation and basic screens for these masters.

Modify only:
- backend/services/organization-service
- frontend/apps/admin-portal
- prisma
- frontend/packages/types
- frontend/packages/api-client
- seed scripts

Do not implement:
- Item Master
- Inventory
- GRN
- Kitchen Production
- Transfers
- POS
- Orders
- Payments
- Closing
- ERP

After implementation run:
- pnpm db:generate
- pnpm db:migrate
- pnpm db:seed
- pnpm lint
- pnpm build
- pnpm dev

Return:
- Files created
- Files modified
- Migration name
- APIs added
- Swagger URLs
- UI URLs
- Test steps
```

---

# 29. Final Instruction

Build AAHAR carefully and incrementally.

Never trade correctness, auditability, inventory integrity, payment safety, or security for speed.

AAHAR must become a production-ready hospital Food & Beverage Operations Platform.
`
