# AAHAR - Entity Relationship Document (ERD)

Version: 2.0
Product Name: AAHAR
Document Type: Entity Relationship Design
Inventory Architecture: Single Inventory Engine using Stock Ledger + Stock Balance

---

# 1. Database Design Principles

AAHAR shall use PostgreSQL as the primary relational database.

The database must support:

* Hospital-based hierarchy
* Store/F&B inventory
* Kitchen production
* Restaurant stock
* POS billing
* QR ordering
* Employee ordering
* Payment reconciliation
* Restaurant closing
* ERP/SUN integration
* Full audit trail

---

# 2. Global Table Standards

Every major business table must include:

```sql
id UUID PRIMARY KEY
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Rules:

* Use UUID primary keys.
* Use soft delete through `deleted_at`.
* Do not physically delete business records.
* Critical business actions must create audit logs.
* Financial, inventory, payment, closing, and ERP records should not be hard deleted.

---

# 3. Core Business Hierarchy

```text
Hospital
│
│
├── Store / F&B --- inventory --- Restaurant(for show in sale UI)
│
├── Kitchen --- inventory --- Restaurant(for show in sale UI)
│
└── Restaurant
      │
      └── Counter
```

Hospital is the top-level entity.

Most business tables must contain:

```sql
hospital_id UUID NOT NULL
```

---

# 4. Organization Tables

## 4.1 hospitals

Stores hospital-level configuration.

> BA terminology note: In the Admin Portal, this master is now shown to business users as
> **Location Master**. Internally the database table and relationships remain `hospitals` /
> `hospital_id` for backward compatibility during this phase.

```sql
id UUID PRIMARY KEY
hospital_code VARCHAR(50) UNIQUE NOT NULL
hospital_name VARCHAR(255) NOT NULL
address TEXT
city VARCHAR(100)
state VARCHAR(100)
gst_applicable BOOLEAN DEFAULT TRUE
bill_prefix VARCHAR(50)
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Relationships:

```text
hospitals 1 -> many locations
hospitals 1 -> many stores
hospitals 1 -> many kitchens
hospitals 1 -> many restaurants
hospitals 1 -> many users
```

---

## 4.2 locations

Stores building, floor, area, or physical location information inside a hospital.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
location_name VARCHAR(255) NOT NULL
building VARCHAR(100)
floor VARCHAR(100)
area VARCHAR(100)
address TEXT
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Relationships:

```text
hospitals 1 -> many locations
locations 1 -> many stores
locations 1 -> many kitchens
locations 1 -> many restaurants
```

---

## 4.3 stores

Stores Store/F&B units used mainly for MRP inventory.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
location_id UUID REFERENCES locations(id)
store_code VARCHAR(50) NOT NULL
store_name VARCHAR(255) NOT NULL
store_type VARCHAR(50)
address TEXT
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL

UNIQUE(hospital_id, store_code)
```

Responsibilities:

* GRN
* Batch tracking
* Expiry tracking
* MRP stock
* Transfer to restaurant

---

## 4.4 kitchens

Stores kitchen units used for readymade production and KOT preparation.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
location_id UUID REFERENCES locations(id)
kitchen_code VARCHAR(50) NOT NULL
kitchen_name VARCHAR(255) NOT NULL
opening_time TIME
closing_time TIME
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL

UNIQUE(hospital_id, kitchen_code)
```

Responsibilities:

* Readymade production
* Kitchen stock
* KOT preparation
* Transfer to restaurant
* Day-end wastage

---

## 4.5 restaurants

Stores restaurant or cafeteria selling points.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
location_id UUID REFERENCES locations(id)
store_id UUID REFERENCES stores(id)
kitchen_id UUID REFERENCES kitchens(id)
restaurant_code VARCHAR(50) NOT NULL
restaurant_name VARCHAR(255) NOT NULL
gst_number VARCHAR(50)
pan_number VARCHAR(50)
fssai_number VARCHAR(50)
address TEXT
opening_time TIME
closing_time TIME
normal_discount_applicable BOOLEAN DEFAULT FALSE
staff_discount_applicable BOOLEAN DEFAULT FALSE
online_ordering_enabled BOOLEAN DEFAULT FALSE
in_room_dining_enabled BOOLEAN DEFAULT FALSE
b2c_qr_enabled BOOLEAN DEFAULT FALSE
upi_id VARCHAR(255)
bank_name VARCHAR(255)
bank_branch VARCHAR(255)
sun_bu VARCHAR(100)
sun_t1 VARCHAR(100)
sun_t2 VARCHAR(100)
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL

UNIQUE(hospital_id, restaurant_code)
```

Responsibilities:

* Receives MRP items from Store/F&B
* Receives Readymade items from Kitchen
* Sells MRP, Readymade, and Live items
* Performs restaurant closing

---

## 4.6 counters

Stores POS counters mapped to restaurants.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID NOT NULL REFERENCES restaurants(id)
counter_code VARCHAR(50) NOT NULL
counter_name VARCHAR(255) NOT NULL
pos_device_id VARCHAR(100)
payment_device_id VARCHAR(100)
pine_labs_device_id VARCHAR(100)
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL

UNIQUE(restaurant_id, counter_code)
```

---

# 5. Identity and Access Tables

## 5.1 users

Stores internal users.

```sql
id UUID PRIMARY KEY
employee_code VARCHAR(100)
name VARCHAR(255) NOT NULL
email VARCHAR(255)
mobile VARCHAR(20) UNIQUE NOT NULL
status VARCHAR(50) DEFAULT 'ACTIVE'
hospital_id UUID REFERENCES hospitals(id)
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Example users:

* Super Admin
* Hospital Admin
* Store Manager
* Store Receiver
* Chef
* Kitchen Operator
* Restaurant User
* POS Operator
* Supervisor
* Delivery Operator
* Finance User

---

## 5.2 roles

```sql
id UUID PRIMARY KEY
name VARCHAR(100) UNIQUE NOT NULL
description TEXT
status VARCHAR(50) DEFAULT 'ACTIVE'
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

---

## 5.3 permissions

```sql
id UUID PRIMARY KEY
code VARCHAR(100) UNIQUE NOT NULL
module VARCHAR(100) NOT NULL
action VARCHAR(100) NOT NULL
description TEXT
created_at TIMESTAMP NOT NULL
updated_at TIMESTAMP NULL
```

Permission examples:

```text
HOSPITAL_CREATE
STORE_CREATE
KITCHEN_CREATE
RESTAURANT_CREATE
ITEM_CREATE
GRN_CREATE
TRANSFER_APPROVE
POS_BILLING
CLOSING_APPROVE
ERP_POST
```

---

## 5.4 user_roles

```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL REFERENCES users(id)
role_id UUID NOT NULL REFERENCES roles(id)
created_at TIMESTAMP NOT NULL
created_by UUID NULL

UNIQUE(user_id, role_id)
```

---

## 5.5 role_permissions

```sql
id UUID PRIMARY KEY
role_id UUID NOT NULL REFERENCES roles(id)
permission_id UUID NOT NULL REFERENCES permissions(id)
created_at TIMESTAMP NOT NULL
created_by UUID NULL

UNIQUE(role_id, permission_id)
```

---

# 6. Master Tables

## 6.1 item_categories

Stores item category hierarchy.

```sql
id UUID PRIMARY KEY
category_name VARCHAR(255) NOT NULL
parent_category_id UUID REFERENCES item_categories(id)
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Examples:

```text
Packed Items / MRP
Bakery
North Indian
South Indian
Asian Food
Thali
Salad
Beverages
Snacks
Live Counter
```

---

## 6.2 items

Stores item master.

```sql
id UUID PRIMARY KEY
item_code VARCHAR(100) UNIQUE NOT NULL
item_name VARCHAR(255) NOT NULL
category_id UUID REFERENCES item_categories(id)
item_type VARCHAR(50) NOT NULL
veg_type VARCHAR(50)
base_price NUMERIC(12,2)
mrp NUMERIC(12,2)
gst_percent NUMERIC(5,2)
hsn_code VARCHAR(50)
preparation_time_minutes INTEGER
is_batch_required BOOLEAN DEFAULT FALSE
is_expiry_required BOOLEAN DEFAULT FALSE
is_discount_allowed BOOLEAN DEFAULT TRUE
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Item type values:

```text
MRP
READYMADE
LIVE
```

Veg type values:

```text
VEG
NON_VEG
EGGETARIAN
```

Rules:

* MRP items require batch and expiry.
* Readymade items require production.
* Live items require availability and KOT.

---

## 6.3 item_prices

Stores hospital/restaurant-wise price configuration.

```sql
id UUID PRIMARY KEY
item_id UUID NOT NULL REFERENCES items(id)
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID REFERENCES restaurants(id)
rate_type VARCHAR(50) NOT NULL
price NUMERIC(12,2) NOT NULL
effective_from DATE
effective_to DATE
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Rate type values:

```text
NORMAL
STAFF
ROOM
COUNTER
```

---

## 6.4 time_slots

Stores meal timing configuration.

```sql
id UUID PRIMARY KEY
slot_name VARCHAR(100) NOT NULL
start_time TIME
end_time TIME
is_always_available BOOLEAN DEFAULT FALSE
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Examples:

```text
Breakfast
Lunch
Dinner
Always Available
```

---

## 6.5 item_time_mappings

Maps item visibility to time slots and restaurants.

```sql
id UUID PRIMARY KEY
item_id UUID NOT NULL REFERENCES items(id)
restaurant_id UUID NOT NULL REFERENCES restaurants(id)
time_slot_id UUID REFERENCES time_slots(id)
days_of_week VARCHAR(100)
is_always_available BOOLEAN DEFAULT FALSE
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Example `days_of_week`:

```text
MON,TUE,WED,THU,FRI,SAT,SUN
```

---

## 6.6 restaurant_menus

Maps items to restaurants.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID NOT NULL REFERENCES restaurants(id)
item_id UUID NOT NULL REFERENCES items(id)
is_available BOOLEAN DEFAULT TRUE
display_order INTEGER
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL

UNIQUE(restaurant_id, item_id)
```

---

## 6.7 employees

Stores employee validation data for staff discounts.

```sql
id UUID PRIMARY KEY
hospital_id UUID REFERENCES hospitals(id)
employee_code VARCHAR(100) UNIQUE NOT NULL
employee_name VARCHAR(255) NOT NULL
department VARCHAR(255)
designation VARCHAR(255)
mobile VARCHAR(20)
email VARCHAR(255)
eligible_for_discount BOOLEAN DEFAULT TRUE
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

---

## 6.8 discount_rules

Stores normal and staff discount configuration.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID REFERENCES restaurants(id)
discount_name VARCHAR(255) NOT NULL
discount_type VARCHAR(100) NOT NULL
customer_type VARCHAR(100)
rate_type VARCHAR(50)
discount_percent NUMERIC(5,2)
discount_amount NUMERIC(12,2)
is_employee_validation_required BOOLEAN DEFAULT FALSE
effective_from DATE
effective_to DATE
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Discount type values:

```text
NORMAL_CUSTOMER_DISCOUNT
STAFF_DISCOUNT
ITEM_DISCOUNT
CATEGORY_DISCOUNT
EVENT_DISCOUNT
```

---

## 6.9 discount_approvals

Stores approval requests for manual or exceptional discounts.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID REFERENCES restaurants(id)
order_id UUID NULL
discount_rule_id UUID REFERENCES discount_rules(id)
requested_by UUID REFERENCES users(id)
approved_by UUID REFERENCES users(id)
approval_status VARCHAR(50) NOT NULL
reason TEXT
approved_amount NUMERIC(12,2)
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Approval status values:

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

---

## 6.10 payment_gateways

Stores payment gateway configuration.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID REFERENCES restaurants(id)
gateway_name VARCHAR(100) NOT NULL
gateway_type VARCHAR(100) NOT NULL
merchant_id VARCHAR(255)
terminal_id VARCHAR(255)
upi_id VARCHAR(255)
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Gateway type values:

```text
PINE_LABS
RAZORPAY
PAYU
CASH
CARD
UPI
```

---

## 6.11 vendors

Stores vendor master.

```sql
id UUID PRIMARY KEY
vendor_code VARCHAR(100) UNIQUE NOT NULL
vendor_name VARCHAR(255) NOT NULL
gst_number VARCHAR(50)
contact_person VARCHAR(255)
mobile VARCHAR(20)
email VARCHAR(255)
address TEXT
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

---

# 7. Procurement and GRN Tables

## 7.1 indents

Stores indent headers.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
store_id UUID NOT NULL REFERENCES stores(id)
indent_number VARCHAR(100) UNIQUE NOT NULL
indent_date DATE NOT NULL
requested_by UUID REFERENCES users(id)
status VARCHAR(50) NOT NULL
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Indent status values:

