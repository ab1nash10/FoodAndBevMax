# AAHAR - Technical Requirements Document (TRD)

Version: 2.0
Product Name: AAHAR
Document Type: Technical Requirements Document
Status: Updated for Hospital → Store/F&B → Kitchen → Restaurant Architecture

---

# 1. Technical Vision

AAHAR shall be developed as an enterprise-grade hospital Food & Beverage Operations Platform.

The system must support the complete lifecycle:

```text
Hospital Setup
↓
Store/F&B Setup
↓
Kitchen Setup
↓
Restaurant Setup
↓
Item Master / Menu / Pricing / Discount
↓
MRP Procurement / GRN / Batch / Expiry
↓
Kitchen Production
↓
Distribution to Restaurant
↓
Restaurant Acknowledgement
↓
POS / QR / Room / Employee Ordering
↓
Invoice / KOT / Payment
↓
Restaurant Closing
↓
Supervisor Approval
↓
ERP/SUN Posting
```

The platform must be secure, auditable, scalable, and suitable for hospital operations.

---

# 2. Core Technical Principles

## 2.1 Hospital-First Architecture

Hospital is the top-level entity.

All major business transactions must be linked to:

```text
hospital_id
business_date
created_by
created_at
```

Affected modules:

- Store/F&B
- Kitchen
- Restaurant
- Counter
- Inventory
- GRN
- Transfers
- Orders
- Payments
- Closing
- ERP
- Reports

---

## 2.2 Domain-Based Modular Architecture

AAHAR shall be developed domain by domain.

Recommended domains:

```text
Identity & Access
Hospital Administration
Master Data
Store/F&B Inventory
Kitchen Production
Distribution
Restaurant Stock
Order Management
POS Billing
Payment & Reconciliation
Kitchen KOT
Delivery
Restaurant Closing
ERP/SUN Integration
Reports & Audit
```

Each domain must have clear:

- APIs
- DTOs
- Services
- Repositories
- Validation
- RBAC
- Audit logging

---

## 2.3 API-First Development

Every feature must expose documented REST APIs before UI integration.

All APIs must be visible in Swagger.

Base path:

```text
/api/v1
```

Swagger path:

```text
/api/docs
```

---

## 2.4 Single Inventory Engine

AAHAR must not create separate stock systems for Store, Kitchen, Restaurant, and Counter.

Use common inventory engine:

```text
stock_ledgers
stock_balances
```

Supported location types:

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

---

## 2.5 Common Order Engine

AAHAR must not build separate order systems for POS, QR, Room Order, and Employee Order.

Use one common order engine with:

```text
order_source
customer_type
rate_type
delivery_type
payment_mode
```

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

---

# 3. Technology Stack

## 3.1 Frontend

Use:

```text
Next.js
TypeScript
TailwindCSS
ShadCN UI
Lucide Icons
React Hook Form
Zod
TanStack Query
```

Frontend apps:

```text
admin-portal
pos-app
kitchen-app
employee-pwa
customer-pwa
delivery-app
```

Current active app:

```text
frontend/apps/admin-portal
```

---

## 3.2 Backend

Use:

```text
NestJS
TypeScript
Prisma
PostgreSQL
Redis
Swagger
JWT
RBAC
```

Current active services:

```text
auth-service
user-service
organization-service
```

Future services/modules:

```text
master-service
inventory-service
kitchen-service
distribution-service
order-service
payment-service
closing-service
erp-service
reporting-service
```

---

## 3.3 Database

Use:

```text
PostgreSQL
```

Reasons:

- ACID transactions
- Inventory consistency
- Payment consistency
- ERP reporting
- Strong relational model
- Audit trails

---

## 3.4 ORM

Use:

```text
Prisma ORM
```

Rules:

- Use Prisma migrations.
- Use repository pattern.
- Do not call Prisma directly from controllers.
- Maintain a single canonical Prisma schema during MVP.
- Future service split is allowed only after domain boundaries stabilize.

---

## 3.5 Cache

Use:

```text
Redis
```

Used for:

- OTP storage
- Rate limiting
- Session/cache support
- Payment attempt locks
- Menu cache
- Stock availability cache
- Temporary reservation locks

---

## 3.6 Containerization

Use:

```text
Docker
Docker Compose
```

Local Docker runs:

```text
PostgreSQL
Redis
```

Production may use:

```text
Azure App Service
Azure Container Apps
AKS
```

depending on final deployment decision.

---

# 4. Monorepo Structure

AAHAR shall use a monorepo.

The workspaces are grouped into a `frontend/` and a `backend/` section so that the two halves of
the platform are separated at a glance. This is a folder grouping only: the repository remains a
single pnpm workspace with one lockfile and one Turbo task graph, and cross-package imports are
unchanged.

```text
AAHAR/

frontend/
├── apps/
│   ├── admin-portal
│   ├── pos-app
│   ├── kitchen-app
│   ├── employee-pwa
│   ├── customer-pwa
│   └── delivery-app
└── packages/
    ├── ui
    ├── types
    └── api-client

backend/
├── services/
│   ├── auth-service
│   ├── user-service
│   ├── organization-service
│   ├── master-service
│   ├── inventory-service
│   ├── kitchen-service
│   ├── distribution-service
│   ├── order-service
│   ├── payment-service
│   ├── closing-service
│   ├── erp-service
│   └── reporting-service
└── packages/
    ├── auth
    └── config

prisma/
├── schema.prisma
└── migrations/

infra/
├── docker
├── postgres
├── redis
└── scripts

docs/
├── BRD.md
├── PRD.md
├── TRD.md
├── FSD.md
├── ERD.md
├── API_SPEC.md
├── CODEX_RULES.md
├── CODEX_MASTER_PROMPT.md
└── IMPLEMENTATION_PLAN.md
```

---

# 5. Current Implementation Status

Current completed foundation:

```text
Docker setup
PostgreSQL
Redis
Prisma migration
Seed data
Auth service
OTP login
JWT
RBAC foundation
User service
Role and permission APIs
Organization service
Company/Location/Restaurant APIs
Swagger
Admin login UI
Security baseline
```

Required refactor:

```text
Company concept must become Hospital concept.
Organization service must expand to Hospital, Location, Store, Kitchen, Restaurant, Counter.
```

---

# 6. Domain Architecture

## 6.1 Identity & Access Domain

Responsibilities:

- OTP login
- JWT token generation
- Refresh token
- Logout
- RBAC
- Users
- Roles
- Permissions

Main APIs:

```text
POST /api/v1/auth/send-otp
POST /api/v1/auth/verify-otp
POST /api/v1/auth/refresh
POST /api/v1/auth/logout

GET /api/v1/users
POST /api/v1/users
GET /api/v1/roles
POST /api/v1/roles
GET /api/v1/permissions
```

---

## 6.2 Hospital Administration Domain

Responsibilities:

- Hospital setup
- Location setup
- Store/F&B setup
- Kitchen setup
- Restaurant setup
- Counter setup

Main entities:

```text
hospitals
locations
stores
kitchens
restaurants
counters
```

Main APIs:

```text
/api/v1/hospitals
/api/v1/locations
/api/v1/stores
/api/v1/kitchens
/api/v1/restaurants
/api/v1/counters
```

---

## 6.3 Master Data Domain

Responsibilities:

- Item Category Master
- Item Master
- Employee Master
- Vendor Master
- Time Slot Master
- GST configuration
- Price configuration
- Discount configuration
- Payment Gateway Master

Main entities:

```text
item_categories
items
item_prices
time_slots
item_time_mappings
restaurant_menus
employees
discount_rules
discount_approvals
payment_gateways
vendors
```

---

## 6.4 Store/F&B Inventory Domain

Responsibilities:

- Indent
- PO reference
- Vendor receiving
- GRN
- Batch
- Expiry
- Store stock
- Near-expiry handling

Main entities:

```text
indents
indent_lines
purchase_orders
purchase_order_lines
grns
grn_lines
grn_batches
stock_ledgers
stock_balances
```

---

