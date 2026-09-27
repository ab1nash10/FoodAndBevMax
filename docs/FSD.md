# AAHAR - Functional Specification Document (FSD)

Version: 2.0
Product Name: AAHAR
Document Type: Functional Specification Document
Status: Updated for Hospital → Store/F&B → Kitchen → Restaurant Architecture

---

# 1. Purpose

This document defines the functional behavior, screens, validations, workflows, business rules, and acceptance criteria for AAHAR.

This document must be used by Codex and developers while implementing:

* Admin Portal
* Store/F&B Inventory
* Kitchen Production
* Restaurant Operations
* POS Billing
* QR Ordering
* Employee Ordering
* Room Ordering
* Closing
* ERP/SUN Posting
* Reports

---

# 2. Application Scope

AAHAR shall support the following applications:

| Application           | Users                         |
| --------------------- | ----------------------------- |
| Admin Portal          | Super Admin, Hospital Admin   |
| Store/F&B Portal      | Store Manager, Store Receiver |
| Kitchen App           | Chef, Kitchen Operator        |
| Restaurant App        | Restaurant User               |
| POS App               | POS Operator                  |
| Supervisor App        | Supervisor                    |
| Customer/Employee PWA | Customer, Employee            |
| Delivery App          | Delivery Operator             |
| Finance/ERP Portal    | Finance User                  |

---

# 3. Global Functional Rules

## 3.1 Hospital Mandatory Rule

Every Store, Kitchen, Restaurant, Counter, Item Mapping, Stock Transaction, Order, Closing, and ERP Posting must be linked to a Hospital.

---

## 3.2 Item Type Rule

Every item must be one of:

* MRP
* READYMADE
* LIVE

---

## 3.3 Inventory Rule

AAHAR must use a common stock engine:

* Stock Ledger
* Stock Balance

Stock balance must never be updated without stock ledger entry.

---

## 3.4 Order Rule

All order sources must use the same common order engine.

Order sources:

* ROOM_CALL
* ROOM_QR
* COUNTER_POS
* TABLE_QR
* EMPLOYEE_MOBILE
* EMPLOYEE_QR
* EMPLOYEE_COUNTER

---

## 3.5 Payment Safety Rule

One active payment attempt per order is allowed.

Duplicate payments must be prevented.

---

## 3.6 Business Date Rule

Every transaction must capture:

* Transaction DateTime
* Business Date

---

# 4. Common UI Standards

Every list screen must include:

* Page title
* Search
* Filter
* Pagination
* Status badge
* Create button
* Edit action
* View action
* Empty state
* Loading state
* Error state

Every form must include:

* Required field indicator
* Validation messages
* Save button
* Cancel button
* Success toast
* Error toast

---

# 5. Authentication Module

## 5.1 Login Screen

URL:

```text
/auth/login
```

Fields:

| Field         | Type   | Required |
| ------------- | ------ | -------- |
| Mobile Number | Text   | Yes      |
| Send OTP      | Button | Yes      |

Actions:

* User enters mobile number.
* User clicks Send OTP.
* System calls Auth API.
* OTP is sent/logged in development.
* OTP verification screen appears.

Validation:

* Mobile number required.
* Mobile must be numeric.
* Mobile must be 10 digits.

---

## 5.2 OTP Verification Screen

Fields:

| Field | Type   | Required |
| ----- | ------ | -------- |
| OTP   | Number | Yes      |

Actions:

* User enters OTP.
* System verifies OTP.
* On success, access token is stored.
* User is redirected to dashboard.

Validation:

* OTP must be 6 digits.
* OTP expiry = 5 minutes.

Acceptance Criteria:

* Valid OTP logs user in.
* Invalid OTP shows error.
* Expired OTP shows error.
* User cannot access protected pages without login.

---

# 6. Admin Dashboard

URL:

```text
/dashboard
```

Widgets:

* Total Hospitals
* Active Restaurants
* Today's Orders
* Today's Revenue
* Pending GRNs
* Pending Transfers
* Pending Closings
* ERP Posting Failures