```text
DRAFT
SUBMITTED
APPROVED
REJECTED
CONVERTED_TO_PO
CANCELLED
```

---

## 7.2 indent_lines

Stores indent line items.

```sql
id UUID PRIMARY KEY
indent_id UUID NOT NULL REFERENCES indents(id)
item_id UUID NOT NULL REFERENCES items(id)
requested_qty NUMERIC(12,3) NOT NULL
approved_qty NUMERIC(12,3)
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

---

## 7.3 purchase_orders

Stores purchase order references.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
store_id UUID NOT NULL REFERENCES stores(id)
vendor_id UUID REFERENCES vendors(id)
po_number VARCHAR(100) UNIQUE NOT NULL
po_date DATE NOT NULL
status VARCHAR(50) NOT NULL
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

PO status values:

```text
DRAFT
SENT_TO_VENDOR
PARTIALLY_RECEIVED
FULLY_RECEIVED
CLOSED
CANCELLED
```

---

## 7.4 purchase_order_lines

Stores purchase order line items.

```sql
id UUID PRIMARY KEY
po_id UUID NOT NULL REFERENCES purchase_orders(id)
item_id UUID NOT NULL REFERENCES items(id)
ordered_qty NUMERIC(12,3) NOT NULL
rate NUMERIC(12,2)
gst_percent NUMERIC(5,2)
expected_delivery_date DATE
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

---

## 7.5 grns

Stores GRN headers.

```sql
id UUID PRIMARY KEY
grn_number VARCHAR(100) UNIQUE NOT NULL
hospital_id UUID NOT NULL REFERENCES hospitals(id)
store_id UUID NOT NULL REFERENCES stores(id)
po_id UUID REFERENCES purchase_orders(id)
vendor_id UUID REFERENCES vendors(id)
received_date TIMESTAMP NOT NULL
received_by UUID REFERENCES users(id)
status VARCHAR(50) NOT NULL
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

GRN status values:

```text
DRAFT
UNDER_VERIFICATION
PARTIALLY_ACCEPTED
ACCEPTED
REJECTED
POSTED_TO_STOCK
CANCELLED
```

---

## 7.6 grn_lines

Stores GRN item lines.

```sql
id UUID PRIMARY KEY
grn_id UUID NOT NULL REFERENCES grns(id)
item_id UUID NOT NULL REFERENCES items(id)
ordered_qty NUMERIC(12,3)
received_qty NUMERIC(12,3) NOT NULL
accepted_qty NUMERIC(12,3) NOT NULL
rejected_qty NUMERIC(12,3) DEFAULT 0
rejection_reason TEXT
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Validation:

```text
accepted_qty + rejected_qty = received_qty
```

---

## 7.7 grn_batches

Stores batch and expiry details for MRP items.

```sql
id UUID PRIMARY KEY
grn_line_id UUID NOT NULL REFERENCES grn_lines(id)
item_id UUID NOT NULL REFERENCES items(id)
batch_number VARCHAR(100) NOT NULL
expiry_date DATE NOT NULL
manufacturing_date DATE
received_qty NUMERIC(12,3) NOT NULL
accepted_qty NUMERIC(12,3) NOT NULL
rejected_qty NUMERIC(12,3) DEFAULT 0
rejection_reason TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Rules:

* Batch number is mandatory for MRP items.
* Expiry date is mandatory for MRP items.
* One GRN line can have multiple batches.
* Expired stock should not be accepted.


# 8. Inventory Tables

AAHAR shall use a single inventory engine for Store, Kitchen, Restaurant, and Counter stock.

Inventory shall be maintained using:

```text
Stock Ledger = transaction history
Stock Balance = current available quantity
```

Rule:

```text
Never update stock balance without creating stock ledger.
```

---

## 8.1 stock_ledgers

This is the most important inventory audit table.

Every stock movement must create a stock ledger entry.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
location_type VARCHAR(50) NOT NULL
location_id UUID NOT NULL
item_id UUID NOT NULL REFERENCES items(id)
item_type VARCHAR(50) NOT NULL
batch_number VARCHAR(100)
expiry_date DATE
transaction_type VARCHAR(100) NOT NULL
reference_type VARCHAR(100)
reference_id UUID
qty_in NUMERIC(12,3) DEFAULT 0
qty_out NUMERIC(12,3) DEFAULT 0
balance_after NUMERIC(12,3)
business_date DATE NOT NULL
transaction_datetime TIMESTAMP NOT NULL
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Location type values:

```text
STORE
KITCHEN
RESTAURANT
COUNTER
```

Transaction type values:

```text
GRN_IN
STORE_TO_RESTAURANT_OUT
RESTAURANT_RECEIVE_IN
KITCHEN_PRODUCTION_IN
KITCHEN_TO_RESTAURANT_OUT
SALE_OUT
RETURN_TO_KITCHEN_IN
RETURN_TO_STORE_IN
WASTAGE_OUT
ADJUSTMENT_IN
ADJUSTMENT_OUT
TRANSFER_IN_TRANSIT_OUT
TRANSFER_REJECTED_RETURN_IN
```

Reference type values:

```text
GRN
PRODUCTION
TRANSFER
ACKNOWLEDGEMENT
ORDER
CLOSING
WASTAGE
ADJUSTMENT
```

Rules:

* Every GRN posting creates `GRN_IN`.
* Every kitchen production posting creates `KITCHEN_PRODUCTION_IN`.
* Every transfer dispatch creates stock out from source.
* Every restaurant acknowledgement creates stock in for accepted quantity.
* Every sale creates `SALE_OUT`.
* Every wastage creates `WASTAGE_OUT`.
* MRP stock must include batch number and expiry date.
* Readymade stock may not require batch or expiry.
* Live items generally do not create finished stock ledger in Phase 1.

---

## 8.2 stock_balances

Stores current stock balance.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
location_type VARCHAR(50) NOT NULL
location_id UUID NOT NULL
item_id UUID NOT NULL REFERENCES items(id)
item_type VARCHAR(50) NOT NULL
batch_number VARCHAR(100)
expiry_date DATE
available_qty NUMERIC(12,3) DEFAULT 0
reserved_qty NUMERIC(12,3) DEFAULT 0
last_updated_on TIMESTAMP NOT NULL
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Recommended uniqueness:

```sql
UNIQUE(hospital_id, location_type, location_id, item_id, batch_number, expiry_date)
```

Rules:

* `available_qty` is the quantity available for sale or transfer.
* `reserved_qty` is used when order/payment is pending.
* For MRP items, stock balance should be batch-wise and expiry-wise.
* For Readymade items, stock balance should be business-date aware through stock ledger and closing logic.
* For Live items, stock balance may not be required in Phase 1.

---

## 8.3 stock_reservations

Used to prevent overselling when an order is created but payment or confirmation is still pending.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID REFERENCES restaurants(id)
counter_id UUID REFERENCES counters(id)
order_id UUID NULL
item_id UUID NOT NULL REFERENCES items(id)
batch_number VARCHAR(100)
expiry_date DATE
reserved_qty NUMERIC(12,3) NOT NULL
reservation_status VARCHAR(50) NOT NULL
expires_at TIMESTAMP
business_date DATE NOT NULL
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Reservation status values:

```text
ACTIVE
RELEASED
CONSUMED
EXPIRED
CANCELLED
```

Rules:

* Reservation is created when stock is held for an order.
* Reservation is consumed when payment/order is confirmed.
* Reservation is released if payment fails or order is cancelled.
* Reservation expires automatically after configured time.
* This prevents double-selling during QR or online payment flows.

---

## 8.4 stock_adjustments

Used for manual stock correction.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
location_type VARCHAR(50) NOT NULL
location_id UUID NOT NULL
item_id UUID NOT NULL REFERENCES items(id)
batch_number VARCHAR(100)
expiry_date DATE
adjustment_type VARCHAR(50) NOT NULL
quantity NUMERIC(12,3) NOT NULL
reason VARCHAR(255) NOT NULL
remarks TEXT
status VARCHAR(50) NOT NULL
approved_by UUID REFERENCES users(id)
business_date DATE NOT NULL
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Adjustment type values:

```text
INCREASE
DECREASE
```

Status values:

```text
DRAFT
SUBMITTED
APPROVED
REJECTED
POSTED
CANCELLED
```

Rules:

* Approved adjustment must create stock ledger entry.
* Stock adjustment must be audited.
* High-value adjustments may require supervisor approval.

---

# 9. Kitchen Production Tables

Kitchen production is used for Readymade items.

Examples:

```text
Samosa
Pakora
Sandwich
Poha
Cutlet
Prepared meals
```

Readymade production creates kitchen stock.

---

## 9.1 kitchen_productions

Stores kitchen production header.

```sql
id UUID PRIMARY KEY
production_number VARCHAR(100) UNIQUE NOT NULL
hospital_id UUID NOT NULL REFERENCES hospitals(id)
kitchen_id UUID NOT NULL REFERENCES kitchens(id)
production_date DATE NOT NULL
business_date DATE NOT NULL
chef_user_id UUID REFERENCES users(id)
status VARCHAR(50) NOT NULL
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Production status values:

