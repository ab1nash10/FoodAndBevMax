# AAHAR - API Specification

Version: 2.0
Product Name: AAHAR
Document Type: API Specification
Base URL: `/api/v1`
Swagger URL: `/api/docs`

---

# 1. API Standards

All APIs must follow the same standard response format.

## 1.1 Success Response

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

## 1.2 Error Response

```json
{
  "success": false,
  "message": "Validation Error",
  "errors": [],
  "requestId": "uuid",
  "timestamp": "2026-01-01T10:00:00.000Z"
}
```

## 1.3 Pagination Response

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

## 1.4 Common Query Parameters

List APIs should support:

```text
page
limit
search
sortBy
sortOrder
status
hospitalId
restaurantId
fromDate
toDate
```

## 1.5 Authentication Header

Protected APIs must use:

```http
Authorization: Bearer <accessToken>
```

---

# 2. Authentication APIs

## 2.1 Send OTP

```http
POST /auth/send-otp
```

Request:

```json
{
  "mobile": "9999999999"
}
```

Response:

```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "channel": "mobile"
  }
}
```

---

## 2.2 Verify OTP

```http
POST /auth/verify-otp
```

Request:

```json
{
  "mobile": "9999999999",
  "otp": "123456"
}
```

Response:

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "accessToken": "jwt-token",
    "refreshToken": "refresh-token",
    "user": {
      "id": "uuid",
      "name": "Super Admin",
      "mobile": "9999999999",
      "roles": ["Super Admin"],
      "permissions": []
    }
  }
}
```

---

## 2.3 Refresh Token

```http
POST /auth/refresh
```

Request:

```json
{
  "refreshToken": "refresh-token"
}
```

---

## 2.4 Logout

```http
POST /auth/logout
```

Request:

```json
{
  "refreshToken": "refresh-token"
}
```

---

# 3. User, Role, and Permission APIs

## 3.1 Users

```http
GET    /users
GET    /users/{id}
POST   /users
PUT    /users/{id}
DELETE /users/{id}
POST   /users/{id}/roles
```

Create User Request:

```json
{
  "employeeCode": "EMP001",
  "name": "Store Manager",
  "mobile": "9999999998",
  "email": "store.manager@aahar.local",
  "hospitalId": "uuid",
  "status": "ACTIVE"
}
```

Assign Role Request:

```json
{
  "roleId": "uuid"
}
```

---

## 3.2 Roles

```http
GET    /roles
GET    /roles/{id}
POST   /roles
PUT    /roles/{id}
DELETE /roles/{id}
POST   /roles/{id}/permissions
```

Create Role Request:

```json
{
  "name": "Store Manager",
  "description": "Handles GRN, stock and transfers"
}
```

Assign Permissions Request:

```json
{
  "permissionIds": ["uuid1", "uuid2"]
}
```

---

## 3.3 Permissions

```http
GET /permissions
```

---

# 4. Hospital Administration APIs

Hospital is the top-level entity.

> BA terminology note: Business-facing Admin Portal screens now call this master
> **Location**. The API route remains `/hospitals`, and payloads may use the new
> Location-friendly aliases such as `title`, `locationCode`, `displayName`, and
> `invoicePrefix` while preserving `hospitalId` relationships.

---

## 4.1 Hospitals

```http
GET    /hospitals
GET    /hospitals/{id}
POST   /hospitals
PUT    /hospitals/{id}
DELETE /hospitals/{id}
```

Create Hospital Request:

```json
{
  "hospitalName": "Max Healthcare",
  "hospitalCode": "MAX",
  "address": "Saket, New Delhi",
  "city": "New Delhi",
  "state": "Delhi",
  "gstApplicable": true,
  "billPrefix": "MAX",
  "isActive": true
}
```

Rules:

* Hospital code must be unique.
* Hospital is mandatory for Store, Kitchen, Restaurant, Counter, Orders, Inventory and ERP.

---

## 4.2 Locations

```http
GET    /locations
GET    /locations/{id}
POST   /locations
PUT    /locations/{id}
DELETE /locations/{id}
```

Create Location Request:

```json
{
  "hospitalId": "uuid",
  "locationName": "Max Saket",
  "building": "Main Building",
  "floor": "Ground Floor",
  "area": "Cafeteria Zone",
  "address": "Saket, New Delhi",
  "isActive": true
}
```

---

## 4.3 Stores / F&B

```http
GET    /stores
GET    /stores/{id}
POST   /stores
PUT    /stores/{id}
DELETE /stores/{id}
```

Create Store Request:

```json
{
  "hospitalId": "uuid",
  "locationId": "uuid",
  "storeName": "Main F&B Store",
  "storeCode": "STORE001",
  "storeType": "MRP",
  "address": "Ground Floor",
  "isActive": true
}
```

Rules:

* Store code must be unique within hospital.
* Store is used for GRN and MRP stock.

---

## 4.4 Kitchens

```http
GET    /kitchens
GET    /kitchens/{id}
POST   /kitchens
PUT    /kitchens/{id}
DELETE /kitchens/{id}
```

Create Kitchen Request:

```json
{
  "hospitalId": "uuid",
  "locationId": "uuid",
  "kitchenName": "Main Kitchen",
  "kitchenCode": "KIT001",
  "openingTime": "07:00",
  "closingTime": "23:00",
  "isActive": true
}
```

Rules:

* Kitchen code must be unique within hospital.
* Kitchen is used for Readymade production and KOT.

---

## 4.5 Restaurants

```http
GET    /restaurants
GET    /restaurants/{id}
POST   /restaurants
PUT    /restaurants/{id}
DELETE /restaurants/{id}
```

Create Restaurant Request:

```json
{
  "hospitalId": "uuid",
  "locationId": "uuid",
  "storeId": "uuid",
  "kitchenId": "uuid",
  "restaurantName": "Main Cafeteria",
  "restaurantCode": "CAF001",
  "gstNumber": "GST123456",
  "panNumber": "ABCDE1234F",
  "fssaiNumber": "FSSAI123456",
  "address": "Ground Floor",
  "openingTime": "07:00",
  "closingTime": "23:00",
  "normalDiscountApplicable": true,
  "staffDiscountApplicable": true,
  "onlineOrderingEnabled": true,
  "inRoomDiningEnabled": true,
  "b2cQrEnabled": true,
  "upiId": "max@upi",
  "bankName": "HDFC Bank",
  "bankBranch": "Saket",
  "sunBu": "BU001",
  "sunT1": "T1",
  "sunT2": "T2",
  "isActive": true
}
```

Rules:

* Restaurant code must be unique within hospital.
* Restaurant can be mapped to Store and Kitchen.

---

## 4.6 Counters

```http
GET    /counters
GET    /counters/{id}
POST   /counters
PUT    /counters/{id}
DELETE /counters/{id}
```

Create Counter Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "counterName": "Counter 1",
  "counterCode": "CNT001",
  "posDeviceId": "POS-001",
  "paymentDeviceId": "PAY-001",
  "pineLabsDeviceId": "PL-001",
  "isActive": true
}
```

