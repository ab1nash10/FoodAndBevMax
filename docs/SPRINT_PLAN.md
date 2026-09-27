# AAHAR - Sprint Plan

Version: 1.0

Project Duration: 22 Weeks

Methodology: Agile Scrum

Sprint Duration: 2 Weeks

---

# Project Roadmap

## Phase 1

Foundation & Administration

Duration: 4 Weeks

Sprints:

- Sprint 1
- Sprint 2

---

## Phase 2

Menu & Inventory

Duration: 4 Weeks

Sprints:

- Sprint 3
- Sprint 4

---

## Phase 3

POS & Kitchen

Duration: 5 Weeks

Sprints:

- Sprint 5
- Sprint 6

---

## Phase 4

Delivery & Ordering

Duration: 3 Weeks

Sprints:

- Sprint 7
- Sprint 8

---

## Phase 5

Reports & ERP

Duration: 4 Weeks

Sprints:

- Sprint 9
- Sprint 10

---

# Sprint 1

Duration: Week 1 - Week 2

Goal:

Foundation Setup

Deliverables:

## Infrastructure

- Turborepo Setup
- Monorepo Setup
- Docker Setup
- PostgreSQL Setup
- Redis Setup

---

## Backend

Create:

- Auth Service
- User Service
- Organization Service

---

## Database

Create:

- users
- roles
- permissions
- role_permissions
- user_roles
- companies
- locations
- restaurants
- audit_logs

---

## Authentication

Implement:

- OTP Login
- JWT Access Token
- JWT Refresh Token
- Logout

---

## RBAC

Implement:

- Roles
- Permissions
- Guards
- Decorators

---

## Deliverable

System Login Working

---

# Sprint 2

Duration: Week 3 - Week 4

Goal:

Organization Management

Deliverables:

## Company Management

- Create Company
- Edit Company
- List Companies

---

## Location Management

- Create Location
- Edit Location
- List Locations

---

## Restaurant Management

- Create Restaurant
- Edit Restaurant
- List Restaurants

---

## User Management

- Create User
- Edit User
- List Users

---

## Role Management

- Create Role
- Assign Permissions

---

## Deliverable

Admin Foundation Complete

---

# Sprint 3

Duration: Week 5 - Week 6

Goal:

Menu Management

Deliverables:

## Categories

- CRUD

---

## Food Items

- CRUD

---

## Pricing

- Employee Price
- Room Price
- Counter Price

---

## Availability

- Available
- Out Of Stock
- Hidden

---

## Deliverable

Menu Module Ready

---

# Sprint 4

Duration: Week 7 - Week 8

Goal:

Inventory Management

Deliverables:

## Inventory Items

- CRUD

---

## Stock In

- Add Inventory

---

## Transfers

- Request
- Approve
- Dispatch
- Receive

---

## Stock Adjustment

- Damage
- Expired
- Wastage

---

## Deliverable

Inventory Module Ready

---

# Sprint 5

Duration: Week 9 - Week 11

Goal:

POS System

Deliverables:

## POS UI

- Categories
- Food Grid
- Cart

---

## Billing

- Order Creation
- KOT Generation

---

## Payments

- Cash
- UPI
- Card

---

## Complimentary Orders

- OTP Approval

---

## Deliverable

POS Operational

---

# Sprint 6

Duration: Week 12 - Week 13

Goal:

Kitchen Operations

Deliverables:

## Kitchen Dashboard

- New Orders
- Preparing
- Ready
- Completed

---

## KOT Processing

- Start
- Ready
- Complete

---

## Deliverable

Kitchen Module Operational

---

# Sprint 7

Duration: Week 14 - Week 15

Goal:

Delivery Management

Deliverables:

## Delivery Dashboard

- Assigned Orders
- Delivery History

---

## Delivery Workflow

- Assign
- Pickup
- Deliver

---

## Deliverable

Delivery Workflow Ready

---

# Sprint 8

Duration: Week 16 - Week 18

Goal:

Employee & QR Ordering

Deliverables:

## Employee PWA

- Login
- Menu
- Cart
- Checkout
- Tracking

---

## Customer QR PWA

- QR Scan
- Menu
- Payment
- Tracking

---

## Deliverable

End-to-End Ordering Live

---

# Sprint 9

Duration: Week 19 - Week 20

Goal:

Reports

Deliverables:

## Sales Reports

- Daily
- Monthly

---

## Inventory Reports

- Summary
- Movement

---

## Payment Reports

- Cash
- UPI
- Card

---

## Deliverable

Reporting Module Ready

---

# Sprint 10

Duration: Week 21 - Week 22

Goal:

ERP & Production Readiness

Deliverables:

## ERP Export

- Sales
- Inventory
- Payments

---

## Audit Logs

- Full Audit Tracking

---

## Performance

- Optimization
- Caching

---

## UAT

- Bug Fixes
- User Acceptance Testing

---

## Deliverable

Production Ready System

---

# Definition of Done

A feature is complete when:

- Development Completed
- Unit Tests Passed
- API Tested
- Swagger Updated
- RBAC Applied
- Audit Logging Added
- Code Reviewed
- UAT Approved

---

# Release Milestones

## Milestone 1

Foundation Ready

End of Sprint 2

---

## Milestone 2

Menu + Inventory Ready

End of Sprint 4

---

## Milestone 3

POS + Kitchen Ready

End of Sprint 6

---

## Milestone 4

Ordering Ready

End of Sprint 8

---

## Milestone 5

Production Release

End of Sprint 10