# AAHAR - Implementation Plan

Version: 2.0
Product Name: AAHAR
Document Type: Implementation Plan
Status: Updated for Hospital → Store/F&B → Kitchen → Restaurant Architecture

---

# 1. Purpose

This document defines the complete implementation roadmap for AAHAR from current working foundation to production go-live.

It is intended for:

- Development tracking
- Codex implementation guidance
- Manager reporting
- Sprint planning
- Risk tracking
- Production readiness planning

---

# 2. Current Project Status

The following foundation has already been implemented and tested:

| Area                             | Status                      |
| -------------------------------- | --------------------------- |
| Monorepo setup                   | Completed                   |
| pnpm workspace                   | Completed                   |
| Turborepo                        | Completed                   |
| Docker setup                     | Completed                   |
| PostgreSQL                       | Completed                   |
| Redis                            | Completed                   |
| Prisma migration                 | Completed                   |
| Seed data                        | Completed                   |
| Auth service                     | Completed                   |
| OTP login                        | Completed                   |
| JWT                              | Completed                   |
| RBAC foundation                  | Completed                   |
| User service                     | Completed                   |
| Role APIs                        | Completed                   |
| Permission APIs                  | Completed                   |
| Organization service             | Partially Completed         |
| Company/Location/Restaurant APIs | Completed but need refactor |
| Swagger                          | Completed                   |
| Security baseline                | Completed                   |
| Admin login UI                   | Completed                   |

---

# 3. Important Refactor Required

The earlier model used:

```text
Company
↓
Location
↓
Restaurant
```

The new approved model is:

```text
Hospital
│
├── Location
├── Store/F&B
├── Kitchen
└── Restaurant
      └── Counter
```

Therefore, the current Organization module must be refactored.

---

# 4. Implementation Rules

## 4.1 Development Cycle

Every module must follow this cycle:

```text
Documentation
↓
Database / Prisma
↓
Backend API
↓
Swagger Testing
↓
Admin UI / App UI
↓
Integration Testing
↓
Regression Testing
↓
Move to Next Module
```

---

## 4.2 Codex Rules

Codex must:

- Read relevant docs before implementation.
- Modify only requested modules.
- Avoid unrelated refactors.
- Preserve existing working functionality.
- Add Swagger documentation for every API.
- Add DTO validation.
- Apply RBAC.
- Add audit logs for critical actions.
- Run lint and build after changes.

Codex must not:

- Build POS before inventory/menu foundation.
- Build separate order engines for each order source.
- Update stock without stock ledger.
- Disable security for convenience.
- Create duplicate payment attempts.
- Post unapproved transactions to ERP.

---

# 5. Overall Implementation Roadmap

## Phase 0 - Documentation & Architecture Reset

Estimated Duration:

```text
1 Week
```

Goal:

Update all project documents according to AAHAR V2.

Deliverables:

- BRD.md
- ERD.md
- TRD.md
- FSD.md
- API_SPEC.md
- IMPLEMENTATION_PLAN.md
- CODEX_RULES.md
- CODEX_MASTER_PROMPT.md
- UI_UX_GUIDELINES.md
- SECURITY_ARCHITECTURE.md
- PAYMENT_SAFETY_ARCHITECTURE.md
- PRODUCTION_ARCHITECTURE.md
- ERP_SUN_ARCHITECTURE.md

Milestone:

```text
AAHAR V2 Architecture Baseline Approved
```

Status:

```text
In Progress
```

---

# 6. Phase 1 - Foundation Refactor

Estimated Duration:

```text
2 Weeks
```

Goal:

Refactor current Organization module from Company-based model to Hospital-based model.

## Scope

Backend:

- Hospital APIs
- Location APIs
- Store/F&B APIs
- Kitchen APIs
- Restaurant APIs
- Counter APIs

Database:

- Rename/replace Company concept with Hospital
- Add Store table
- Add Kitchen table
- Add Counter table
- Update Restaurant mapping
- Update User hospital mapping
- Update seed data

Admin UI:

- Hospital Management
- Location Management
- Store Management
- Kitchen Management
- Restaurant Management
- Counter Management

## APIs

```text
GET    /api/v1/hospitals
GET    /api/v1/hospitals/{id}
POST   /api/v1/hospitals
PUT    /api/v1/hospitals/{id}
DELETE /api/v1/hospitals/{id}

GET    /api/v1/locations
POST   /api/v1/locations

GET    /api/v1/stores
POST   /api/v1/stores

GET    /api/v1/kitchens
POST   /api/v1/kitchens

GET    /api/v1/restaurants
POST   /api/v1/restaurants

GET    /api/v1/counters
POST   /api/v1/counters
```