Charts:

* Sales Trend
* Payment Mode Split
* Inventory Movement
* Restaurant Performance

Acceptance Criteria:

* Dashboard loads after login.
* User sees only data allowed by role.
* Empty state is shown when no data exists.

---

# 7. Hospital Administration Module

> BA terminology note: The Admin Portal now shows this module as **Location Master**.
> Internally it continues to use the Hospital entity and `hospitalId` relationships to avoid
> breaking existing Store, Kitchen, Restaurant, GRN, Stock, Transfer, and Production flows.

---

## 7.1 Hospital List Screen

URL:

```text
/hospitals
```

Columns:

* Hospital Name
* Hospital Code
* City
* State
* GST Applicable
* Status
* Actions

Actions:

* View
* Edit
* Deactivate

Filters:

* Status
* City
* State

---

## 7.2 Create/Edit Hospital Screen

URL:

```text
/hospitals/create
/hospitals/{id}/edit
```

Fields:

| Field          | Type     | Required |
| -------------- | -------- | -------- |
| Hospital Name  | Text     | Yes      |
| Hospital Code  | Text     | Yes      |
| Address        | Textarea | No       |
| City           | Text     | No       |
| State          | Text     | No       |
| GST Applicable | Checkbox | No       |
| Bill Prefix    | Text     | No       |
| Active         | Switch   | Yes      |

Validation:

* Hospital Name required.
* Hospital Code required.
* Hospital Code must be unique.
* Bill Prefix should be unique if configured.

Acceptance Criteria:

* User can create hospital.
* User can update hospital.
* Duplicate code is blocked.
* Inactive hospital cannot be used in new transactions.

---

# 8. Location Management

## 8.1 Location List Screen

URL:

```text
/locations
```

Columns:

* Location Name
* Hospital
* Building
* Floor
* Area
* Status
* Actions

---

## 8.2 Create/Edit Location Screen

Fields:

| Field         | Type     | Required |
| ------------- | -------- | -------- |
| Hospital      | Dropdown | Yes      |
| Location Name | Text     | Yes      |
| Building      | Text     | No       |
| Floor         | Text     | No       |
| Area          | Text     | No       |
| Address       | Textarea | No       |
| Active        | Switch   | Yes      |

Validation:

* Hospital required.
* Location Name required.

Acceptance Criteria:

* Location must be mapped to hospital.
* Inactive location cannot be selected in new Store/Kitchen/Restaurant setup.

---

# 9. Store/F&B Management

## 9.1 Store List Screen

URL:

```text
/stores
```

Columns:

* Store Name
* Store Code
* Hospital
* Location
* Store Type
* Status
* Actions

---

## 9.2 Create/Edit Store Screen

Fields:

| Field      | Type     | Required |
| ---------- | -------- | -------- |
| Hospital   | Dropdown | Yes      |
| Location   | Dropdown | Yes      |
| Store Name | Text     | Yes      |
| Store Code | Text     | Yes      |
| Store Type | Dropdown | No       |
| Address    | Textarea | No       |
| Active     | Switch   | Yes      |

Validation:

* Hospital required.
* Store Name required.
* Store Code required.
* Store Code must be unique within hospital.

Acceptance Criteria:

* Store is created under selected hospital.
* Store can be mapped to restaurants.
* Store is used for MRP inventory and GRN.

---

# 10. Kitchen Management

## 10.1 Kitchen List Screen

URL:

```text
/kitchens
```

Columns:

* Kitchen Name
* Kitchen Code
* Hospital
* Location
* Opening Time
* Closing Time
* Status
* Actions

---

## 10.2 Create/Edit Kitchen Screen

Fields:

| Field        | Type     | Required |
| ------------ | -------- | -------- |
| Hospital     | Dropdown | Yes      |
| Location     | Dropdown | Yes      |
| Kitchen Name | Text     | Yes      |
| Kitchen Code | Text     | Yes      |
| Opening Time | Time     | No       |
| Closing Time | Time     | No       |
| Active       | Switch   | Yes      |

