# AAHAR - Business Requirements Document (BRD)

Version: 2.0
Product Name: AAHAR
Document Type: Business Requirements Document
Status: Approved Business Baseline

---

# 1. Executive Summary

AAHAR is a hospital-based Food & Beverage Operations Platform designed to manage the complete lifecycle of food procurement, production, inventory, restaurant operations, ordering, billing, payment collection, closing, reconciliation, and ERP/SUN integration.

The platform supports:

* Hospital Food Operations
* Store / F&B Inventory
* Kitchen Production
* Restaurant Operations
* POS Billing
* QR Ordering
* Employee Ordering
* Room Service Ordering
* Delivery Operations
* Payment Reconciliation
* Restaurant Closing
* Supervisor Approval
* ERP/SUN Integration

---

# 2. Business Vision

To provide a centralized digital platform that manages all hospital food operations from procurement to ERP posting.

AAHAR should become the single source of truth for:

* Inventory
* Production
* Sales
* Payments
* Wastage
* Closing
* ERP Transactions

---

# 3. Core Business Hierarchy

```text
Hospital
│
├── Store / F&B
│
├── Kitchen
│
└── Restaurant
      │
      └── Counter
```

### Hospital

Top-level business entity.

### Store / F&B

Manages:

* MRP Items
* Procurement
* GRN
* Batch Management
* Expiry Tracking

### Kitchen

Manages:

* Readymade Production
* Kitchen Stock
* Kitchen Distribution

### Restaurant

Manages:

* Sales
* Restaurant Stock
* Orders
* Closing

### Counter

Manages:

* POS Billing
* Customer Sales

---

# 4. Item Types

Every item must belong to one of the following types.

## MRP Items

Examples:

* Coke
* Pepsi
* Water Bottle
* Chips
* Packed Bakery

Characteristics:

* Vendor supplied
* Batch mandatory
* Expiry mandatory
* GRN mandatory

---

## Readymade Items

Examples:

* Samosa
* Pakora
* Sandwich
* Poha

Characteristics:

* Produced in kitchen
* Daily stock
* Distributed to restaurants
* Day-end wastage rule applies

---

## Live Food Items

Examples:

* Dosa
* Paratha
* Chole Bhature
* Fresh Meals

Characteristics:

* Produced on demand
* Controlled by menu availability
* Controlled by preparation time
* Controlled by meal timing

---

# 5. Major Business Modules

## Hospital Administration

* Hospital Setup
* Location Setup
* User Management
* Role Management

---

## Store / F&B Management

* Indent
* Purchase Order Reference
* Vendor Management
* GRN
* Batch Management
* Expiry Management
* Stock Management

---

## Kitchen Management

* Production Entry
* Kitchen Stock
* Kitchen Distribution
* Kitchen Wastage

---

## Restaurant Management

* Restaurant Stock
* POS
* QR Orders
* Employee Orders
* Room Orders

---

## Payment Management

* Cash
* Card
* UPI
* Pine Labs
* PayU
* Razorpay

---

## Closing & Reconciliation

* Daily Closing
* Collection Verification
* Mismatch Handling
* Supervisor Approval

---

## ERP Integration

* SUN ERP Export
* Retry Management
* Posting Status Tracking

---

# 6. Core Business Workflow

```text
Hospital Setup
↓
Store / F&B Setup
↓
Kitchen Setup
↓
Restaurant Setup
↓
Item Master Setup
↓
MRP Procurement
↓
GRN
↓
Kitchen Production
↓
Distribution
↓
Restaurant Acknowledgement
↓
Sales
↓
Payment
↓
Closing
↓
Supervisor Approval
↓
ERP/SUN
```

---

# 7. MRP Procurement Workflow

```text
Indent
↓
PO Reference
↓
Vendor Delivery
↓
Verification
↓
GRN
↓
Store Stock
↓
Distribution to Restaurant
```

Store must support:

* Partial Receiving
* Accepted Quantity
* Rejected Quantity
* Batch Number
* Expiry Date

---

# 8. Kitchen Production Workflow

```text
Chef Login
↓
Production Entry
↓
Kitchen Stock Creation
↓
Distribution to Restaurant
↓
Restaurant Acknowledgement
↓
Sale
↓
Return / Wastage
```

Readymade food is treated as daily stock.

---

# 9. Distribution Workflow

Two types of distribution:

### Store → Restaurant

For MRP Items.

### Kitchen → Restaurant

For Readymade Items.

Rule:

Restaurant stock increases only after acknowledgement.

---

# 10. Restaurant Acknowledgement Workflow