Dependencies:

- Auth
- RBAC
- Current Organization Service
- Updated ERD

Risk:

```text
Medium
```

Milestone:

```text
Hospital Administration Ready
```

Definition of Done:

- Prisma migration created.
- Seed data updated.
- Swagger APIs working.
- Admin UI connected.
- Lint passes.
- Build passes.
- Current login remains working.

---

# 7. Phase 2 - Master Data Management

Estimated Duration:

```text
2-3 Weeks
```

Goal:

Create all masters required before transactions.

## Scope

- Item Category Master
- Item Master
- Employee Master
- Vendor Master
- Time Slot Master
- Item Price Master
- Restaurant Menu Mapping
- Discount Master
- Discount Approval Master
- Payment Gateway Master

## Key Rules

- Every item must have Item Type.
- MRP items require batch and expiry.
- Staff discount requires employee validation.
- Menu visibility depends on time slot and day.
- Payment gateway must be configurable per hospital/restaurant.

Dependencies:

- Phase 1 Hospital Administration

Risk:

```text
Medium
```

Milestone:

```text
Master Configuration Ready
```

Definition of Done:

- All master APIs implemented.
- Swagger tested.
- Admin UI screens completed.
- Validation rules enforced.
- RBAC applied.
- Audit logs added.

---

# 8. Phase 3 - Store/F&B Inventory and GRN

Estimated Duration:

```text
3-4 Weeks
```

Goal:

Implement MRP inventory lifecycle.

## Scope

- Indent
- Purchase Order Reference
- Vendor Receiving
- GRN
- GRN Lines
- GRN Batch Details
- Batch Number
- Expiry Date
- Accepted Quantity
- Rejected Quantity
- Store Stock
- Near Expiry Tracking
- Expired Stock Handling

## Key Rules

- GRN supports partial receiving.
- One GRN line can have multiple batches.
- Accepted quantity only is posted to stock.
- Rejected quantity is not added to stock.
- Expired stock cannot be accepted.
- Posting GRN creates stock ledger and stock balance.

Dependencies:

- Phase 2 Master Data
- Item Master
- Vendor Master
- Store Master

Risk:

```text
High
```

Milestone:

```text
MRP Inventory Ready
```

Definition of Done:

- GRN API working.
- Multiple batch support working.
- Stock ledger created on GRN posting.
- Stock balance updated correctly.
- Swagger tested.
- UI screens completed.
- Reports foundation available for GRN/Stock.

---

# 9. Phase 4 - Kitchen Production

Estimated Duration:

```text
2 Weeks
```

Goal:

Implement readymade food production.

## Scope

- Kitchen Production Entry
- Chef Entry
- Readymade Item Selection
- Produced Quantity
- Kitchen Stock
- Production Posting
- Kitchen Stock Dashboard

## Key Rules

- Only READYMADE items allowed.
- Chef selects from Item Master.
- Chef cannot type arbitrary item names.
- Posting production increases Kitchen stock.
- Stock ledger entry is mandatory.

Dependencies:

- Phase 2 Master Data
- Kitchen Master
- Item Master

Risk:

```text
Medium
```

Milestone:

```text
Kitchen Production Ready
```

Definition of Done:

- Production APIs working.
- Kitchen stock increases correctly.
- Stock ledger created.
- Kitchen UI completed.
- Swagger tested.

---

# 10. Phase 5 - Distribution and Acknowledgement

Estimated Duration:

```text
2-3 Weeks
```

Goal:

Implement movement of stock from Store/Kitchen to Restaurant.

## Scope

- Store to Restaurant Transfer
- Kitchen to Restaurant Transfer
- Restaurant to Store Return
- Restaurant to Kitchen Return
- Transfer Dispatch
- Pending Acknowledgement
- Accept Full
- Accept Partial
- Reject Full
- Rejection Reason
- Proof Upload Design

## Key Rules

- Source stock reduces on dispatch.
- Destination stock increases only after acknowledgement.
- Accepted quantity increases restaurant stock.
- Rejected quantity is traceable.
- Transfer must have transaction number.
- Every movement must create stock ledger.

Dependencies:

- Phase 3 Store Inventory
- Phase 4 Kitchen Production
- Restaurant Master

Risk:

```text
High
```

Milestone:

```text
Distribution and Acknowledgement Ready
```

Definition of Done:

- Transfer APIs implemented.
- Acknowledgement APIs implemented.
- Restaurant stock updates only after acknowledgement.
- UI completed.
- Audit logs added.
- Swagger tested.