```text
DRAFT
POSTED
DISTRIBUTED
CLOSED
CANCELLED
```

Rules:

* Production can only be created for Readymade items.
* Chef selects item from Item Master.
* Chef should not manually create item names.
* Once production is posted, kitchen stock increases.
* Posting creates stock ledger entry as `KITCHEN_PRODUCTION_IN`.

---

## 9.2 kitchen_production_lines

Stores production item details.

```sql
id UUID PRIMARY KEY
production_id UUID NOT NULL REFERENCES kitchen_productions(id)
item_id UUID NOT NULL REFERENCES items(id)
produced_qty NUMERIC(12,3) NOT NULL
accepted_qty NUMERIC(12,3)
wastage_qty NUMERIC(12,3) DEFAULT 0
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Rules:

* `produced_qty` must be greater than zero.
* Item type must be `READYMADE`.
* Posted production must update `stock_ledgers` and `stock_balances`.
* Wastage during production should be tracked separately if required.

---

# 10. Distribution and Transfer Tables

AAHAR supports two primary transfer flows:

```text
Store/F&B → Restaurant
Kitchen → Restaurant
```

It also supports return flows:

```text
Restaurant → Store
Restaurant → Kitchen
```

Restaurant stock must increase only after acknowledgement.

---

## 10.1 transfers

Stores transfer header.

```sql
id UUID PRIMARY KEY
transfer_number VARCHAR(100) UNIQUE NOT NULL
hospital_id UUID NOT NULL REFERENCES hospitals(id)
source_type VARCHAR(50) NOT NULL
source_id UUID NOT NULL
destination_type VARCHAR(50) NOT NULL
destination_id UUID NOT NULL
transfer_type VARCHAR(100) NOT NULL
transfer_datetime TIMESTAMP NOT NULL
business_date DATE NOT NULL
status VARCHAR(50) NOT NULL
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Source type values:

```text
STORE
KITCHEN
RESTAURANT
COUNTER
```

Destination type values:

```text
STORE
KITCHEN
RESTAURANT
COUNTER
```

Transfer type values:

```text
STORE_TO_RESTAURANT
KITCHEN_TO_RESTAURANT
RESTAURANT_TO_STORE_RETURN
RESTAURANT_TO_KITCHEN_RETURN
RESTAURANT_TO_COUNTER
COUNTER_TO_RESTAURANT_RETURN
```

Transfer status values:

```text
DRAFT
DISPATCHED
PENDING_ACKNOWLEDGEMENT
PARTIALLY_ACCEPTED
ACCEPTED
REJECTED
CLOSED
CANCELLED
```

Rules:

* Every transfer must have a unique transfer number.
* Dispatch moves stock out from source.
* Destination stock does not increase until acknowledgement.
* Rejected quantity must be returned to source.
* Every transfer must be auditable.

---

## 10.2 transfer_lines

Stores transfer item details.

```sql
id UUID PRIMARY KEY
transfer_id UUID NOT NULL REFERENCES transfers(id)
item_id UUID NOT NULL REFERENCES items(id)
item_type VARCHAR(50) NOT NULL
batch_number VARCHAR(100)
expiry_date DATE
sent_qty NUMERIC(12,3) NOT NULL
accepted_qty NUMERIC(12,3) DEFAULT 0
rejected_qty NUMERIC(12,3) DEFAULT 0
rejection_reason TEXT
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Rules:

* MRP transfer should include batch number and expiry date.
* Readymade transfer may not require batch number.
* `accepted_qty + rejected_qty` must not exceed `sent_qty`.
* Source stock reduces when transfer is dispatched.
* Destination stock increases only after acknowledgement.

---

## 10.3 transfer_acknowledgements

Stores acknowledgement header.

```sql
id UUID PRIMARY KEY
transfer_id UUID NOT NULL REFERENCES transfers(id)
hospital_id UUID NOT NULL REFERENCES hospitals(id)
acknowledgement_number VARCHAR(100) UNIQUE NOT NULL
acknowledged_by UUID REFERENCES users(id)
acknowledged_at TIMESTAMP
status VARCHAR(50) NOT NULL
remarks TEXT
proof_attachment_url TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Acknowledgement status values:

```text
PENDING
ACCEPTED
PARTIALLY_ACCEPTED
REJECTED
CANCELLED
```

Rules:

* Restaurant user must acknowledge received items.
* Acknowledgement can accept full quantity, accept partial quantity, or reject full quantity.
* Proof upload is optional in Phase 1, but should be supported by design.
* Acknowledgement creates stock ledger entry for accepted quantity.

---

## 10.4 transfer_acknowledgement_lines

Stores acknowledgement item details.

```sql
id UUID PRIMARY KEY
acknowledgement_id UUID NOT NULL REFERENCES transfer_acknowledgements(id)
transfer_line_id UUID NOT NULL REFERENCES transfer_lines(id)
item_id UUID NOT NULL REFERENCES items(id)
batch_number VARCHAR(100)
expiry_date DATE
sent_qty NUMERIC(12,3) NOT NULL
accepted_qty NUMERIC(12,3) NOT NULL
rejected_qty NUMERIC(12,3) DEFAULT 0
rejection_reason TEXT
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Validation:

```text
accepted_qty + rejected_qty = sent_qty
```

Rules:

* Accepted quantity increases destination stock.
* Rejected quantity is returned to source or marked for correction.
* Every accepted/rejected quantity must be traceable.

---

# 11. Restaurant Stock Availability Logic

Restaurant UI should show sellable items from:

```text
MRP stock
Readymade stock
Live menu availability
```

For MRP and Readymade items:

```text
Show item only if available_qty > 0
```

For Live items:

```text
Show item if active, mapped to restaurant, and current time/day is valid
```

---

## 11.1 Availability Rules

When showing menu or POS items, system must check:

```text
Restaurant is active
Item is active
Item is mapped to restaurant
Current day is allowed
Current time is within item time slot
Stock > 0 for MRP/Readymade
Live item is available
Correct rate type is selected
Discount rule is applicable
```

---

## 11.2 FEFO Rule for MRP Items

For MRP sale or transfer, system should pick stock using:

```text
First Expiry First Out
```

Rules:

* Use earliest expiry stock first.
* Do not allow expired batch to be sold.
* Near-expiry warning should be configurable.
* Supervisor approval may be required for near-expiry movement.

---

## 11.3 Readymade Stock Rule

Readymade stock is daily stock.

Rules:

* Readymade stock should not carry forward indefinitely.
* Day-end process must return, redistribute, or mark remaining stock as wastage.
* Business date must be used for reporting and closing.
* Old business date readymade stock should be zeroed through wastage process.

---

## 11.4 Live Item Rule

Live items are made on demand.

Rules:

* No finished stock deduction required in Phase 1.
* KOT is required.
* Preparation time applies.
* Menu availability and time slot control visibility.


# 12. Order Management Tables

AAHAR shall use one common order engine for all order channels.

Supported channels:

* Room Call
* Room QR
* Counter POS
* Table QR
* Employee Mobile
* Employee QR
* Employee Counter

Rule:

```text
Do not create separate hardcoded order engines for different order channels.
Use one common order model with OrderSource.
```

---

## 12.1 orders

Stores order header.

```sql
id UUID PRIMARY KEY
order_number VARCHAR(100) UNIQUE NOT NULL
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID NOT NULL REFERENCES restaurants(id)
counter_id UUID REFERENCES counters(id)
kitchen_id UUID REFERENCES kitchens(id)
order_source VARCHAR(100) NOT NULL
customer_type VARCHAR(100)
customer_name VARCHAR(255)
mobile_number VARCHAR(20)
employee_id UUID REFERENCES employees(id)
room_number VARCHAR(50)
bed_number VARCHAR(50)
table_number VARCHAR(50)
rate_type VARCHAR(50) NOT NULL
delivery_type VARCHAR(100)
order_status VARCHAR(100) NOT NULL
business_date DATE NOT NULL
order_datetime TIMESTAMP NOT NULL
special_instruction TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Order source values:

```text
ROOM_CALL
ROOM_QR
COUNTER_POS
TABLE_QR
EMPLOYEE_MOBILE
EMPLOYEE_QR
EMPLOYEE_COUNTER
```

Customer type values:

```text
PATIENT
ATTENDANT
VISITOR
EMPLOYEE
STAFF
CUSTOMER
```

Rate type values:

```text
NORMAL
STAFF
ROOM
COUNTER
```

Delivery type values:

```text
ROOM_DELIVERY
TABLE_SERVICE
COUNTER_PICKUP
EMPLOYEE_DELIVERY
NO_DELIVERY
```

Order status values:

```text
DRAFT
PAYMENT_PENDING
PAYMENT_COMPLETED
CONFIRMED
INVOICE_GENERATED
KOT_GENERATED
KITCHEN_ACCEPTED
PREPARING
READY
DISPATCHED
DELIVERED
COMPLETED
CANCELLED
REFUNDED
```

---

## 12.2 order_lines

Stores order item details.

```sql
id UUID PRIMARY KEY
order_id UUID NOT NULL REFERENCES orders(id)
item_id UUID NOT NULL REFERENCES items(id)
item_type VARCHAR(50) NOT NULL
quantity NUMERIC(12,3) NOT NULL
unit_price NUMERIC(12,2) NOT NULL
gross_amount NUMERIC(12,2) NOT NULL
discount_amount NUMERIC(12,2) DEFAULT 0
gst_percent NUMERIC(5,2)
gst_amount NUMERIC(12,2) DEFAULT 0
net_amount NUMERIC(12,2) NOT NULL
preparation_time_minutes INTEGER
requires_kot BOOLEAN DEFAULT FALSE
batch_number VARCHAR(100)
expiry_date DATE
special_instruction TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Rules:

* MRP items usually do not require KOT.
* Readymade items may require serving/packing ticket.
* Live items require KOT.
* MRP sale must deduct stock using FEFO.
* MRP and Readymade items cannot be sold if stock is zero.
* Live items are controlled by menu availability and preparation time.

---

## 12.3 order_status_history

Stores order status changes.

```sql
id UUID PRIMARY KEY
order_id UUID NOT NULL REFERENCES orders(id)
old_status VARCHAR(100)
new_status VARCHAR(100) NOT NULL
changed_by UUID REFERENCES users(id)
changed_at TIMESTAMP NOT NULL
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Rules:

* Every important order status change must be logged.
* Cancellation and refund must be auditable.

---

# 13. Invoice and Billing Tables

## 13.1 invoices

Stores invoice headers.

```sql
id UUID PRIMARY KEY
invoice_number VARCHAR(100) UNIQUE NOT NULL
order_id UUID NOT NULL REFERENCES orders(id)
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID NOT NULL REFERENCES restaurants(id)
counter_id UUID REFERENCES counters(id)
gross_amount NUMERIC(12,2) NOT NULL
discount_amount NUMERIC(12,2) DEFAULT 0
gst_amount NUMERIC(12,2) DEFAULT 0
net_amount NUMERIC(12,2) NOT NULL
round_off_amount NUMERIC(12,2) DEFAULT 0
invoice_datetime TIMESTAMP NOT NULL
business_date DATE NOT NULL
invoice_status VARCHAR(50) NOT NULL
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Invoice status values:

```text
GENERATED
CANCELLED
REFUNDED
POSTED_TO_ERP
```

---

## 13.2 invoice_lines

Stores invoice item-level details.

```sql
id UUID PRIMARY KEY
invoice_id UUID NOT NULL REFERENCES invoices(id)
order_line_id UUID REFERENCES order_lines(id)
item_id UUID NOT NULL REFERENCES items(id)
quantity NUMERIC(12,3) NOT NULL
unit_price NUMERIC(12,2) NOT NULL
gross_amount NUMERIC(12,2) NOT NULL
discount_amount NUMERIC(12,2) DEFAULT 0
gst_percent NUMERIC(5,2)
gst_amount NUMERIC(12,2) DEFAULT 0
net_amount NUMERIC(12,2) NOT NULL
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

---

# 14. Payment Tables

Payment handling must be safe against duplicate deduction, network failure, and duplicate callbacks.

Core rule:

```text
One active payment attempt per order.
```

---

## 14.1 payments

Stores final payment records.

```sql
id UUID PRIMARY KEY
order_id UUID NOT NULL REFERENCES orders(id)
invoice_id UUID REFERENCES invoices(id)
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID NOT NULL REFERENCES restaurants(id)
payment_mode VARCHAR(100) NOT NULL
gateway_name VARCHAR(100)
transaction_reference VARCHAR(255)
amount NUMERIC(12,2) NOT NULL
payment_status VARCHAR(50) NOT NULL
payment_datetime TIMESTAMP
reconciliation_status VARCHAR(50) NOT NULL
business_date DATE NOT NULL
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Payment mode values:

```text
CASH
CARD
UPI
PINE_LABS
PAYU
RAZORPAY
COMPLIMENTARY
```

Payment status values:

```text
INITIATED
PENDING
SUCCESS
FAILED
CANCELLED
REFUNDED
```

Reconciliation status values:

```text
NOT_REQUIRED
PENDING
MATCHED
MISMATCHED
RESOLVED
```

---

## 14.2 payment_attempts

Stores payment attempt lifecycle.

```sql
id UUID PRIMARY KEY
payment_attempt_number VARCHAR(100) UNIQUE NOT NULL
order_id UUID NOT NULL REFERENCES orders(id)
invoice_id UUID REFERENCES invoices(id)
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID NOT NULL REFERENCES restaurants(id)
payment_mode VARCHAR(100) NOT NULL
gateway_name VARCHAR(100)
idempotency_key VARCHAR(255) UNIQUE NOT NULL
amount NUMERIC(12,2) NOT NULL
attempt_status VARCHAR(50) NOT NULL
gateway_reference VARCHAR(255)
expires_at TIMESTAMP
business_date DATE NOT NULL
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Attempt status values:

```text
CREATED
INITIATED
PENDING
SUCCESS
FAILED
EXPIRED
CANCELLED
```

Rules:

* One active payment attempt per order.
* If an active attempt exists, return the same attempt instead of creating a new one.
* If payment status is success, block duplicate payment.
* Use idempotency key for gateway calls whenever supported.
* Payment verification must happen server-side.

---

## 14.3 payment_events

Stores raw gateway events and callbacks.

```sql
id UUID PRIMARY KEY
payment_attempt_id UUID REFERENCES payment_attempts(id)
payment_id UUID REFERENCES payments(id)
order_id UUID REFERENCES orders(id)
gateway_name VARCHAR(100)
gateway_reference VARCHAR(255)
event_type VARCHAR(100)
event_payload JSONB
event_status VARCHAR(50)
received_at TIMESTAMP NOT NULL
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Rules:

* Duplicate callbacks must not create duplicate payments.
* Callback amount must match order amount.
* Gateway success must be verified server-side.
* Suspicious callbacks must be flagged for reconciliation.

---

## 14.4 refunds

Stores refund records.

```sql
id UUID PRIMARY KEY
refund_number VARCHAR(100) UNIQUE NOT NULL
payment_id UUID NOT NULL REFERENCES payments(id)
order_id UUID NOT NULL REFERENCES orders(id)
invoice_id UUID REFERENCES invoices(id)
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID NOT NULL REFERENCES restaurants(id)
refund_amount NUMERIC(12,2) NOT NULL
refund_reason TEXT
refund_status VARCHAR(50) NOT NULL
gateway_reference VARCHAR(255)
approved_by UUID REFERENCES users(id)
business_date DATE NOT NULL
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Refund status values:

```text
REQUESTED
APPROVED
REJECTED
PROCESSING
SUCCESS
FAILED
CANCELLED
```

---

# 15. KOT Tables

KOT means Kitchen Order Ticket.

KOT is generated for items requiring kitchen preparation.

---

## 15.1 kots

Stores KOT header.