Validation:

* Hospital required.
* Kitchen Name required.
* Kitchen Code required.
* Kitchen Code must be unique within hospital.

Acceptance Criteria:

* Kitchen is created under selected hospital.
* Kitchen can be mapped to restaurants.
* Kitchen is used for production and KOT.

---

# 11. Restaurant Management

## 11.1 Restaurant List Screen

URL:

```text
/restaurants
```

Columns:

* Restaurant Name
* Restaurant Code
* Hospital
* Location
* Store
* Kitchen
* GST Number
* FSSAI Number
* Status
* Actions

---

## 11.2 Create/Edit Restaurant Screen

Fields:

| Field                      | Type     | Required |
| -------------------------- | -------- | -------- |
| Hospital                   | Dropdown | Yes      |
| Location                   | Dropdown | Yes      |
| Mapped Store               | Dropdown | No       |
| Mapped Kitchen             | Dropdown | No       |
| Restaurant Name            | Text     | Yes      |
| Restaurant Code            | Text     | Yes      |
| GST Number                 | Text     | No       |
| PAN Number                 | Text     | No       |
| FSSAI Number               | Text     | No       |
| Address                    | Textarea | No       |
| Opening Time               | Time     | No       |
| Closing Time               | Time     | No       |
| Normal Discount Applicable | Checkbox | No       |
| Staff Discount Applicable  | Checkbox | No       |
| Online Ordering Enabled    | Checkbox | No       |
| In-Room Dining Enabled     | Checkbox | No       |
| B2C QR Enabled             | Checkbox | No       |
| UPI ID                     | Text     | No       |
| Bank Name                  | Text     | No       |
| Bank Branch                | Text     | No       |
| SUN BU                     | Text     | No       |
| SUN T1                     | Text     | No       |
| SUN T2                     | Text     | No       |
| Active                     | Switch   | Yes      |

Validation:

* Hospital required.
* Restaurant Name required.
* Restaurant Code required.
* Restaurant Code unique within hospital.

Acceptance Criteria:

* Restaurant can be mapped to Store and Kitchen.
* Restaurant can have online and in-room options enabled.
* Restaurant can have SUN ERP mapping.

---

# 12. Counter/POS Management

## 12.1 Counter List Screen

URL:

```text
/counters
```

Columns:

* Counter Name
* Counter Code
* Restaurant
* POS Device
* Payment Device
* Pine Labs Device
* Status
* Actions

---

## 12.2 Create/Edit Counter Screen

Fields:

| Field               | Type     | Required |
| ------------------- | -------- | -------- |
| Restaurant          | Dropdown | Yes      |
| Counter Name        | Text     | Yes      |
| Counter Code        | Text     | Yes      |
| POS Device ID       | Text     | No       |
| Payment Device ID   | Text     | No       |
| Pine Labs Device ID | Text     | No       |
| Active              | Switch   | Yes      |

Validation:

* Restaurant required.
* Counter Name required.
* Counter Code required.
* Counter Code unique within restaurant.

---

# 13. Item Category Master

## 13.1 Item Category List

URL:

```text
/item-categories
```

Columns:

* Category Name
* Parent Category
* Status
* Actions

---

## 13.2 Create/Edit Category

Fields:

| Field           | Type     | Required |
| --------------- | -------- | -------- |
| Category Name   | Text     | Yes      |
| Parent Category | Dropdown | No       |
| Active          | Switch   | Yes      |

Validation:

* Category Name required.
* Duplicate category should be blocked.

---

# 14. Item Master

## 14.1 Item List

URL:

```text
/items
```

Columns:

* Item Name
* Item Code
* Category
* Item Type
* Veg Type
* MRP
* Base Price
* GST %
* Status
* Actions

Filters:

* Item Type
* Category
* Veg Type
* Status

---

## 14.2 Create/Edit Item

Fields:

| Field            | Type     | Required     |
| ---------------- | -------- | ------------ |
| Item Name        | Text     | Yes          |
| Item Code        | Text     | Yes          |
| Category         | Dropdown | Yes          |
| Item Type        | Dropdown | Yes          |
| Veg Type         | Dropdown | Yes          |
| Base Price       | Number   | No           |
| MRP              | Number   | No           |
| GST %            | Number   | Yes          |
| HSN Code         | Text     | No           |
| Preparation Time | Number   | No           |
| Batch Required   | Checkbox | Auto for MRP |
| Expiry Required  | Checkbox | Auto for MRP |
| Discount Allowed | Checkbox | No           |
| Active           | Switch   | Yes          |

Item Type Values:

* MRP
* READYMADE
* LIVE

Veg Type Values:

* VEG
* NON_VEG
* EGGETARIAN

Validation:

* Item Name required.
* Item Code required.
* Item Type required.
* MRP items must have MRP.
* MRP items must have Batch Required = true.
* MRP items must have Expiry Required = true.
* GST % required.

Acceptance Criteria:

* MRP item supports GRN and batch.
* Readymade item supports kitchen production.
* Live item supports KOT and availability.

---

# 15. Price Master

## 15.1 Item Price List

URL:

```text
/item-prices
```

Columns:

* Item
* Hospital
* Restaurant
* Rate Type
* Price
* Effective From
* Effective To
* Status

---

## 15.2 Create/Edit Price

Fields:

| Field          | Type     | Required |
| -------------- | -------- | -------- |
| Item           | Dropdown | Yes      |
| Hospital       | Dropdown | Yes      |
| Restaurant     | Dropdown | No       |
| Rate Type      | Dropdown | Yes      |
| Price          | Number   | Yes      |
| Effective From | Date     | Yes      |
| Effective To   | Date     | No       |
| Active         | Switch   | Yes      |

Rate Type:

* NORMAL
* STAFF
* ROOM
* COUNTER

Validation:

* Price must be greater than zero.
* Effective From required.
* Duplicate active price for same item/rate type/date range should be blocked.

---

# 16. Time Slot Master

## 16.1 Time Slot List

URL:

```text
/time-slots
```

Columns:

* Slot Name
* Start Time
* End Time
* Always Available
* Status

---

## 16.2 Create/Edit Time Slot

Fields:

| Field            | Type     | Required    |
| ---------------- | -------- | ----------- |
| Slot Name        | Text     | Yes         |
| Start Time       | Time     | Conditional |
| End Time         | Time     | Conditional |
| Always Available | Checkbox | No          |
| Active           | Switch   | Yes         |

Validation:

* If Always Available is false, Start Time and End Time are required.
* End Time must be after Start Time unless overnight slot is supported.

---

# 17. Restaurant Menu Mapping

## 17.1 Menu Mapping Screen

URL:

```text
/restaurant-menus
```

Fields:

| Field         | Type     | Required |
| ------------- | -------- | -------- |
| Hospital      | Dropdown | Yes      |
| Restaurant    | Dropdown | Yes      |
| Item          | Dropdown | Yes      |
| Available     | Switch   | Yes      |
| Display Order | Number   | No       |

Menu visibility depends on:

* Restaurant active
* Item active
* Item mapped to restaurant
* Time slot
* Day
* Stock availability for MRP/Readymade
* Live item availability

---

# 18. Employee Master

## 18.1 Employee List

URL:

```text
/employees
```

Columns:

* Employee Code
* Employee Name
* Hospital
* Department
* Designation
* Mobile
* Discount Eligible
* Status

---

## 18.2 Create/Edit Employee

Fields:

| Field                 | Type     | Required |
| --------------------- | -------- | -------- |
| Hospital              | Dropdown | Yes      |
| Employee Code         | Text     | Yes      |
| Employee Name         | Text     | Yes      |
| Department            | Text     | No       |
| Designation           | Text     | No       |
| Mobile                | Text     | No       |
| Email                 | Text     | No       |
| Eligible For Discount | Checkbox | No       |
| Active                | Switch   | Yes      |

