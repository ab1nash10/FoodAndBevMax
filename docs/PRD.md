# AAHAR - Product Requirements Document (PRD)

Version: 1.0
Product Name: AAHAR
Document Type: Product Requirements Document

---

# 1. Product Vision

AAHAR is a unified Food & Beverage Management Platform that enables food ordering, billing, inventory management, kitchen operations, delivery management, employee meal programs, QR ordering, reporting, and ERP integration across hospitals and campuses.

---

# 2. Product Goals

## Business Goals

* Improve operational efficiency
* Reduce manual work
* Improve inventory visibility
* Increase order processing speed
* Improve customer experience
* Enable centralized management

## User Goals

* Faster ordering
* Faster billing
* Transparent order tracking
* Digital payment support
* Mobile ordering experience

---

# 3. Applications

AAHAR consists of multiple applications.

| Application          | Users              |
| -------------------- | ------------------ |
| Admin Portal         | Admin, Super Admin |
| POS Application      | POS Operators      |
| Kitchen Application  | Kitchen Operators  |
| Inventory Portal     | Inventory Managers |
| Employee PWA         | Employees          |
| Customer QR PWA      | Customers          |
| Delivery Application | Delivery Operators |

---

# 4. Navigation Structure

## Admin Portal

Dashboard

Masters

* Companies
* Locations
* Restaurants
* Kitchens
* Counters

Users

* Users
* Roles
* Permissions

Operations

* Menu
* Inventory
* Orders

Reports

* Sales
* Inventory
* Payments
* Audit

Settings

* Payment Gateway
* ERP Integration

---

# 5. Dashboard Requirements

## Admin Dashboard

### KPI Cards

* Today's Orders
* Today's Revenue
* Active Orders
* Low Stock Items

### Charts

* Sales Trend
* Order Trend
* Payment Trend

### Widgets

* Top Selling Items
* Recent Orders
* Inventory Alerts

---

## POS Dashboard

### Cards

* Orders Today
* Revenue Today
* Active Shift
* Pending Orders

---

## Inventory Dashboard

### Cards

* Current Stock Value
* Low Stock Count
* Transfers Pending
* Adjustments Today

---

# 6. Module Requirements

---

# Module 1 - Authentication

## Features

* Mobile OTP Login
* Email OTP Login
* JWT Authentication
* Session Management
* Logout
* Passwordless Authentication

## Acceptance Criteria

* OTP expires in 5 minutes
* JWT generated after login
* Unauthorized access blocked

---

# Module 2 - User Management

## Features

### User List

Search Users

Filter Users

Export Users

### Create User

Fields

* Employee Code
* Name
* Mobile
* Email
* Role
* Location

### Edit User

### Disable User

## Acceptance Criteria

* Employee Code unique
* Mobile unique

---

# Module 3 - Role Management

## Features

### Role List

### Create Role

### Edit Role

### Assign Permissions

## Acceptance Criteria

Permissions enforced at API and UI level.

---

# Module 4 - Organization Management

## Company Management

Create Company

Update Company

Deactivate Company

---

## Location Management

Create Location

Update Location

Deactivate Location

---

## Restaurant Management

Create Restaurant

Update Restaurant

Deactivate Restaurant

---

# Module 5 - Menu Management

## Categories

Create Category

Edit Category

Delete Category

---

## Food Items

Create Item

Edit Item

Delete Item

---

### Food Item Fields

* SKU
* Name
* Description
* Category
* Kitchen
* Image
* Preparation Time

---

## Pricing

Support:

* Employee Price
* Room Price
* Counter Price

---

## Availability

* Available
* Out Of Stock
* Hidden

---

# Module 6 - Inventory Management

## Inventory Items

Create Inventory Item

Edit Inventory Item

---

## Stock In

Add Inventory

---

## Stock Transfer

Central Store

↓

Restaurant

↓

Counter

---

## Stock Adjustment

Reasons

* Damage
* Expired
* Wastage
* Correction

---

# Module 7 - POS

## POS Main Screen

### Categories Panel

### Food Grid

### Cart

### Payment Panel

---

## POS Features

Add Item

Remove Item

Update Quantity

Apply Discount

Generate KOT

Generate Bill

---

## Payments

Cash

UPI

Card

Split Payment

Complimentary

---

# Module 8 - Order Management

## Order Types

* POS
* Room Service
* Employee
* QR Order

---

## Status Flow

PLACED

↓

CONFIRMED

↓

PREPARING

↓

READY

↓

ASSIGNED

↓

DELIVERED

↓

COMPLETED

---

# Module 9 - Kitchen Management

## Kitchen Dashboard

Columns

* New
* Preparing
* Ready
* Completed

---

## Features

Start Preparation

Mark Ready

Mark Completed

---

# Module 10 - Delivery Management

## Delivery Dashboard

Assigned Orders

Delivered Orders

History

---

## Features

Assign Delivery

Mark Delivered

Track Delivery Status

---

# Module 11 - Employee Ordering PWA

## Features

Login

Browse Menu

Add To Cart

Checkout

Payment

Order Tracking

Order History

---

# Module 12 - Customer QR Ordering

## Features

QR Scan

Browse Menu

Cart

Payment

Track Order

Guest Checkout

---

# Module 13 - Discount Management

## Discount Types

Employee

Department

Location

Event

---

## Discount Rules

Percentage

Fixed Amount

Monthly Limit

Daily Limit

---

# Module 14 - Reporting

## Sales Reports

Daily

Monthly

Restaurant Wise

Counter Wise

---

## Inventory Reports

Stock Summary

Movement Report

Adjustment Report

---

## Payment Reports

Cash

UPI

Card

Gateway

---

## Employee Reports

Employee Orders

Discount Usage

---

# Module 15 - ERP Integration

## Export Types

Sales

Inventory

Payments

Discounts

---

## Export Modes

Manual

Scheduled

---

# 7. Non Functional Requirements

## Performance

Page Load < 2 Seconds

Order Creation < 3 Seconds

POS Billing < 2 Seconds

---

## Availability

99.5% Uptime

---

## Scalability

50+ Locations

500+ Concurrent Users

5000+ Orders Per Day

---

## Security

RBAC

JWT

Audit Logs

HTTPS

Encrypted Data

---

# 8. MVP Scope

Authentication

User Management

Organization Management

Menu

Inventory

POS

Kitchen

QR Ordering

Payments

Reports

ERP Export

---

# 9. Future Scope

Loyalty Program

Coupons

Vendor Portal

Recipe Costing

Demand Forecasting

AI Recommendations

---

# 10. Acceptance Criteria

The system shall:

* Support all defined user roles
* Process orders end-to-end
* Maintain inventory accuracy
* Support ERP exports
* Generate audit trails
* Support QR ordering
* Support multiple payment modes

---

# 11. Product Success Metrics

* 95% Order Completion Success
* < 3 Seconds Order Creation
* 99.5% Uptime
* 90% Reduction In Manual Tracking