---

# 5. Master Data APIs

---

## 5.1 Item Categories

```http
GET    /item-categories
GET    /item-categories/{id}
POST   /item-categories
PUT    /item-categories/{id}
DELETE /item-categories/{id}
```

Create Category Request:

```json
{
  "categoryName": "Beverages",
  "parentCategoryId": null,
  "isActive": true
}
```

---

## 5.2 Items

```http
GET    /items
GET    /items/{id}
POST   /items
PUT    /items/{id}
DELETE /items/{id}
```

Create Item Request:

```json
{
  "itemCode": "COKE500",
  "itemName": "Coke 500ml",
  "categoryId": "uuid",
  "itemType": "MRP",
  "vegType": "VEG",
  "basePrice": 40,
  "mrp": 40,
  "gstPercent": 5,
  "hsnCode": "2202",
  "preparationTimeMinutes": 0,
  "isBatchRequired": true,
  "isExpiryRequired": true,
  "isDiscountAllowed": true,
  "isActive": true
}
```

Item Type Values:

```text
MRP
READYMADE
LIVE
```

Veg Type Values:

```text
VEG
NON_VEG
EGGETARIAN
```

Rules:

* MRP items require batch and expiry.
* READYMADE items are produced in Kitchen.
* LIVE items are made on demand and require KOT.

---

## 5.3 Item Prices

```http
GET    /item-prices
GET    /item-prices/{id}
POST   /item-prices
PUT    /item-prices/{id}
DELETE /item-prices/{id}
```

Create Price Request:

```json
{
  "itemId": "uuid",
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "rateType": "NORMAL",
  "price": 40,
  "effectiveFrom": "2026-01-01",
  "effectiveTo": null,
  "isActive": true
}
```