---

# 11. Phase 6 - Restaurant Stock and Menu Availability

Estimated Duration:

```text
1-2 Weeks
```

Goal:

Show available restaurant stock and control sellable menu.

## Scope

- Restaurant Stock Dashboard
- Stock Balance View
- MRP Stock Count
- Readymade Stock Count
- Live Item Availability
- Low Stock
- Out of Stock
- Near Expiry
- Menu Visibility Logic

## Key Rules

Menu item is visible only if:

- Restaurant is active.
- Item is active.
- Item is mapped to restaurant.
- Current day is allowed.
- Current time is within time slot.
- Stock > 0 for MRP/Readymade.
- Live item is available.

Dependencies:

- Phase 2 Master Data
- Phase 5 Distribution

Risk:

```text
Medium
```

Milestone:

```text
Restaurant Stock Available for Sales
```

Definition of Done:

- Restaurant stock visible.
- Out-of-stock items blocked.
- Menu availability API working.
- UI completed.

---

# 12. Phase 7 - POS Billing

Estimated Duration:

```text
3-4 Weeks
```

Goal:

Implement restaurant/counter billing.

## Scope

- POS Screen
- Counter Selection
- Customer Type Selection
- Employee ID Entry
- Item Selection
- Cart
- Discount Calculation
- GST Calculation
- Payment Mode Selection
- Invoice Generation
- KOT Generation
- Stock Deduction
- Bill Print Design

## Payment Modes

- Cash
- Card
- UPI
- Pine Labs
- Complimentary

## Key Rules

- Zero-stock MRP/Readymade items cannot be sold.
- Staff discount requires employee validation.
- MRP stock is deducted using FEFO.
- Live items require KOT.
- Invoice generated after payment confirmation or allowed pending mode.

Dependencies:

- Phase 6 Restaurant Stock
- Discount Master
- Payment Gateway Master

Risk:

```text
High
```

Milestone:

```text
POS Billing Ready
```

Definition of Done:

- POS creates order.
- Payment captured.
- Invoice generated.
- KOT generated if needed.
- Stock deducted correctly.
- Swagger tested.
- UI tested.

---

# 13. Phase 8 - Common Order Engine

Estimated Duration:

```text
2 Weeks
```

Goal:

Implement unified order backend for all order channels.

## Scope

- Order Header
- Order Lines
- Order Status History
- Order Source
- Customer Type
- Rate Type
- Delivery Type
- Cancellation
- Status Updates

## Order Sources

- ROOM_CALL
- ROOM_QR
- COUNTER_POS
- TABLE_QR
- EMPLOYEE_MOBILE
- EMPLOYEE_QR
- EMPLOYEE_COUNTER

Dependencies:

- Phase 7 POS Billing

Risk:

```text
High
```

Milestone:

```text
Common Order Engine Ready
```

Definition of Done:

- One order engine supports all sources.
- No duplicate hardcoded order systems.
- Status history works.
- Stock validation works.
- Payment integration ready.

---

# 14. Phase 9 - Kitchen KOT

Estimated Duration:

```text
2 Weeks
```

Goal:

Implement kitchen order ticket workflow.

## Scope

- KOT Generation
- KOT Lines
- Kitchen Dashboard
- Accept KOT
- Mark Preparing
- Mark Ready
- Dispatch
- Cancel KOT

## Key Rules

- MRP items usually do not require KOT.
- Live items require KOT.
- Readymade items may require serving/packing ticket.
- Kitchen sees only mapped restaurant/kitchen orders.

Dependencies:

- Phase 8 Common Order Engine

Risk:

```text
Medium
```

Milestone:

```text
Kitchen KOT Ready
```

Definition of Done:

- KOT generated correctly.
- Kitchen dashboard working.
- Status updates reflected in order.
- UI completed.

---

# 15. Phase 10 - QR, Room, and Employee Ordering

Estimated Duration:

```text
3-4 Weeks
```

Goal:

Implement non-counter ordering channels.

## Scope

- Restaurant QR
- Table QR
- Room QR
- Bedside QR
- Employee QR
- Employee Mobile/PWA
- Menu Page
- Cart
- Staff Discount
- PayU/Razorpay Payment
- Order Tracking

## Key Rules

- QR identifies context.
- Employee discount requires Employee ID.
- Menu respects time slot.
- Menu respects stock.
- Payment uses safe payment attempt logic.

Dependencies:

- Phase 8 Common Order Engine
- Phase 11 Payment Safety

Risk:

```text
High
```

Milestone:

```text
Digital Ordering Ready
```