Restaurant user can:

* Accept Full Quantity
* Accept Partial Quantity
* Reject Quantity

Stock updates only after acknowledgement.

All acknowledgements must be auditable.

# 11. Organization Module

The Organization module shall define the complete operating structure of AAHAR.

## 11.1 Required Masters

- Hospital Master
- Location Master
- Store/F&B Master
- Kitchen Master
- Restaurant Master
- Counter/POS Master
- Employee Master
- Item Category Master
- Item Master
- GST Master
- Discount Master
- Payment Gateway Master

---

# 12. Hospital Master

Hospital is mandatory.

No Store, Kitchen, Restaurant, Counter, Item Mapping, Inventory Transaction, Order, Closing, or ERP Posting can exist without Hospital mapping.

## Fields

- Hospital Name
- Hospital Code
- Address
- City
- State
- Active / Inactive
- Bill Prefix
- GST Applicable
- Payment Gateway Mapping
- ERP/SUN Mapping

---

# 13. Store / F&B Master

Store/F&B handles MRP and packed items.

## Responsibilities

- Vendor item receiving
- GRN
- Batch tracking
- Expiry tracking
- Store stock
- Transfer to Restaurant

## Fields

- Store Name
- Store Code
- Hospital
- Location
- Store Type
- Address
- Active / Inactive

---

# 14. Kitchen Master

Kitchen handles readymade food production and KOT preparation.

## Responsibilities

- Production entry
- Kitchen stock
- Kitchen to Restaurant transfer
- KOT preparation
- Day-end wastage

## Fields

- Kitchen Name
- Kitchen Code
- Hospital
- Location
- Opening Time
- Closing Time
- Mapped Restaurants
- Active / Inactive

---

# 15. Restaurant Master

Restaurant is the selling point.

It receives:

- MRP items from Store/F&B
- Readymade items from Kitchen
- Live food from menu availability

## Fields

- Restaurant Name
- Restaurant Code
- Hospital
- Location
- Mapped Store
- Mapped Kitchen
- GST Number
- PAN Number
- FSSAI Number
- Address
- Opening Time
- Closing Time
- Normal Discount Applicable
- Staff Discount Applicable
- Online Ordering Enabled
- In-Room Dining Enabled
- B2C QR Enabled
- UPI ID
- Bank Name
- Bank Branch
- SUN BU
- SUN T1
- SUN T2
- Active / Inactive

---

# 16. Counter / POS Master

Counter is mapped to Restaurant.

## Fields

- Counter Name
- Counter Code
- Restaurant
- POS Device
- Payment Device
- Pine Labs Device
- Active / Inactive

---

# 17. Item Category Master

Item Category Master shall define item grouping.

Examples:

- Packed Items / MRP
- Bakery
- North Indian
- South Indian
- Asian Food
- Thali
- Salad
- Beverages
- Snacks
- Live Counter

If user selects “Other”, system should allow new category creation subject to approval/configuration.

---

# 18. Item Master

Every food item must exist in Item Master before transactions.

## Fields

- Item Name
- Item Code
- Category
- Item Type
- Veg / Non-Veg / Eggetarian
- MRP
- Selling Price
- GST %
- HSN Code
- Preparation Time
- Available Time Slot
- Discount Applicable
- Active / Inactive

## Item Types

- MRP
- Readymade
- Live

---

# 19. Menu Management

Restaurant Menu controls sellable items.

Menu should support:

- Restaurant mapping
- Item mapping
- Time slot
- Days
- Veg / Non-Veg preference
- Price
- GST
- Availability
- Discount applicability

## Menu Visibility Rule

An item should be visible only if:

- Restaurant is active
- Item is active
- Item is mapped to restaurant
- Current time is within time slot
- Current day is allowed
- Stock is available for MRP/Readymade
- Live item is available

---

# 20. Inventory Types

Inventory is divided into:

## MRP Inventory

For packed/vendor items.

Requires:

- GRN
- Batch number
- Expiry date
- FEFO logic

## Readymade Inventory

For kitchen-produced items.

Requires:

- Production entry
- Daily stock
- Transfer to restaurant
- Day-end wastage

## Live Items

For made-on-demand items.

Controlled by:

- Menu availability
- Time slot
- Kitchen availability
- Preparation time

Live items may not require stock deduction in Phase 1.

# 21. Billing and Order Channels

AAHAR shall support multiple order channels using one common backend order engine.

## Supported Order Channels

- POS Counter Order
- QR Order
- Room / Bedside Order
- Employee Mobile Order
- Employee QR Order
- Employee Counter Order
- Table QR Order