Rate Type Values:

```text
NORMAL
STAFF
ROOM
COUNTER
```

---

## 5.4 Time Slots

```http
GET    /time-slots
GET    /time-slots/{id}
POST   /time-slots
PUT    /time-slots/{id}
DELETE /time-slots/{id}
```

Create Time Slot Request:

```json
{
  "slotName": "Breakfast",
  "startTime": "07:00",
  "endTime": "10:00",
  "isAlwaysAvailable": false,
  "isActive": true
}
```

---

## 5.5 Item Time Mappings

```http
GET    /item-time-mappings
GET    /item-time-mappings/{id}
POST   /item-time-mappings
PUT    /item-time-mappings/{id}
DELETE /item-time-mappings/{id}
```

Create Mapping Request:

```json
{
  "itemId": "uuid",
  "restaurantId": "uuid",
  "timeSlotId": "uuid",
  "daysOfWeek": "MON,TUE,WED,THU,FRI,SAT,SUN",
  "isAlwaysAvailable": false,
  "isActive": true
}
```

---

## 5.6 Restaurant Menu Mapping

```http
GET    /restaurant-menus
GET    /restaurant-menus/{id}
POST   /restaurant-menus
PUT    /restaurant-menus/{id}
DELETE /restaurant-menus/{id}
```

Create Menu Mapping Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "itemId": "uuid",
  "isAvailable": true,
  "displayOrder": 1
}
```

---

## 5.7 Employees

```http
GET    /employees
GET    /employees/{id}
POST   /employees
PUT    /employees/{id}
DELETE /employees/{id}
GET    /employees/validate/{employeeCode}
```

Create Employee Request:

```json
{
  "hospitalId": "uuid",
  "employeeCode": "EMP001",
  "employeeName": "John Doe",
  "department": "Nursing",
  "designation": "Staff Nurse",
  "mobile": "9999999999",
  "email": "john@example.com",
  "eligibleForDiscount": true,
  "isActive": true
}
```

Validate Employee Response:

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "employeeId": "uuid",
    "employeeCode": "EMP001",
    "employeeName": "John Doe",
    "eligibleForDiscount": true,
    "isActive": true
  }
}
```

---

## 5.8 Discount Rules

```http
GET    /discounts
GET    /discounts/{id}
POST   /discounts
PUT    /discounts/{id}
DELETE /discounts/{id}
POST   /discounts/apply
```

Create Discount Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "discountName": "Staff Discount",
  "discountType": "STAFF_DISCOUNT",
  "customerType": "EMPLOYEE",
  "rateType": "STAFF",
  "discountPercent": 10,
  "discountAmount": null,
  "isEmployeeValidationRequired": true,
  "effectiveFrom": "2026-01-01",
  "effectiveTo": null,
  "isActive": true
}
```

Apply Discount Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "customerType": "EMPLOYEE",
  "employeeCode": "EMP001",
  "items": [
    {
      "itemId": "uuid",
      "quantity": 2,
      "unitPrice": 20
    }
  ]
}
```

---

## 5.9 Discount Approvals

```http
GET    /discount-approvals
GET    /discount-approvals/{id}
POST   /discount-approvals
PATCH  /discount-approvals/{id}/approve
PATCH  /discount-approvals/{id}/reject
```

Create Approval Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "orderId": "uuid",
  "discountRuleId": "uuid",
  "reason": "Special approval"
}
```

---

## 5.10 Payment Gateways

```http
GET    /payment-gateways
GET    /payment-gateways/{id}
POST   /payment-gateways
PUT    /payment-gateways/{id}
DELETE /payment-gateways/{id}
```

Create Payment Gateway Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "gatewayName": "Pine Labs Counter 1",
  "gatewayType": "PINE_LABS",
  "merchantId": "MERCHANT001",
  "terminalId": "TERM001",
  "upiId": null,
  "isActive": true
}
```

---

## 5.11 Vendors

```http
GET    /vendors
GET    /vendors/{id}
POST   /vendors
PUT    /vendors/{id}
DELETE /vendors/{id}
```

Create Vendor Request:

```json
{
  "vendorCode": "VEND001",
  "vendorName": "ABC Beverages",
  "gstNumber": "GST123456",
  "contactPerson": "Ramesh",
  "mobile": "9999999999",
  "email": "vendor@example.com",
  "address": "Delhi",
  "isActive": true
}
```