## 6.5 Kitchen Production Domain

Responsibilities:

- Production entry
- Chef entry
- Kitchen stock
- Readymade item production
- Day-end wastage

Main entities:

```text
kitchen_productions
kitchen_production_lines
stock_ledgers
stock_balances
wastages
wastage_lines
```

---

## 6.6 Distribution Domain

Responsibilities:

- Store to Restaurant transfer
- Kitchen to Restaurant transfer
- Restaurant acknowledgement
- Rejection handling
- Return to source

Main entities:

```text
transfers
transfer_lines
transfer_acknowledgements
transfer_acknowledgement_lines
stock_ledgers
stock_balances
```

---

## 6.7 Restaurant Stock Domain

Responsibilities:

- Restaurant available stock
- MRP stock visibility
- Readymade stock visibility
- Live item availability
- Low-stock and zero-stock control

Rules:

```text
MRP and Readymade items cannot be sold if available stock is zero.
Live items depend on menu availability and time slot.
```

---

## 6.8 Order Management Domain

Responsibilities:

- Common order engine
- Order lifecycle
- Order lines
- Order status history
- Order source handling

Main entities:

```text
orders
order_lines
order_status_history
```

---

## 6.9 POS Billing Domain

Responsibilities:

- Counter billing
- Item selection
- Employee ID validation
- Discount calculation
- Payment capture
- Invoice generation
- KOT generation
- Stock deduction

---

## 6.10 Payment & Reconciliation Domain

Responsibilities:

- Cash
- Card
- UPI
- Pine Labs
- PayU
- Razorpay
- Payment attempt safety
- Refunds
- Reconciliation

Main entities:

```text
payments
payment_attempts
payment_events
refunds
```

Rules:

```text
One active payment attempt per order.
Use idempotency key.
Verify payment server-side.
Do not trust frontend success alone.
```

---

## 6.11 Kitchen KOT Domain

Responsibilities:

- KOT generation
- Kitchen acceptance
- Preparation status
- Ready status
- Dispatch status

Main entities:

```text
kots
kot_lines
```

---

## 6.12 Delivery Domain

Responsibilities:

- Supervisor assignment
- Delivery operator assignment
- Pickup
- Out for delivery
- Delivered

Main entity:

```text
deliveries
```

---

## 6.13 Restaurant Closing Domain

Responsibilities:

- Shift end
- Day end
- Closing
- Payment summary
- Stock summary
- Difference calculation
- Supervisor approval

Main entities:

```text
restaurant_closings
closing_payment_summaries
closing_item_summaries
supervisor_approvals
```

---

## 6.14 ERP/SUN Domain

Responsibilities:

- ERP export creation
- SUN posting
- Retry logic
- Failed posting tracking
- Posting status dashboard

Main entities:

```text
erp_exports
erp_export_attempts
```

---

## 6.15 Reports & Audit Domain

Responsibilities:

- Audit logs
- Sales reports
- Stock reports
- GRN reports
- Expiry reports
- Payment reports
- Closing reports
- ERP reports

Main entities:

```text
audit_logs
notifications
```

---

# 7. API Standards

## 7.1 Base URL

All APIs must use:

```text
/api/v1
```

---

## 7.2 Success Response

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

---

## 7.3 Error Response

```json
{
  "success": false,
  "message": "Validation Error",
  "errors": [],
  "requestId": "uuid",
  "timestamp": "ISO_DATE"
}
```

---

## 7.4 Pagination Standard

List APIs must support:

```text
page
limit
search
sortBy
sortOrder
filters
```

Response:

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "items": [],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

# 8. Authentication Architecture

## 8.1 Login Flow

```text
User enters mobile number
↓
OTP generated
↓
OTP stored in Redis
↓
OTP sent via provider
↓
User verifies OTP
↓
JWT access token generated
↓
Refresh token generated
↓
User accesses system
```

Development:

```text
OTP may be logged to terminal only in development.
```

Production:

```text
OTP must be sent through approved SMS/email provider.
OTP must never be logged in production.
```

---

## 8.2 JWT Rules