```sql
id UUID PRIMARY KEY
kot_number VARCHAR(100) UNIQUE NOT NULL
order_id UUID NOT NULL REFERENCES orders(id)
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID NOT NULL REFERENCES restaurants(id)
kitchen_id UUID NOT NULL REFERENCES kitchens(id)
kot_status VARCHAR(100) NOT NULL
created_on TIMESTAMP NOT NULL
accepted_on TIMESTAMP
ready_on TIMESTAMP
dispatched_on TIMESTAMP
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

KOT status values:

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

## 15.2 kot_lines

Stores KOT item details.

```sql
id UUID PRIMARY KEY
kot_id UUID NOT NULL REFERENCES kots(id)
order_line_id UUID REFERENCES order_lines(id)
item_id UUID NOT NULL REFERENCES items(id)
quantity NUMERIC(12,3) NOT NULL
special_instruction TEXT
preparation_time_minutes INTEGER
line_status VARCHAR(100) NOT NULL
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Line status values:

```text
GENERATED
ACCEPTED
PREPARING
READY
CANCELLED
```

Kitchen dashboard should show:

* KOT Number
* Order Number
* Restaurant
* Room / Table / Counter
* Item
* Quantity
* Preparation Time
* Special Instruction
* Payment Status
* Priority

---

# 16. Delivery Tables

## 16.1 deliveries

Stores delivery assignments and status.

```sql
id UUID PRIMARY KEY
delivery_number VARCHAR(100) UNIQUE NOT NULL
order_id UUID NOT NULL REFERENCES orders(id)
kot_id UUID REFERENCES kots(id)
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID NOT NULL REFERENCES restaurants(id)
supervisor_id UUID REFERENCES users(id)
delivery_operator_id UUID REFERENCES users(id)
delivery_type VARCHAR(100)
pickup_time TIMESTAMP
delivery_time TIMESTAMP
delivery_status VARCHAR(100) NOT NULL
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Delivery status values:

```text
PENDING_ASSIGNMENT
ASSIGNED
PICKED_UP
OUT_FOR_DELIVERY
DELIVERED
FAILED
CANCELLED
```

Rules:

* Room order should require supervisor assignment.
* Counter pickup may not require delivery operator.
* Delivery status must be auditable.

---

# 17. Restaurant Closing Tables

Restaurant closing reconciles sales, payments, stock, wastage, and returns.

---

## 17.1 restaurant_closings

Stores restaurant closing header.

```sql
id UUID PRIMARY KEY
closing_number VARCHAR(100) UNIQUE NOT NULL
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID NOT NULL REFERENCES restaurants(id)
business_date DATE NOT NULL
opened_on TIMESTAMP
closed_on TIMESTAMP
submitted_by UUID REFERENCES users(id)
supervisor_id UUID REFERENCES users(id)
expected_sale_amount NUMERIC(12,2) DEFAULT 0
actual_collection_amount NUMERIC(12,2) DEFAULT 0
difference_amount NUMERIC(12,2) DEFAULT 0
closing_status VARCHAR(100) NOT NULL
remarks TEXT
proof_attachment_url TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Closing status values:

```text
DRAFT
SUBMITTED
MATCHED
MISMATCH
PENDING_SUPERVISOR_APPROVAL
APPROVED
APPROVED_WITH_DIFFERENCE
REJECTED
CORRECTION_REQUIRED
POSTED_TO_ERP
```

Formula:

```text
Expected Sale Amount = Total invoice value of sold items
Actual Collection Amount = Cash + Card + UPI + Pine Labs + PayU + Razorpay
Difference = Expected Sale Amount - Actual Collection Amount
```

Rules:

* If difference is not zero, supervisor approval is mandatory.
* Closing must be locked after approval.
* ERP posting happens only after final approval.

---

## 17.2 closing_payment_summaries

Stores payment-mode-wise closing summary.

```sql
id UUID PRIMARY KEY
closing_id UUID NOT NULL REFERENCES restaurant_closings(id)
payment_mode VARCHAR(100) NOT NULL
system_amount NUMERIC(12,2) DEFAULT 0
declared_amount NUMERIC(12,2) DEFAULT 0
difference_amount NUMERIC(12,2) DEFAULT 0
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Payment modes:

```text
CASH
CARD
UPI
PINE_LABS
PAYU
RAZORPAY
COMPLIMENTARY
```

---

## 17.3 closing_item_summaries

Stores item-wise closing summary.

```sql
id UUID PRIMARY KEY
closing_id UUID NOT NULL REFERENCES restaurant_closings(id)
item_id UUID NOT NULL REFERENCES items(id)
item_type VARCHAR(50) NOT NULL
opening_qty NUMERIC(12,3) DEFAULT 0
received_qty NUMERIC(12,3) DEFAULT 0
sold_qty NUMERIC(12,3) DEFAULT 0
wastage_qty NUMERIC(12,3) DEFAULT 0
returned_qty NUMERIC(12,3) DEFAULT 0
closing_qty NUMERIC(12,3) DEFAULT 0
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Stock formula:

```text
Opening Stock
+ Accepted Transfers
- Sold Quantity
- Wastage Quantity
- Returned Quantity
= Closing Stock
```

---

## 17.4 supervisor_approvals

Stores supervisor approvals for closing, wastage, discount, and other exceptions.

```sql
id UUID PRIMARY KEY
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID REFERENCES restaurants(id)
approval_type VARCHAR(100) NOT NULL
reference_type VARCHAR(100) NOT NULL
reference_id UUID NOT NULL
requested_by UUID REFERENCES users(id)
approved_by UUID REFERENCES users(id)
approval_status VARCHAR(50) NOT NULL
reason TEXT
remarks TEXT
proof_attachment_url TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Approval type values:

```text
CLOSING_MISMATCH
WASTAGE
DISCOUNT_EXCEPTION
COMPLIMENTARY_ORDER
STOCK_ADJUSTMENT
PAYMENT_MISMATCH
```

Approval status values:

```text
PENDING
APPROVED
REJECTED
CORRECTION_REQUIRED
ESCALATED
CANCELLED
```

---

# 18. Wastage Tables

Wastage applies to:

* Breakage
* Expired stock
* Day-end readymade wastage
* Spoiled items
* Customer returns
* Manual adjustments

---

## 18.1 wastages

Stores wastage header.

```sql
id UUID PRIMARY KEY
wastage_number VARCHAR(100) UNIQUE NOT NULL
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID REFERENCES restaurants(id)
kitchen_id UUID REFERENCES kitchens(id)
business_date DATE NOT NULL
wastage_type VARCHAR(100) NOT NULL
status VARCHAR(50) NOT NULL
supervisor_id UUID REFERENCES users(id)
remarks TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Wastage type values:

```text
BREAKAGE
EXPIRED
DAY_END_READYMADE
SPOILED
CUSTOMER_RETURN
MANUAL_ADJUSTMENT
```

Wastage status values:

```text
DRAFT
SUBMITTED
APPROVED
REJECTED
POSTED
CANCELLED
```

Rules:

* Approved wastage must create stock ledger entry as `WASTAGE_OUT`.
* Day-end readymade wastage requires supervisor acknowledgement.
* Expired MRP stock should be traceable by batch and expiry.

---

## 18.2 wastage_lines

Stores wastage item details.

```sql
id UUID PRIMARY KEY
wastage_id UUID NOT NULL REFERENCES wastages(id)
item_id UUID NOT NULL REFERENCES items(id)
item_type VARCHAR(50) NOT NULL
batch_number VARCHAR(100)
expiry_date DATE
quantity NUMERIC(12,3) NOT NULL
value NUMERIC(12,2)
reason TEXT
proof_attachment_url TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

---

# 19. ERP / SUN Tables

ERP/SUN should receive only approved, final, reconciled, and non-duplicate transactions.

---

## 19.1 erp_exports

Stores ERP posting records.

```sql
id UUID PRIMARY KEY
erp_export_number VARCHAR(100) UNIQUE NOT NULL
hospital_id UUID NOT NULL REFERENCES hospitals(id)
restaurant_id UUID REFERENCES restaurants(id)
business_date DATE NOT NULL
reference_type VARCHAR(100) NOT NULL
reference_id UUID NOT NULL
posting_type VARCHAR(100) NOT NULL
payload JSONB NOT NULL
posting_status VARCHAR(100) NOT NULL
attempt_count INTEGER DEFAULT 0
last_attempt_on TIMESTAMP
posted_on TIMESTAMP
error_message TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Posting type values:

```text
SALES
PAYMENT
DISCOUNT
WASTAGE
CLOSING
REFUND
ADJUSTMENT
```

Posting status values:

```text
NOT_READY
READY_TO_POST
POSTED
FAILED
RETRY_PENDING
CANCELLED
```

Rules:

Do not post:

* Failed payment orders
* Cancelled orders
* Unapproved closing mismatch
* Unapproved wastage
* Duplicate transactions

---

## 19.2 erp_export_attempts

Stores ERP posting attempts.

```sql
id UUID PRIMARY KEY
erp_export_id UUID NOT NULL REFERENCES erp_exports(id)
attempt_number INTEGER NOT NULL
request_payload JSONB
response_payload JSONB
status VARCHAR(100) NOT NULL
attempted_at TIMESTAMP NOT NULL
error_message TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

---

# 20. Audit and Logging Tables

## 20.1 audit_logs

Stores audit trail.

```sql
id UUID PRIMARY KEY
hospital_id UUID REFERENCES hospitals(id)
user_id UUID REFERENCES users(id)
entity_name VARCHAR(100) NOT NULL
entity_id UUID
action VARCHAR(100) NOT NULL
old_value JSONB
new_value JSONB
ip_address VARCHAR(100)
request_id VARCHAR(100)
user_agent TEXT
created_at TIMESTAMP NOT NULL
created_by UUID NULL
```

Audit required for:

* Login
* Logout
* User changes
* Role changes
* Permission changes
* Hospital setup
* Store setup
* Kitchen setup
* Restaurant setup
* Item changes
* GRN posting
* Stock adjustment
* Transfer acknowledgement
* Order cancellation
* Refund
* Closing approval
* Wastage approval
* ERP posting

---

## 20.2 notifications

Stores user/system notifications.

```sql
id UUID PRIMARY KEY
hospital_id UUID REFERENCES hospitals(id)
user_id UUID REFERENCES users(id)
notification_type VARCHAR(100)
title VARCHAR(255)
message TEXT
channel VARCHAR(100)
status VARCHAR(50)
reference_type VARCHAR(100)
reference_id UUID
created_at TIMESTAMP NOT NULL
created_by UUID NULL
updated_at TIMESTAMP NULL
updated_by UUID NULL
deleted_at TIMESTAMP NULL
```

Channel values:

```text
SMS
EMAIL
PUSH
WHATSAPP
IN_APP
```

---

# 21. ERD Relationship Summary

## Organization

```text
hospitals 1 -> many locations
hospitals 1 -> many stores
hospitals 1 -> many kitchens
hospitals 1 -> many restaurants
restaurants 1 -> many counters
```

## Security

```text
users many -> many roles
roles many -> many permissions
```

## Master Data

```text
item_categories 1 -> many items
items 1 -> many item_prices
items 1 -> many restaurant_menus
items 1 -> many item_time_mappings
restaurants 1 -> many restaurant_menus
```

## Procurement

```text
stores 1 -> many indents
indents 1 -> many indent_lines
purchase_orders 1 -> many purchase_order_lines
grns 1 -> many grn_lines
grn_lines 1 -> many grn_batches
```

## Inventory

```text
stock_ledgers = all stock history
stock_balances = current stock
transfers 1 -> many transfer_lines
transfers 1 -> one/many transfer_acknowledgements
```

## Kitchen Production

```text
kitchens 1 -> many kitchen_productions
kitchen_productions 1 -> many kitchen_production_lines
```

## Orders

```text
orders 1 -> many order_lines
orders 1 -> many payments
orders 1 -> one/many invoices
orders 1 -> one/many kots
orders 1 -> zero/many deliveries
```

## Closing

```text
restaurant_closings 1 -> many closing_payment_summaries
restaurant_closings 1 -> many closing_item_summaries
restaurant_closings 1 -> many supervisor_approvals
```

## ERP

```text
erp_exports 1 -> many erp_export_attempts
```

---

# 22. Key ERD Rules for Codex

Codex must follow these rules while implementing database changes:

1. Hospital is mandatory for all major business tables.
2. Use single inventory engine with `stock_ledgers` and `stock_balances`.
3. Never update stock without ledger entry.
4. MRP items require batch and expiry.
5. Restaurant stock increases only after acknowledgement.
6. Readymade stock is business-date sensitive.
7. Live items are controlled by menu availability in Phase 1.
8. All order sources use one common order model.
9. Payment attempts must be idempotent.
10. Closing mismatch requires supervisor approval.
11. ERP posting must happen only for approved/final transactions.
12. Audit logs are mandatory for all critical actions.