---

# 6. Procurement and GRN APIs

---

## 6.1 Indents

```http
GET    /indents
GET    /indents/{id}
POST   /indents
PUT    /indents/{id}
DELETE /indents/{id}
PATCH  /indents/{id}/submit
PATCH  /indents/{id}/approve
PATCH  /indents/{id}/reject
PATCH  /indents/{id}/convert-to-po
```

Create Indent Request:

```json
{
  "hospitalId": "uuid",
  "storeId": "uuid",
  "indentDate": "2026-01-01",
  "remarks": "Monthly beverage stock",
  "items": [
    {
      "itemId": "uuid",
      "requestedQty": 100,
      "remarks": "Coke stock"
    }
  ]
}
```

---

## 6.2 Purchase Orders

```http
GET    /purchase-orders
GET    /purchase-orders/{id}
POST   /purchase-orders
PUT    /purchase-orders/{id}
DELETE /purchase-orders/{id}
PATCH  /purchase-orders/{id}/send-to-vendor
PATCH  /purchase-orders/{id}/close
```

Create PO Request:

```json
{
  "hospitalId": "uuid",
  "storeId": "uuid",
  "vendorId": "uuid",
  "poNumber": "PO-2026-0001",
  "poDate": "2026-01-01",
  "items": [
    {
      "itemId": "uuid",
      "orderedQty": 100,
      "rate": 30,
      "gstPercent": 5,
      "expectedDeliveryDate": "2026-01-05"
    }
  ]
}
```

---

## 6.3 GRNs

```http
GET    /grns
GET    /grns/{id}
POST   /grns
PUT    /grns/{id}
DELETE /grns/{id}
PATCH  /grns/{id}/submit-verification
PATCH  /grns/{id}/post-to-stock
PATCH  /grns/{id}/cancel
```

Create GRN Request:

```json
{
  "hospitalId": "uuid",
  "storeId": "uuid",
  "poId": "uuid",
  "vendorId": "uuid",
  "receivedDate": "2026-01-05T10:00:00.000Z",
  "remarks": "Received beverage stock",
  "items": [
    {
      "itemId": "uuid",
      "orderedQty": 100,
      "receivedQty": 80,
      "acceptedQty": 70,
      "rejectedQty": 10,
      "rejectionReason": "Expired batch",
      "remarks": "Partial receiving",
      "batches": [
        {
          "batchNumber": "BATCH-A",
          "manufacturingDate": "2025-12-01",
          "expiryDate": "2026-06-30",
          "receivedQty": 40,
          "acceptedQty": 40,
          "rejectedQty": 0
        },
        {
          "batchNumber": "BATCH-B",
          "manufacturingDate": "2025-12-01",
          "expiryDate": "2026-05-10",
          "receivedQty": 40,
          "acceptedQty": 30,
          "rejectedQty": 10,
          "rejectionReason": "Near expiry"
        }
      ]
    }
  ]
}
```

Rules:

* Accepted Qty + Rejected Qty must equal Received Qty.
* Batch is mandatory for MRP items.
* Expiry is mandatory for MRP items.
* Only accepted quantity is posted to stock.
* Posting GRN creates stock ledger and stock balance.

---

# 7. Inventory APIs

---

## 7.1 Stock Ledger

```http
GET /stock-ledgers
GET /stock-ledgers/{id}
```

Query Parameters:

```text
hospitalId
locationType
locationId
itemId
itemType
batchNumber
expiryDate
businessDate
fromDate
toDate
```

---

## 7.2 Stock Balance

```http
GET /stock-balances
GET /stock-balances/{id}
```

Query Parameters:

```text
hospitalId
locationType
locationId
itemId
itemType
batchNumber
expiryDate
status
```

---

## 7.3 Stock Reservations

```http
GET    /stock-reservations
GET    /stock-reservations/{id}
POST   /stock-reservations
PATCH  /stock-reservations/{id}/release
PATCH  /stock-reservations/{id}/consume
PATCH  /stock-reservations/{id}/expire
```