Access token:

```text
Short-lived
```

Refresh token:

```text
Longer-lived
```

JWT payload should contain:

```text
sub
mobile
email
roles
permissions
hospital_id
```

---

# 9. Authorization Architecture

Use RBAC.

Each protected API must verify:

```text
Valid JWT
Required permission
Active user
Active role
```

Permission examples:

```text
HOSPITAL_CREATE
STORE_CREATE
KITCHEN_CREATE
RESTAURANT_CREATE
ITEM_CREATE
GRN_CREATE
GRN_POST
TRANSFER_CREATE
TRANSFER_ACKNOWLEDGE
POS_BILLING
CLOSING_SUBMIT
CLOSING_APPROVE
ERP_POST
```

---

# 10. Inventory Architecture

## 10.1 Single Inventory Engine

Use:

```text
stock_ledgers
stock_balances
```

for:

```text
STORE
KITCHEN
RESTAURANT
COUNTER
```

---

## 10.2 Stock Ledger

Stock ledger stores:

```text
Every stock movement
Reference transaction
Qty in
Qty out
Balance after
Business date
Transaction date time
User
```

---

## 10.3 Stock Balance

Stock balance stores:

```text
Current available quantity
Reserved quantity
Batch number
Expiry date
Location type
Location ID
```

---

## 10.4 MRP Item Rule

MRP items require:

```text
Batch number
Expiry date
FEFO
GRN
```

---

## 10.5 Readymade Item Rule

Readymade items require:

```text
Kitchen production
Business date
Day-end wastage
```

---

## 10.6 Live Item Rule

Live items require:

```text
Menu availability
Time slot
Preparation time
KOT
```

Live items do not require finished stock deduction in Phase 1.

---

# 11. Payment Safety Architecture

AAHAR must prevent duplicate payments.

## Rules

- One active payment attempt per order.
- Payment attempt must have idempotency key.
- If active attempt exists, return same attempt.
- If payment is already successful, block new attempt.
- Callback must be idempotent.
- Payment status must be verified server-side.
- Network failure must not create duplicate deductions.
- Unknown payment state must go into reconciliation.

---

# 12. Business Date Architecture

System must maintain both:

```text
transaction_datetime
business_date
```

Reason:

```text
Restaurant may close after midnight.
```

Used in:

- GRN
- Stock ledger
- Production
- Transfers
- Orders
- Payments
- Closing
- ERP
- Reports

---

# 13. Event Architecture

AAHAR should publish domain events for major business actions.

Recommended events:

```text
HospitalCreated
ItemCreated
GRNPosted
StockUpdated
KitchenProductionPosted
TransferCreated
TransferDispatched
TransferAcknowledged
OrderCreated
PaymentCaptured
InvoiceGenerated
KOTGenerated
KitchenStatusUpdated
OrderDelivered
RestaurantClosingSubmitted
ClosingApproved
WastageApproved
ERPPostingReady
ERPPostingCompleted
```

Initial implementation can use internal service calls.

Future implementation may use queue/event bus.

---

# 14. Queue Architecture

Use BullMQ / Redis queue for background jobs.

Jobs:

- ERP posting
- Payment reconciliation
- Report generation
- Expiry alerts
- Day-end readymade wastage
- Notification sending
- Audit processing

---

# 15. Security Architecture

Security requirements:

- JWT authentication
- RBAC
- Input validation
- Rate limiting
- Helmet security headers
- Strict CORS
- Audit logging
- Request ID correlation
- Secure error handling
- No hardcoded secrets
- Environment-based configuration
- Production secrets in Key Vault

---

# 16. Production Architecture

Recommended production hosting:

```text
Azure
```

Recommended services:

```text
Azure App Service / Container Apps / AKS
Azure Database for PostgreSQL
Azure Cache for Redis
Azure Key Vault
Azure Blob Storage
Azure Application Gateway / Front Door with WAF
Azure Monitor
```

Production must include:

- HTTPS
- WAF
- Load balancer
- Private database
- Redis
- Backup
- Monitoring
- Logs
- Alerting
- Disaster recovery