## Common Order Rule

The system must not create separate hardcoded order engines for each order channel.

All orders must use common order lifecycle with source values.

## Order Source Values

- RoomCall
- RoomQR
- CounterPOS
- TableQR
- EmployeeMobile
- EmployeeQR
- EmployeeCounter

---

# 22. POS Billing

POS billing shall be used by counter operators.

## POS Responsibilities

- Select restaurant/counter
- Select customer type
- Enter employee ID if staff
- Select items
- Validate stock
- Validate time slot
- Apply discount
- Capture payment
- Generate invoice
- Generate KOT if required
- Print bill
- Complete order

## POS Sub-Flows

- Billing
- Shift End
- Day End

---

# 23. QR Ordering

QR ordering shall support:

- Restaurant QR
- Table QR
- Room QR
- Employee QR

QR should identify context automatically.

Examples:

- Restaurant
- Table
- Room
- Employee order source

---

# 24. In-Room / Bedside Ordering

Room ordering can happen through:

- Call Operator
- Room QR
- Bedside QR

Room order must capture:

- Hospital
- Restaurant
- Room Number
- Bed Number, if applicable
- Patient / Attendant details
- Payment status
- Delivery status

---

# 25. Mobile App / PWA Ordering

Employee and customer ordering shall be supported through PWA.

Employee ordering requires:

- Employee ID validation
- Staff discount validation
- Payment
- Order tracking

---

# 26. GST Management

GST shall be configurable at item level.

GST must be captured in:

- Item Master
- Invoice
- Reports
- ERP Posting

System should calculate:

- Gross Amount
- Discount Amount
- GST Amount
- Net Amount

---

# 27. Discount Management

AAHAR shall support centralized discount management.

Discount logic must not be hardcoded inside POS only.

The same discount engine must be used by:

- POS
- Employee Mobile
- Employee QR
- Employee Counter
- Room Orders
- QR Orders

## Discount Types

### Normal Discount

Applicable for:

- Patient
- Attendant
- Visitor
- Hospital Customer

Example:

Tea price = ₹20  
Normal discount = 10%  
Final price = ₹18

### Staff Discount

Applicable only after employee validation.

Required:

- Employee ID
- Employee validation
- Discount eligibility
- Audit log

Example:

Tea price = ₹20  
Staff price = ₹15

## Discount Master Fields

- Discount Name
- Discount Type
- Customer Type
- Item / Category / Restaurant Mapping
- Discount %
- Discount Amount
- Effective From
- Effective To
- Active / Inactive

---

# 28. Discount Approval Master

Discount approval shall be required for special cases.

Examples:

- Manual discount
- Complimentary order
- High-value discount
- Staff discount exception

Approval should capture:

- Requested By
- Approved By
- Reason
- Amount
- Timestamp
- Audit Log

---

# 29. Payment Gateway Management

AAHAR shall support multiple payment modes.

## Supported Payment Modes

- Cash
- Card
- UPI
- Pine Labs
- Razorpay
- PayU
- Complimentary

## Payment Gateway Master

System shall configure:

- Gateway Name
- Gateway Type
- Merchant ID
- Terminal ID
- UPI ID
- Active / Inactive
- Hospital Mapping
- Restaurant Mapping

## Pine Labs

Used mainly for POS counter payments.

## PayU / Razorpay

Used mainly for QR and mobile app payments.

## Cash

Used for POS and room delivery collections.

---

# 30. Payment Safety Rules

AAHAR shall prevent duplicate payments.

Rules:

- One active payment attempt per order
- Idempotency key mandatory
- Server-side payment verification mandatory
- Duplicate callback handling mandatory
- Payment status recovery required
- Refund audit trail required

If payment is deducted but network fails:

- System should check gateway status
- If success, order should be completed
- If failed, user should be allowed retry
- If unknown, payment should remain pending for reconciliation

---

# 31. Restaurant Closing

Each restaurant shall perform closing.

Closing includes:

- Total sale value
- Cash collected
- Card collected
- UPI collected
- Pine Labs amount
- PayU amount
- Razorpay amount
- Unsold stock
- Wastage
- Returned stock
- Remarks

## Closing Formula

Expected Sale Amount = Total invoice value of sold items

Actual Collection Amount = Cash + Card + UPI + Pine Labs + PayU + Razorpay

Difference = Expected Sale Amount - Actual Collection Amount

If difference is not zero, supervisor approval is mandatory.

---

# 32. Shift End

Shift End applies to POS/counter operator.

Shift End should capture:

- Opening cash
- Cash collected
- Card amount
- UPI amount
- Pine Labs amount
- Orders handled
- Cash handover
- Remarks

---

# 33. Day End

Day End applies to restaurant business day.

Day End should capture:

- Sales summary
- Payment summary
- Stock summary
- Wastage
- Returns
- Closing status
- Supervisor approval status

---

# 34. Supervisor Approval

Supervisor shall approve:

- Closing mismatch
- Wastage
- Discount exceptions
- Complimentary orders
- Day-end readymade wastage

Supervisor actions:

- Approve
- Reject
- Ask for correction
- Escalate

---

# 35. ERP / SUN Integration

Approved and final transactions shall flow to ERP/SUN.

ERP should receive:

- Hospital
- Restaurant
- Order Number
- Invoice Number
- Business Date
- Item Details
- Gross Amount
- Discount Amount
- GST Amount
- Net Amount
- Payment Mode
- Gateway Reference
- Employee ID, if applicable
- Wastage / Shortage Adjustment
- Closing Status

## ERP Posting Status

- Not Ready
- Ready To Post
- Posted
- Failed
- Retry Pending

Only clean and approved transactions should be posted to ERP.

---

# 36. Reports

AAHAR shall provide reports for:

- Location-wise sales
- Restaurant-wise sales
- Counter-wise sales
- Item-wise sales
- Payment mode report
- GST report
- Discount report
- Employee discount report
- GRN report
- Batch-wise stock report
- Near expiry report
- Expired stock report
- Kitchen production report
- Transfer report
- Restaurant acknowledgement report
- Wastage report
- Closing report
- Mismatch report
- ERP posting report
- Audit log report

# 37. Critical Business Rules

The following rules are mandatory and shall govern the entire AAHAR platform.

---

## Rule 1: Hospital is Mandatory

No Store, Kitchen, Restaurant, Counter, Item Mapping, Inventory Transaction, Order, Closing, or ERP Posting can exist without Hospital mapping.

Hospital is the top-level business entity.

---

## Rule 2: Item Type is Mandatory

Every item must belong to exactly one item type:

* MRP
* Readymade
* Live

Item type controls:

* Inventory behavior
* Expiry tracking
* Batch tracking
* Kitchen processing
* Wastage handling
* Order processing

---

## Rule 3: MRP Items Require Batch & Expiry

MRP Items must support:

* Batch Number
* Expiry Date
* Accepted Quantity
* Rejected Quantity
* Near Expiry Monitoring

MRP stock must always be maintained batch-wise.

---

## Rule 4: FEFO Logic

MRP inventory must use:

```text
First Expiry First Out (FEFO)
```

Items with the earliest expiry should be sold first.

System must:

* Block expired stock
* Warn near-expiry stock
* Allow configurable approval rules

---

## Rule 5: GRN Supports Partial Receiving

System must support:

```text
Ordered Qty ≠ Received Qty
Received Qty ≠ Accepted Qty
```

Examples:

* Short supply
* Damaged stock
* Expired stock
* Rejected stock

---

## Rule 6: Stock Ledger is Mandatory

Inventory must never be maintained only through current stock.

System shall maintain:

* Stock Ledger
* Stock Balance

Every stock movement must create stock ledger entries.

---

## Rule 7: Distribution Requires Acknowledgement

Restaurant stock shall increase only after acknowledgement.

Workflow:

```text
Transfer
↓
Pending Acknowledgement
↓
Accept / Reject
↓
Stock Update
```

No direct stock increase allowed.

---

## Rule 8: Every Transfer Must Be Traceable

Every inventory movement must have:

* Transfer Number
* Source
* Destination
* Item
* Quantity
* Status
* User
* Timestamp

---

## Rule 9: Zero Stock Cannot Be Sold

For:

* MRP Items
* Readymade Items

If:

```text
Available Stock = 0
```

item must not be sold.

---

## Rule 10: Readymade Food Is Daily Stock

Readymade food cannot be carried indefinitely.

At Day-End:

* Returned
* Redistributed
* Wastage

must be recorded.

---

## Rule 11: Business Date is Mandatory

System must maintain:

* Transaction DateTime
* Business Date

Reason:

Restaurant may close after midnight.

Business Date must be used for:

* Inventory
* Sales
* Closing
* ERP Posting
* Reports

---

## Rule 12: One Common Order Engine

All channels must use a common backend order lifecycle.

Channels:

* Room Call
* Room QR
* POS
* Table QR
* Employee Mobile
* Employee QR
* Employee Counter

Only OrderSource changes.