Create Reservation Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "counterId": "uuid",
  "orderId": "uuid",
  "itemId": "uuid",
  "batchNumber": "BATCH-A",
  "expiryDate": "2026-06-30",
  "reservedQty": 2,
  "businessDate": "2026-01-01"
}
```

---

## 7.4 Stock Adjustments

```http
GET    /stock-adjustments
GET    /stock-adjustments/{id}
POST   /stock-adjustments
PATCH  /stock-adjustments/{id}/submit
PATCH  /stock-adjustments/{id}/approve
PATCH  /stock-adjustments/{id}/reject
PATCH  /stock-adjustments/{id}/post
```

Create Adjustment Request:

```json
{
  "hospitalId": "uuid",
  "locationType": "STORE",
  "locationId": "uuid",
  "itemId": "uuid",
  "batchNumber": "BATCH-A",
  "expiryDate": "2026-06-30",
  "adjustmentType": "DECREASE",
  "quantity": 5,
  "reason": "Damaged stock",
  "remarks": "Broken bottles",
  "businessDate": "2026-01-01"
}
```

---

# 8. Kitchen Production APIs

```http
GET    /kitchen-productions
GET    /kitchen-productions/{id}
POST   /kitchen-productions
PUT    /kitchen-productions/{id}
DELETE /kitchen-productions/{id}
PATCH  /kitchen-productions/{id}/post
PATCH  /kitchen-productions/{id}/cancel
```

Create Production Request:

```json
{
  "hospitalId": "uuid",
  "kitchenId": "uuid",
  "productionDate": "2026-01-01",
  "businessDate": "2026-01-01",
  "chefUserId": "uuid",
  "remarks": "Morning production",
  "items": [
    {
      "itemId": "uuid",
      "producedQty": 100,
      "wastageQty": 0,
      "remarks": "Samosa"
    }
  ]
}
```

Rules:

* Only READYMADE items are allowed.
* Posting production increases kitchen stock.
* Posting creates stock ledger entry.

---

# 9. Transfer and Acknowledgement APIs

---

## 9.1 Transfers

```http
GET    /transfers
GET    /transfers/{id}
POST   /transfers
PUT    /transfers/{id}
DELETE /transfers/{id}
PATCH  /transfers/{id}/dispatch
PATCH  /transfers/{id}/cancel
```

Create Transfer Request:

```json
{
  "hospitalId": "uuid",
  "sourceType": "STORE",
  "sourceId": "uuid",
  "destinationType": "RESTAURANT",
  "destinationId": "uuid",
  "transferType": "STORE_TO_RESTAURANT",
  "businessDate": "2026-01-01",
  "remarks": "Transfer to Main Cafeteria",
  "items": [
    {
      "itemId": "uuid",
      "itemType": "MRP",
      "batchNumber": "BATCH-A",
      "expiryDate": "2026-06-30",
      "sentQty": 20,
      "remarks": "Coke transfer"
    }
  ]
}
```

Rules:

* Dispatch reduces source stock.
* Destination stock does not increase until acknowledgement.
* MRP transfer requires batch and expiry.

---

## 9.2 Transfer Acknowledgements

```http
GET   /transfer-acknowledgements
GET   /transfer-acknowledgements/{id}
POST  /transfer-acknowledgements
PATCH /transfer-acknowledgements/{id}/submit
PATCH /transfer-acknowledgements/{id}/cancel
```

Create Acknowledgement Request:

```json
{
  "transferId": "uuid",
  "hospitalId": "uuid",
  "remarks": "Received with 2 damaged",
  "proofAttachmentUrl": null,
  "items": [
    {
      "transferLineId": "uuid",
      "itemId": "uuid",
      "batchNumber": "BATCH-A",
      "expiryDate": "2026-06-30",
      "sentQty": 20,
      "acceptedQty": 18,
      "rejectedQty": 2,
      "rejectionReason": "Damaged during transfer",
      "remarks": "2 bottles broken"
    }
  ]
}
```

Rules:

* Accepted Qty + Rejected Qty must equal Sent Qty.
* Accepted quantity increases destination stock.
* Rejected quantity is traceable and returned/adjusted.

---

# 10. Order APIs

```http
GET    /orders
GET    /orders/{id}
POST   /orders
PATCH  /orders/{id}/confirm
PATCH  /orders/{id}/cancel
PATCH  /orders/{id}/status
```

Create Order Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "counterId": "uuid",
  "kitchenId": "uuid",
  "orderSource": "COUNTER_POS",
  "customerType": "CUSTOMER",
  "customerName": "Walk-in Customer",
  "mobileNumber": "9999999999",
  "employeeId": null,
  "roomNumber": null,
  "bedNumber": null,
  "tableNumber": null,
  "rateType": "COUNTER",
  "deliveryType": "COUNTER_PICKUP",
  "businessDate": "2026-01-01",
  "specialInstruction": "No onion",
  "items": [
    {
      "itemId": "uuid",
      "quantity": 2,
      "unitPrice": 20,
      "discountAmount": 0,
      "gstPercent": 5,
      "requiresKot": true,
      "specialInstruction": "Less spicy"
    }
  ]
}
```