Validation:

* Employee Code required.
* Employee Code unique.
* Employee must be active for staff discount.

---

# 19. Discount Management

## 19.1 Discount Rule List

URL:

```text
/discounts
```

Columns:

* Discount Name
* Discount Type
* Customer Type
* Rate Type
* Discount %
* Discount Amount
* Effective From
* Effective To
* Status

---

## 19.2 Create/Edit Discount Rule

Fields:

| Field                        | Type     | Required    |
| ---------------------------- | -------- | ----------- |
| Hospital                     | Dropdown | Yes         |
| Restaurant                   | Dropdown | No          |
| Discount Name                | Text     | Yes         |
| Discount Type                | Dropdown | Yes         |
| Customer Type                | Dropdown | No          |
| Rate Type                    | Dropdown | No          |
| Discount %                   | Number   | Conditional |
| Discount Amount              | Number   | Conditional |
| Employee Validation Required | Checkbox | No          |
| Effective From               | Date     | Yes         |
| Effective To                 | Date     | No          |
| Active                       | Switch   | Yes         |

Discount Types:

* NORMAL_CUSTOMER_DISCOUNT
* STAFF_DISCOUNT
* ITEM_DISCOUNT
* CATEGORY_DISCOUNT
* EVENT_DISCOUNT

Rules:

* Staff discount requires employee validation.
* Either Discount % or Discount Amount is required.
* Discount logic must be common across POS, QR, Employee, and Room Orders.

---

# 20. Vendor Master

## 20.1 Vendor List

URL:

```text
/vendors
```

Columns:

* Vendor Code
* Vendor Name
* GST Number
* Contact Person
* Mobile
* Status

---

## 20.2 Create/Edit Vendor

Fields:

| Field          | Type     | Required |
| -------------- | -------- | -------- |
| Vendor Code    | Text     | Yes      |
| Vendor Name    | Text     | Yes      |
| GST Number     | Text     | No       |
| Contact Person | Text     | No       |
| Mobile         | Text     | No       |
| Email          | Text     | No       |
| Address        | Textarea | No       |
| Active         | Switch   | Yes      |

Validation:

* Vendor Code unique.
* Vendor Name required.

---

# 21. Payment Gateway Master

## 21.1 Payment Gateway List

URL:

```text
/payment-gateways
```

Columns:

* Gateway Name
* Gateway Type
* Hospital
* Restaurant
* Merchant ID
* Terminal ID
* UPI ID
* Status

---

## 21.2 Create/Edit Payment Gateway

Fields:

| Field        | Type     | Required    |
| ------------ | -------- | ----------- |
| Hospital     | Dropdown | Yes         |
| Restaurant   | Dropdown | No          |
| Gateway Name | Text     | Yes         |
| Gateway Type | Dropdown | Yes         |
| Merchant ID  | Text     | Conditional |
| Terminal ID  | Text     | Conditional |
| UPI ID       | Text     | Conditional |
| Active       | Switch   | Yes         |

Gateway Types:

* PINE_LABS
* RAZORPAY
* PAYU
* CASH
* CARD
* UPI

---

# 22. Store/F&B Inventory Module

---

## 22.1 Indent List

URL:

```text
/indents
```

Columns:

* Indent Number
* Hospital
* Store
* Indent Date
* Requested By
* Status
* Actions

---

## 22.2 Create Indent

Fields:

| Field       | Type     | Required |
| ----------- | -------- | -------- |
| Hospital    | Dropdown | Yes      |
| Store       | Dropdown | Yes      |
| Indent Date | Date     | Yes      |
| Items       | Grid     | Yes      |
| Remarks     | Textarea | No       |

Item Grid:

* Item
* Requested Qty
* Remarks

Validation:

* Store required.
* At least one item required.
* Requested Qty must be greater than zero.

---

## 22.3 GRN List

URL:

```text
/grns
```

Columns:

* GRN Number
* Hospital
* Store
* PO Number
* Vendor
* Received Date
* Status
* Actions

---

## 22.4 Create GRN

Fields:

| Field         | Type          | Required |
| ------------- | ------------- | -------- |
| Hospital      | Dropdown      | Yes      |
| Store         | Dropdown      | Yes      |
| PO Reference  | Dropdown/Text | No       |
| Vendor        | Dropdown      | No       |
| Received Date | DateTime      | Yes      |
| Received By   | Auto          | Yes      |
| Remarks       | Textarea      | No       |
| Items         | Grid          | Yes      |

Item Grid:

* Item
* Ordered Qty
* Received Qty
* Accepted Qty
* Rejected Qty
* Rejection Reason
* Remarks

Batch Grid for MRP Items:

* Batch Number
* Manufacturing Date
* Expiry Date
* Received Qty
* Accepted Qty
* Rejected Qty
* Rejection Reason

Validation:

* MRP item requires batch number.
* MRP item requires expiry date.
* Accepted Qty + Rejected Qty = Received Qty.
* Expired stock cannot be accepted.
* At least one item required.

Actions:

* Save Draft
* Submit Verification
* Post to Stock
* Cancel

Acceptance Criteria:

* GRN can support multiple batches.
* Only accepted quantity is posted to stock.
* Posting GRN creates stock ledger and stock balance entries.

---

# 23. Stock Dashboard

URL:

```text
/stock
```

Filters:

* Hospital
* Location Type
* Store/Kitchen/Restaurant/Counter
* Item Type
* Item
* Batch
* Expiry

Columns:

* Item
* Item Type
* Location Type
* Location
* Batch Number
* Expiry Date
* Available Qty
* Reserved Qty
* Status

Status:

* Available
* Low Stock
* Near Expiry
* Expired
* Out of Stock

---

# 24. Kitchen Production Module

## 24.1 Production List

URL:

```text
/kitchen-productions
```

Columns:

* Production Number
* Hospital
* Kitchen
* Production Date
* Business Date
* Chef
* Status

---

## 24.2 Create Production Entry

Fields:

| Field           | Type      | Required |
| --------------- | --------- | -------- |
| Hospital        | Dropdown  | Yes      |
| Kitchen         | Dropdown  | Yes      |
| Production Date | Date      | Yes      |
| Business Date   | Date      | Yes      |
| Chef            | Auto/User | Yes      |
| Items           | Grid      | Yes      |
| Remarks         | Textarea  | No       |

Item Grid:

* Readymade Item
* Produced Qty
* Wastage Qty
* Remarks

Validation:

* Only READYMADE items allowed.
* Produced Qty must be greater than zero.
* At least one item required.

Actions:

* Save Draft
* Post Production
* Cancel

Acceptance Criteria:

* Posted production increases kitchen stock.
* Posted production creates stock ledger.
* Chef selects item from master, not free text.

---

# 25. Transfer and Distribution Module

## 25.1 Transfer List

URL:

```text
/transfers
```

Columns:

* Transfer Number
* Hospital
* Source
* Destination
* Transfer Type
* Business Date
* Status
* Actions

---

## 25.2 Create Transfer

Fields:

| Field            | Type     | Required |
| ---------------- | -------- | -------- |
| Hospital         | Dropdown | Yes      |
| Source Type      | Dropdown | Yes      |
| Source           | Dropdown | Yes      |
| Destination Type | Dropdown | Yes      |
| Destination      | Dropdown | Yes      |
| Transfer Type    | Dropdown | Yes      |
| Business Date    | Date     | Yes      |
| Items            | Grid     | Yes      |
| Remarks          | Textarea | No       |

Item Grid:

* Item
* Batch Number
* Expiry Date
* Available Qty
* Sent Qty
* Remarks

Validation:

* Sent Qty must be greater than zero.
* Sent Qty cannot exceed available qty.
* MRP transfer requires batch and expiry.
* Transfer source and destination cannot be same.

Actions:

* Save Draft
* Dispatch
* Cancel