Definition of Done:

- QR menu loads.
- Order can be placed.
- Payment can be initiated.
- Order tracking works.
- Employee discount works.

---

# 16. Phase 11 - Payment and Reconciliation

Estimated Duration:

```text
3 Weeks
```

Goal:

Implement payment safety and gateway foundation.

## Scope

- Payment Initiation
- Payment Attempts
- Idempotency Key
- Pine Labs Flow
- PayU Flow
- Razorpay Flow
- Cash Payment
- UPI Payment
- Gateway Callback
- Payment Verification
- Refund
- Reconciliation Status

## Key Rules

- One active payment attempt per order.
- Duplicate payment must be blocked.
- Callback must be idempotent.
- Gateway success must be verified server-side.
- Unknown payment state must go to reconciliation.

Dependencies:

- Phase 7 POS
- Phase 8 Orders
- Payment Gateway Master

Risk:

```text
Very High
```

Milestone:

```text
Payment Safety Ready
```

Definition of Done:

- Payment attempt logic works.
- Duplicate payment blocked.
- Callback duplicate safe.
- Refund recorded.
- Reconciliation status tracked.

---

# 17. Phase 12 - Delivery Management

Estimated Duration:

```text
1-2 Weeks
```

Goal:

Implement delivery assignment and tracking.

## Scope

- Ready Orders
- Supervisor Assignment
- Delivery Operator Task
- Picked Up
- Out For Delivery
- Delivered
- Failed Delivery
- Remarks

Dependencies:

- Phase 9 KOT
- Phase 10 QR/Room Orders

Risk:

```text
Medium
```

Milestone:

```text
Delivery Ready
```

Definition of Done:

- Supervisor can assign delivery.
- Delivery operator can update status.
- Order status updates accordingly.

---

# 18. Phase 13 - Restaurant Closing and Supervisor Approval

Estimated Duration:

```text
2-3 Weeks
```

Goal:

Implement restaurant closing and reconciliation.

## Scope

- Closing Header
- Closing Payment Summary
- Closing Item Summary
- Expected Sale Calculation
- Declared Collection Entry
- Difference Calculation
- Mismatch Reason
- Proof Upload
- Supervisor Approval
- Correction Required
- Closing Lock

## Key Formula

```text
Expected Sale Amount = Total invoice value of sold items
Actual Collection Amount = Cash + Card + UPI + Pine Labs + PayU + Razorpay
Difference = Expected Sale Amount - Actual Collection Amount
```

## Key Rules

- Difference requires reason.
- Difference requires supervisor approval.
- Approved closing is locked.
- Approved closing becomes ERP-ready.

Dependencies:

- Phase 7 POS
- Phase 11 Payments

Risk:

```text
High
```

Milestone:

```text
Closing and Supervisor Approval Ready
```

Definition of Done:

- Closing created.
- Payment summary calculated.
- Stock summary calculated.
- Mismatch handled.
- Supervisor approval works.

---

# 19. Phase 14 - Wastage and Day-End Readymade Handling

Estimated Duration:

```text
2 Weeks
```

Goal:

Implement wastage and day-end stock reset.

## Scope

- Wastage Entry
- Breakage
- Expired
- Day-End Readymade
- Spoiled
- Customer Return
- Manual Adjustment
- Supervisor Approval
- Stock Ledger Posting

## Key Rules

- Approved wastage creates stock ledger.
- Readymade old stock becomes wastage/zero at day-end.
- Expired stock is batch-wise traceable.
- Supervisor approval is required for day-end readymade wastage.

Dependencies:

- Phase 4 Kitchen Production
- Phase 13 Closing

Risk:

```text
High
```

Milestone:

```text
Wastage and Day-End Ready
```

Definition of Done:

- Wastage APIs working.
- Approval works.
- Stock reduced through ledger.
- Day-end readymade handling works.

---

# 20. Phase 15 - ERP/SUN Integration

Estimated Duration:

```text
2-4 Weeks
```

Goal:

Implement ERP/SUN posting.

## Scope

- ERP Export Records
- ERP Payload
- Ready To Post
- Posted
- Failed
- Retry Pending
- Posting Attempts
- Error Tracking
- Manual Retry
- Scheduled Posting

## ERP Posting Types

- Sales
- Payment
- Discount
- Wastage
- Closing
- Refund
- Adjustment

## Key Rules

Do not post:

- Failed payments
- Cancelled orders
- Unapproved closings
- Unapproved wastage
- Duplicate transactions

Dependencies:

- Phase 13 Closing
- Phase 14 Wastage
- ERP/SUN API availability