Rules:

* One common order engine for all channels.
* MRP and READYMADE require stock validation.
* LIVE requires time/menu validation.
* Employee orders require employee validation for staff discount.

---

# 11. Invoice APIs

```http
GET   /invoices
GET   /invoices/{id}
POST  /invoices/generate
PATCH /invoices/{id}/cancel
```

Generate Invoice Request:

```json
{
  "orderId": "uuid"
}
```

---

# 12. Payment APIs

---

## 12.1 Initiate Payment

```http
POST /payments/initiate
```

Request:

```json
{
  "orderId": "uuid",
  "invoiceId": "uuid",
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "paymentMode": "PINE_LABS",
  "gatewayName": "Pine Labs",
  "amount": 135,
  "businessDate": "2026-01-01"
}
```

Rules:

* One active payment attempt per order.
* If active attempt exists, return same attempt.
* If order is already paid, block new payment.
* Generate idempotency key.

---

## 12.2 Payment Callback

```http
POST /payments/callback/{gatewayName}
```

Request:

```json
{
  "gatewayReference": "GW123",
  "idempotencyKey": "AAHAR-ORDER-1001-ATTEMPT-1",
  "status": "SUCCESS",
  "amount": 135,
  "payload": {}
}
```

Rules:

* Callback must be idempotent.
* Duplicate callback must not create duplicate payment.
* Amount must match.
* Gateway status must be verified server-side.

---

## 12.3 Verify Payment

```http
POST /payments/{paymentAttemptId}/verify
```

---

## 12.4 Refund Payment

```http
POST /payments/{paymentId}/refund
```

Refund Request:

```json
{
  "refundAmount": 100,
  "refundReason": "Customer refund",
  "businessDate": "2026-01-01"
}
```

---

## 12.5 Payment Status

```http
GET /payments/order/{orderId}/status
```

---

# 13. KOT APIs

```http
GET   /kots
GET   /kots/{id}
POST  /kots/generate
PATCH /kots/{id}/accept
PATCH /kots/{id}/preparing
PATCH /kots/{id}/ready
PATCH /kots/{id}/dispatch
PATCH /kots/{id}/cancel
```

Generate KOT Request:

```json
{
  "orderId": "uuid"
}
```

---

# 14. Delivery APIs

```http
GET   /deliveries
GET   /deliveries/{id}
POST  /deliveries/assign
PATCH /deliveries/{id}/picked-up
PATCH /deliveries/{id}/out-for-delivery
PATCH /deliveries/{id}/delivered
PATCH /deliveries/{id}/failed
PATCH /deliveries/{id}/cancel
```

Assign Delivery Request:

```json
{
  "orderId": "uuid",
  "kotId": "uuid",
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "supervisorId": "uuid",
  "deliveryOperatorId": "uuid",
  "deliveryType": "ROOM_DELIVERY",
  "remarks": "Deliver to room 205"
}
```

---

# 15. Restaurant Closing APIs

```http
GET    /restaurant-closings
GET    /restaurant-closings/{id}
POST   /restaurant-closings
PUT    /restaurant-closings/{id}
PATCH  /restaurant-closings/{id}/submit
PATCH  /restaurant-closings/{id}/approve
PATCH  /restaurant-closings/{id}/reject
PATCH  /restaurant-closings/{id}/correction-required
```