Acceptance Criteria:

* Dispatch reduces source stock.
* Destination stock does not increase until acknowledgement.
* Transfer status becomes Pending Acknowledgement after dispatch.

---

# 26. Restaurant Acknowledgement Module

## 26.1 Pending Acknowledgement List

URL:

```text
/acknowledgements/pending
```

Columns:

* Transfer Number
* Source
* Destination
* Transfer Date
* Status
* Actions

---

## 26.2 Acknowledge Transfer Screen

Fields:

| Field           | Type     | Required |
| --------------- | -------- | -------- |
| Transfer Number | Display  | Yes      |
| Source          | Display  | Yes      |
| Destination     | Display  | Yes      |
| Items           | Grid     | Yes      |
| Remarks         | Textarea | No       |
| Proof Upload    | File     | No       |

Item Grid:

* Item
* Sent Qty
* Accepted Qty
* Rejected Qty
* Rejection Reason
* Remarks

Validation:

* Accepted Qty + Rejected Qty = Sent Qty.
* Rejection reason required if rejected qty > 0.
* Accepted Qty cannot exceed sent qty.

Actions:

* Accept Full
* Accept Partial
* Reject Full
* Submit Acknowledgement

Acceptance Criteria:

* Accepted quantity increases restaurant stock.
* Rejected quantity is traceable.
* Acknowledgement creates audit trail.

---

# 27. Restaurant Stock Screen

URL:

```text
/restaurant-stock
```

Filters:

* Hospital
* Restaurant
* Item Type
* Item
* Batch
* Expiry

Columns:

* Item
* Item Type
* Available Qty
* Reserved Qty
* Batch
* Expiry
* Status

Rules:

* MRP and READYMADE items show stock count.
* LIVE items show availability status.
* Zero stock MRP/READYMADE items cannot be sold.

---

# 28. POS Billing Module

## 28.1 POS Screen

URL:

```text
/pos
```

Layout:

* Left: Categories
* Center: Item Grid
* Right: Cart
* Bottom/Right: Payment Summary

Required Controls:

* Select Restaurant
* Select Counter
* Select Customer Type
* Employee ID field if customer type is Employee/Staff
* Search Item
* Item Quantity
* Cart
* Discount
* Payment Mode
* Generate Invoice

Item Card Shows:

* Item Name
* Item Type
* Price
* Stock Count for MRP/READYMADE
* Preparation Time for LIVE
* Veg/Non-Veg indicator
* Availability status

Validation:

* Cannot sell zero-stock MRP/READYMADE items.
* Staff discount requires valid employee ID.
* Payment required unless allowed pending.
* Cart cannot be empty.

Acceptance Criteria:

* POS creates order.
* POS applies correct rate type.
* POS applies discount.
* POS captures payment.
* POS generates invoice.
* POS generates KOT when required.
* POS deducts stock for MRP/READYMADE.

---

# 29. QR / Room / Employee Ordering

## 29.1 QR Menu Screen

URL:

```text
/qr/{qrCode}
```

System should identify context:

* Restaurant
* Table
* Room
* Employee

Menu should show:

* Available items
* Time-slot filtered items
* Price
* Discount
* Preparation time
* Stock status

Rules:

* MRP/READYMADE require available stock.
* LIVE requires availability and valid time slot.
* Employee discount requires employee validation.

---

# 30. Kitchen KOT Module

## 30.1 KOT Dashboard

URL:

```text
/kitchen/kot
```

Columns / Kanban:

* Generated
* Accepted
* Preparing
* Ready
* Dispatched

KOT Card Shows:

* KOT Number
* Order Number
* Restaurant
* Room/Table/Counter
* Item
* Qty
* Special Instruction
* Preparation Time
* Payment Status

Actions:

* Accept
* Start Preparing
* Mark Ready
* Dispatch

---

# 31. Delivery Module

## 31.1 Delivery Assignment Screen

URL:

```text
/delivery/assignments
```

Supervisor can:

* View ready orders
* Assign delivery operator
* Reassign delivery operator
* Track delivery status

Delivery Operator can:

* Accept task
* Mark picked up
* Mark out for delivery
* Mark delivered
* Add remarks

---

# 32. Restaurant Closing Module

## 32.1 Closing Screen

URL:

```text
/restaurant-closing
```

Sections:

* Sales Summary
* Payment Summary
* Item Stock Summary
* Wastage
* Returns
* Difference Calculation
* Remarks
* Proof Upload

Fields:

* Business Date
* Restaurant
* Expected Sale Amount
* Cash Declared
* Card Declared
* UPI Declared
* Pine Labs Declared
* PayU Declared
* Razorpay Declared
* Difference Amount
* Remarks
* Proof Upload

Rules:

* Difference = Expected Sale Amount - Actual Collection Amount.
* If difference is non-zero, reason is required.
* Supervisor approval is mandatory for mismatch.

Actions:

* Save Draft
* Submit Closing
* Cancel

Acceptance Criteria:

* Matched closing can be approved.
* Mismatched closing requires reason.
* Closing locks after approval.
* Approved closing becomes ready for ERP posting.

---

# 33. Wastage Module

## 33.1 Wastage Entry Screen

URL:

```text
/wastage
```

Fields:

* Hospital
* Restaurant
* Kitchen
* Business Date
* Wastage Type
* Items
* Remarks
* Proof Upload

Wastage Types:

* BREAKAGE
* EXPIRED
* DAY_END_READYMADE
* SPOILED
* CUSTOMER_RETURN
* MANUAL_ADJUSTMENT

Rules:

* Approved wastage creates stock ledger entry.
* Day-end readymade wastage requires supervisor approval.
* Expired MRP wastage must track batch and expiry.

---

# 34. Supervisor Approval Module

URL:

```text
/supervisor-approvals
```

Supervisor can approve:

* Closing mismatch
* Wastage
* Discount exception
* Complimentary order
* Stock adjustment
* Payment mismatch

Actions:

* Approve
* Reject
* Ask Correction
* Escalate

---

# 35. ERP/SUN Module

## 35.1 ERP Posting Dashboard

URL:

```text
/erp
```

Sections:

* Ready to Post
* Posted
* Failed
* Retry Pending

ERP should receive:

* Sales
* Payments
* Discounts
* Wastage
* Closing
* Refunds
* Adjustments

Rules:

* Do not post failed payments.
* Do not post cancelled orders.
* Do not post unapproved closing mismatch.
* Do not post unapproved wastage.
* Avoid duplicate posting.

---

# 36. Reports Module

Minimum Reports:

* Hospital Sales Report
* Location-wise Sales Report
* Restaurant-wise Sales Report
* Counter-wise Sales Report
* Item-wise Sales Report
* Payment Mode Report
* GST Report
* Discount Report
* Employee Discount Report
* GRN Report
* Batch-wise Stock Report
* Near Expiry Report
* Expired Stock Report
* Kitchen Production Report
* Transfer Report
* Restaurant Acknowledgement Report
* Wastage Report
* Closing Report
* Mismatch Report
* ERP Posting Report
* Audit Log Report

Every report should support:

* Date range
* Hospital filter
* Restaurant filter
* Export to Excel/CSV
* Pagination

---

# 37. Acceptance Criteria for All Modules

Every module must:

* Follow RBAC.
* Add audit logs for critical actions.
* Validate input.
* Show success and error messages.
* Support pagination where applicable.
* Support search and filtering.
* Use standard API response format.
* Be visible in Swagger.
* Pass lint and build.
* Avoid breaking existing working modules.

---

# 38. Definition of Done

A feature is complete only when:

* Backend API is implemented.
* Swagger is updated.
* DTO validation is added.
* RBAC is applied.
* Audit logging is added.
* Database migration is completed if required.
* UI is integrated if applicable.
* Lint passes.
* Build passes.
* Basic manual testing is completed.
* No regression in existing modules.