Business logic remains common.

---

## Rule 13: Staff Discount Requires Validation

Staff discount cannot be applied without:

* Employee ID
* Employee Validation
* Eligibility Check

---

## Rule 14: Menu Visibility Depends on Time

Items shall be visible only during configured availability windows.

Examples:

* Breakfast
* Lunch
* Dinner
* Always Available

---

## Rule 15: Payment Safety is Mandatory

System shall prevent duplicate payments.

Requirements:

* One active payment attempt per order
* Idempotency key
* Duplicate callback protection
* Gateway verification
* Reconciliation support

---

## Rule 16: Closing Requires Reconciliation

Expected Sale Amount must match Actual Collection Amount.

If difference exists:

* Reason mandatory
* Proof optional/mandatory based on configuration
* Supervisor approval mandatory

---

## Rule 17: ERP Receives Approved Transactions Only

ERP/SUN should receive only:

* Approved
* Finalized
* Reconciled

transactions.

ERP must not receive:

* Failed payments
* Cancelled orders
* Unapproved closings
* Unapproved wastage

---

# 38. Non-Functional Requirements

## Performance

Target:

* Page Load < 2 seconds
* POS Billing < 2 seconds
* Order Creation < 3 seconds
* Payment Processing < 5 seconds

---

## Availability

Target:

```text
99.5% uptime minimum
```

---

## Scalability

System should support:

* Multiple Hospitals
* Multiple Restaurants
* Multiple Counters
* Multiple Kitchens
* 500+ Concurrent Users
* 5000+ Orders Per Day

---

## Security

Mandatory:

* JWT Authentication
* RBAC
* Audit Logging
* Rate Limiting
* HTTPS
* Secure Secrets Management

---

# 39. Reports

Minimum Reports:

* Hospital Sales Report
* Restaurant Sales Report
* Counter Sales Report
* Item Sales Report
* GST Report
* Payment Mode Report
* Discount Report
* Employee Discount Report
* GRN Report
* Batch Report
* Expiry Report
* Production Report
* Transfer Report
* Acknowledgement Report
* Wastage Report
* Closing Report
* Mismatch Report
* ERP Posting Report
* Audit Log Report

---

# 40. Production Requirements

Before Go-Live:

* WAF
* Load Balancer
* Private Database
* Redis
* Monitoring
* Backups
* Disaster Recovery
* Audit Logs
* Payment Reconciliation
* ERP Retry Mechanism

---

# 41. Development Phases

## Phase 1

Foundation

* Hospital
* Location
* Store
* Kitchen
* Restaurant
* Counter
* Users
* Roles

---

## Phase 2

Master Data

* Item Categories
* Item Master
* Menu
* Pricing
* GST
* Discounts

---

## Phase 3

Store / F&B Inventory

* Indent
* PO Reference
* GRN
* Batch
* Expiry
* Store Stock

---

## Phase 4

Kitchen Production

* Production Entry
* Kitchen Stock
* Wastage

---

## Phase 5

Distribution

* Store to Restaurant
* Kitchen to Restaurant
* Acknowledgement

---

## Phase 6

Restaurant Operations

* POS
* Invoice
* KOT
* Payments

---

## Phase 7

QR & Mobile Ordering

* Room QR
* Table QR
* Employee QR
* Mobile Ordering

---

## Phase 8

Closing & Approval

* Closing
* Reconciliation
* Supervisor Approval

---

## Phase 9

ERP & Reporting

* ERP/SUN
* Reports
* Audit

---

## Phase 10

Production Hardening

* Security
* Monitoring
* Performance
* Go-Live

---

# 42. Success Criteria

AAHAR shall be considered successful when:

* Complete Hospital F&B workflow is digitized
* Inventory is traceable end-to-end
* MRP batch tracking is implemented
* Readymade production is controlled
* Restaurant acknowledgement is enforced
* Sales and collection reconciliation is automated
* ERP posting is automated
* Audit trail exists for all critical actions
* Payment duplication is prevented
* Multi-channel ordering works through one common order engine

---

# 43. Final Business Scope

AAHAR is a hospital-based Food & Beverage Management Platform that manages:

* Hospital Administration
* Store/F&B Inventory
* GRN & Batch Management
* Kitchen Production
* Distribution & Acknowledgement
* Restaurant Stock
* POS Billing
* QR Ordering
* Room Ordering
* Employee Ordering
* Discounts
* Payments
* Closing
* Supervisor Approval
* ERP/SUN Integration
* Reports
* Audit Logs

This document serves as the official business baseline for AAHAR development.