Create Closing Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "businessDate": "2026-01-01",
  "cashDeclared": 200,
  "cardDeclared": 100,
  "upiDeclared": 100,
  "pineLabsDeclared": 100,
  "payuDeclared": 0,
  "razorpayDeclared": 0,
  "remarks": "Closing submitted",
  "proofAttachmentUrl": null
}
```

Rules:

* Expected Sale Amount is calculated by system.
* Actual Collection Amount is declared by restaurant user.
* Difference requires reason and supervisor approval.
* Approved closing becomes ERP-ready.

---

# 16. Wastage APIs

```http
GET    /wastages
GET    /wastages/{id}
POST   /wastages
PUT    /wastages/{id}
PATCH  /wastages/{id}/submit
PATCH  /wastages/{id}/approve
PATCH  /wastages/{id}/reject
PATCH  /wastages/{id}/post
```

Create Wastage Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "kitchenId": "uuid",
  "businessDate": "2026-01-01",
  "wastageType": "DAY_END_READYMADE",
  "remarks": "Day-end readymade wastage",
  "items": [
    {
      "itemId": "uuid",
      "itemType": "READYMADE",
      "batchNumber": null,
      "expiryDate": null,
      "quantity": 10,
      "value": 100,
      "reason": "Unsold day-end stock",
      "proofAttachmentUrl": null
    }
  ]
}
```

---

# 17. Supervisor Approval APIs

```http
GET   /supervisor-approvals
GET   /supervisor-approvals/{id}
POST  /supervisor-approvals
PATCH /supervisor-approvals/{id}/approve
PATCH /supervisor-approvals/{id}/reject
PATCH /supervisor-approvals/{id}/correction-required
PATCH /supervisor-approvals/{id}/escalate
```

Create Approval Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "approvalType": "CLOSING_MISMATCH",
  "referenceType": "RESTAURANT_CLOSING",
  "referenceId": "uuid",
  "reason": "Difference in cash collection",
  "remarks": "Cash short by 50",
  "proofAttachmentUrl": null
}
```

---

# 18. ERP/SUN APIs

```http
GET   /erp/exports
GET   /erp/exports/{id}
POST  /erp/exports/mark-ready
POST  /erp/exports/{id}/post
POST  /erp/exports/{id}/retry
GET   /erp/exports/{id}/attempts
```

Mark Ready Request:

```json
{
  "hospitalId": "uuid",
  "restaurantId": "uuid",
  "businessDate": "2026-01-01",
  "referenceType": "RESTAURANT_CLOSING",
  "referenceId": "uuid",
  "postingType": "CLOSING"
}
```

Rules:

* Do not post failed payments.
* Do not post cancelled orders.
* Do not post unapproved wastage.
* Do not post unapproved mismatch closing.
* Prevent duplicate ERP posting.

---

# 19. Report APIs

All report APIs must support:

```text
fromDate
toDate
hospitalId
restaurantId
locationId
counterId
export
page
limit
```

## Report Endpoints

```http
GET /reports/hospital-sales
GET /reports/location-sales
GET /reports/restaurant-sales
GET /reports/counter-sales
GET /reports/item-sales
GET /reports/payment-modes
GET /reports/gst
GET /reports/discounts
GET /reports/employee-discounts
GET /reports/grns
GET /reports/batch-stock
GET /reports/near-expiry
GET /reports/expired-stock
GET /reports/kitchen-production
GET /reports/transfers
GET /reports/acknowledgements
GET /reports/wastage
GET /reports/closing
GET /reports/mismatch
GET /reports/erp-posting
GET /reports/audit-logs
```

---

# 20. Audit APIs

```http
GET /audit-logs
GET /audit-logs/{id}
```

Query Parameters:

```text
hospitalId
userId
entityName
entityId
action
fromDate
toDate
requestId
page
limit
```

---

# 21. Notification APIs

```http
GET   /notifications
GET   /notifications/{id}
POST  /notifications/send
PATCH /notifications/{id}/read
```

---

# 22. Implementation Priority

Codex must implement APIs in this order:

```text
1. Hospital Administration APIs
2. Master Data APIs
3. Store/F&B Inventory APIs
4. Kitchen Production APIs
5. Transfer and Acknowledgement APIs
6. Restaurant Stock APIs
7. Order APIs
8. POS and Invoice APIs
9. Payment APIs
10. KOT APIs
11. Delivery APIs
12. Closing APIs
13. Wastage APIs
14. ERP APIs
15. Report APIs
```

---

# 23. API Rules for Codex

Codex must follow these rules:

1. Every protected API must require JWT.
2. Every protected API must check RBAC permission.
3. Every create/update/delete/post/approve action must create audit log.
4. Every list API must support pagination.
5. Every API must have Swagger documentation.
6. Every request must use DTO validation.
7. Every response must follow standard response format.
8. No stock update without stock ledger.
9. No duplicate payment attempt for already paid order.
10. No ERP posting without approved/final transaction.