---

# 17. Deployment Architecture

## Development

```text
VS Code
pnpm
Docker Desktop
PostgreSQL container
Redis container
Next.js dev server
NestJS dev services
```

## Production

```text
Frontend apps
Backend services
Managed PostgreSQL
Managed Redis
Queue workers
ERP workers
Monitoring
WAF
Load balancer
```

---

# 18. CI/CD Requirements

Pipeline should include:

```text
Install dependencies
Lint
Type check
Build
Unit tests
Migration validation
Docker build
Security scan
Deploy
Smoke test
```

Production deployment should require manual approval.

---

# 19. Coding Standards

Backend:

- Use NestJS modules.
- Use DTO validation.
- Use service layer.
- Use repository pattern.
- Do not place business logic in controllers.
- Use Swagger decorators.
- Use RBAC decorators.
- Use audit logging for critical actions.

Frontend:

- Use Next.js App Router.
- Use TailwindCSS.
- Use ShadCN UI.
- Use React Hook Form.
- Use Zod validation.
- Use TanStack Query.
- Use reusable components.

Database:

- Use Prisma.
- Use migrations.
- Use UUID.
- Use soft delete.
- Use audit fields.
- Do not break ERD rules.

---

# 20. Codex Development Rules

Codex must:

1. Read relevant docs before generating code.
2. Modify only requested modules.
3. Avoid large unrelated refactors.
4. Preserve existing working functionality.
5. Add Swagger for every API.
6. Add validation for every DTO.
7. Add RBAC for protected APIs.
8. Add audit logging for critical actions.
9. Run lint/build after changes.
10. Return files created, files modified, and test commands.

Codex must not:

- Build Menu before Organization refactor is complete.
- Build POS before Inventory and Menu logic are ready.
- Build separate order engines for each order source.
- Update stock without ledger.
- Bypass payment safety logic.
- Disable security for convenience.
- Remove existing working APIs without approval.

---

# 21. Refactor Plan From Current Code

Current state:

```text
companies
locations
restaurants
```

Target state:

```text
hospitals
locations
stores
kitchens
restaurants
counters
```

Refactor approach:

## Step 1

Update docs:

```text
BRD.md
ERD.md
TRD.md
FSD.md
API_SPEC.md
```

## Step 2

Update Prisma schema:

```text
companies -> hospitals
add stores
add kitchens
add counters
update restaurants mapping
```

## Step 3

Update seed data:

```text
Hospital
Location
Store
Kitchen
Restaurant
Counter
Roles
Permissions
Super Admin
```

## Step 4

Update Organization Service APIs:

```text
/api/v1/hospitals
/api/v1/locations
/api/v1/stores
/api/v1/kitchens
/api/v1/restaurants
/api/v1/counters
```

## Step 5

Update Admin UI:

```text
Hospital Management
Location Management
Store Management
Kitchen Management
Restaurant Management
Counter Management
```

---

# 22. Implementation Order

Correct implementation order:

```text
1. Documentation update
2. ERD update
3. Prisma schema update
4. Organization refactor
5. Admin UI refactor
6. Master Data
7. Inventory
8. Kitchen Production
9. Distribution
10. POS
11. Orders
12. Payments
13. Closing
14. ERP
15. Reports
16. Production hardening
```

---

# 23. Definition of Done

A module is complete only when:

- API implemented
- Swagger documented
- DTO validation added
- RBAC applied
- Audit logging added
- Prisma migration completed
- Seed data updated if needed
- UI connected if applicable
- Lint passes
- Build passes
- Basic testing completed
- No regression in existing modules

---

# 24. Final Technical Direction

AAHAR shall be built as a secure, modular, hospital-first F&B operations platform using:

```text
Next.js
NestJS
PostgreSQL
Prisma
Redis
Docker
Swagger
JWT
RBAC
Azure-ready deployment
```

The system shall prioritize:

- Data consistency
- Inventory traceability
- Payment safety
- Auditability
- Security
- ERP readiness
- Business-date accuracy
- Production scalability