Risk:

```text
Very High
```

Milestone:

```text
ERP/SUN Posting Ready
```

Definition of Done:

- ERP payload generated.
- Posting status tracked.
- Retry works.
- Failed records visible.
- Audit trail exists.

---

# 21. Phase 16 - Reports

Estimated Duration:

```text
2-3 Weeks
```

Goal:

Implement business reports.

## Scope

- Hospital Sales Report
- Location Sales Report
- Restaurant Sales Report
- Counter Sales Report
- Item Sales Report
- Payment Mode Report
- GST Report
- Discount Report
- Employee Discount Report
- GRN Report
- Batch Stock Report
- Near Expiry Report
- Expired Stock Report
- Kitchen Production Report
- Transfer Report
- Acknowledgement Report
- Wastage Report
- Closing Report
- Mismatch Report
- ERP Posting Report
- Audit Log Report

Dependencies:

- All previous modules

Risk:

```text
Medium
```

Milestone:

```text
Reports Ready
```

Definition of Done:

- Reports load.
- Filters work.
- Export works.
- Pagination works.
- Role-based access works.

---

# 22. Phase 17 - Production Security and Hardening

Estimated Duration:

```text
3-4 Weeks
```

Goal:

Prepare AAHAR for production.

## Scope

- WAF
- Load Balancer
- HTTPS
- Secure Headers
- Secrets Management
- Database Backup
- Redis Hardening
- Monitoring
- Logging
- Alerts
- Performance Testing
- Security Review
- Penetration Testing Support
- Payment Security Review

## Recommended Hosting

```text
Azure
```

Recommended components:

- Azure App Service / Container Apps / AKS
- Azure Database for PostgreSQL
- Azure Cache for Redis
- Azure Key Vault
- Azure Blob Storage
- Azure Front Door / Application Gateway with WAF
- Azure Monitor

Risk:

```text
High
```

Milestone:

```text
Production Ready
```

Definition of Done:

- HTTPS enabled.
- Secrets moved to Key Vault.
- Backups configured.
- Monitoring enabled.
- WAF configured.
- Load testing completed.
- Security checklist completed.

---

# 23. Phase 18 - UAT and Go-Live

Estimated Duration:

```text
2-4 Weeks
```

Goal:

Complete UAT and production launch.

## Scope

- UAT Environment
- Business User Testing
- Bug Fixes
- Data Setup
- User Training
- SOP Preparation
- Go-Live Checklist
- Production Deployment
- Hypercare Support

Milestone:

```text
AAHAR Live
```

Definition of Done:

- UAT signed off.
- Production configured.
- Users trained.
- Data migrated/setup.
- Go-live completed.
- Support process active.

---

# 24. Timeline Estimate

## Minimum Pilot

```text
3-4 Months
```

Includes:

- Hospital setup
- Store/Kitchen/Restaurant setup
- Item master
- Basic inventory
- GRN
- Kitchen production
- Basic transfer
- Basic POS

## Full Business Flow

```text
6-8 Months
```

Includes:

- Complete inventory
- QR ordering
- KOT
- Delivery
- Payment
- Closing
- Supervisor approval
- ERP

## Enterprise Production Ready

```text
9-12 Months
```

Includes:

- Security hardening
- Monitoring
- Payment safety
- ERP reliability
- Reports
- UAT
- Production go-live

---

# 25. Current Next Development Step

Since Auth, Users, and basic Organization are already working, the next development step is:

```text
Refactor Organization Service to Hospital-based structure
```

Target:

```text
hospitals
locations
stores
kitchens
restaurants
counters
```

Codex should implement:

- Prisma schema update
- Migration
- Seed update
- APIs
- Swagger
- RBAC permissions
- Audit logs
- Admin UI updates

---

# 26. Immediate Codex Implementation Prompt

Use this prompt only after BRD, ERD, TRD, FSD, and API_SPEC are updated.

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
- docs only if required for consistency

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

# 27. Tracking Columns for Project Plan

Use these columns in Excel:

```text
Phase
Module
Sub-Module
Priority
Estimated Effort
Dependencies
Status
Progress %
Owner
Risk Level
Milestone
Remarks
```

---

# 28. Final Implementation Direction

AAHAR shall be developed in controlled phases.

The most important sequence is:

```text
Hospital Foundation
↓
Master Data
↓
Inventory
↓
Kitchen Production
↓
Distribution
↓
Restaurant Stock
↓
POS
↓
Orders
↓
Payments
↓
Closing
↓
ERP
↓
Reports
↓
Production
```

This sequence must not be skipped.
