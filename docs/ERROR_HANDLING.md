# AAHAR - Error Handling Standard

Version: 1.0
Product Name: AAHAR
Document Type: Error Handling Standard
Status: Mandatory for development, UAT, and production readiness

---

# 1. Purpose

This document defines how AAHAR must handle errors across:

* Frontend
* Backend APIs
* Database
* Authentication
* Authorization
* Inventory
* Payments
* ERP/SUN integration
* User interface
* Production monitoring

AAHAR must never show confusing raw technical errors to business users.

Bad examples:

```text
Failed to fetch
Internal Server Error
Unhandled exception
JWT expired
Prisma error
Cannot read property undefined
```

Good examples:

```text
Unable to save item. Please check the required fields.
Your session has expired. Please login again.
You do not have permission to perform this action.
Selected batch has insufficient stock.
Payment status is pending. Please wait while we verify.
```

---

# 2. Error Handling Goals

AAHAR error handling must ensure:

* Users understand what happened.
* Users know what action to take.
* Developers can debug using request IDs and logs.
* Sensitive details are never exposed.
* System remains stable after error.
* Critical transactions are not duplicated.
* Inventory, payment, ERP, and closing data remain consistent.

---

# 3. Standard API Error Response

All backend errors must follow this format:

```json
{
  "success": false,
  "message": "Validation Error",
  "errors": [],
  "requestId": "uuid",
  "timestamp": "2026-01-01T10:00:00.000Z"
}
```

## Required Fields

| Field     | Purpose                                   |
| --------- | ----------------------------------------- |
| success   | Always false for errors                   |
| message   | User-friendly error message               |
| errors    | Field-level or detailed validation errors |
| requestId | Unique request/correlation ID             |
| timestamp | Error timestamp                           |

---

# 4. Standard Success Response

All successful APIs must follow:

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

---

# 5. Error Categories

AAHAR errors should be categorized as:

```text
VALIDATION_ERROR
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
BUSINESS_RULE_ERROR
DUPLICATE_ERROR
NOT_FOUND_ERROR
CONFLICT_ERROR
DATABASE_ERROR
NETWORK_ERROR
PAYMENT_ERROR
ERP_ERROR
INTEGRATION_ERROR
UNKNOWN_ERROR
```

---

# 6. HTTP Status Code Rules

## 400 Bad Request

Use for invalid request payloads.

Examples:

```text
Invalid mobile number
Invalid quantity
Invalid enum value
Missing required field
```

Response:

```json
{
  "success": false,
  "message": "Invalid request. Please check the submitted data.",
  "errors": [],
  "requestId": "uuid",
  "timestamp": "ISO_DATE"
}
```

---

## 401 Unauthorized

Use when user is not authenticated.

Examples:

```text
Missing token
Expired token
Invalid token
Inactive user
```

Frontend behavior:

```text
Clear session
Redirect to login
Show session expired message
```

User message:

```text
Your session has expired. Please login again.
```

---

## 403 Forbidden

Use when user is authenticated but lacks permission.

Examples:

```text
Store user tries to approve closing
POS operator tries to create users
Kitchen user tries to post ERP
```

User message:

```text
You do not have permission to perform this action.
```

Frontend behavior:

```text
Do not logout user.
Show permission denied message.
```

---

## 404 Not Found

Use when resource does not exist.

Examples:

```text
Hospital not found
Item not found
GRN not found
Transfer not found
```

User message:

```text
The requested record was not found.
```

---

## 409 Conflict

Use for duplicate or conflicting business data.

Examples:

```text
Similar item already exists
Duplicate hospital code
Duplicate store mapping
Duplicate payment callback
```

User messages:

```text
Similar item already exists.
Similar category already exists.
This mapping already exists.
This record already exists.
```

---

## 422 Unprocessable Entity

Use for business-rule validation failures.

Examples:

```text
Transfer quantity exceeds stock
Expired batch cannot be accepted
Accepted quantity cannot exceed received quantity
Payment amount mismatch
Closing mismatch requires approval
```

User message:

```text
This action cannot be completed because it violates a business rule.
```

---

## 429 Too Many Requests

Use for rate limiting.

Examples:

```text
Too many OTP requests
Too many login attempts
Too many payment retries
```

User message:

```text
Too many attempts. Please try again after some time.
```

---

## 500 Internal Server Error

Use only for unexpected server errors.

User message:

```text
Something went wrong. Please try again. If the issue continues, contact support with the request ID.
```

Never show raw stack trace to users.

---

# 7. Frontend Error Display Rules

## 7.1 Form Errors

Field-specific errors should appear below the field.

Example:

```text
Item Name *
[___________]
Item name is required.
```

---

## 7.2 Toast Errors

Use toast for operation-level errors.

Examples:

```text
Unable to create item.
Unable to post GRN.
Unable to dispatch transfer.
Unable to verify payment.
```

---

## 7.3 Page-Level Errors

Use page-level error state when data cannot load.

Example:

```text
Unable to load restaurant stock.

Please refresh the page or try again.
Request ID: abc-123
```

---

## 7.4 Empty States

Do not show errors when data is simply empty.

Example:

```text
No GRNs found.

Create your first GRN to start receiving stock.
```

---

# 8. Network Error Handling

Network errors must not be shown as raw:

```text
Failed to fetch
```

Instead show:

```text
Unable to connect to the server.
Please check your connection and try again.
```

Common causes:

* Backend service not running
* Wrong API URL
* CORS blocked
* Office network/VPN issue
* Firewall issue

Frontend should log technical details for developers, but show friendly message to users.

---

# 9. Authentication Error Handling

## OTP Request Failure

Possible causes:

```text
Auth service down
Wrong API URL
CORS blocked
Rate limit
Invalid mobile number
Redis unavailable
```

User messages:

```text
Unable to send OTP. Please try again.
Too many OTP requests. Please try again after some time.
Invalid mobile number.
```

Developer logs must include:

```text
requestId
mobile masked
service
error category
```

Do not log OTP in production.

---

## OTP Verification Failure

User messages:

```text
Invalid or expired OTP.
User is not registered or active.
```

Do not reveal too much sensitive detail in production.

---

## Session Expired

User message:

```text
Your session has expired. Please login again.
```

Action:

```text
Clear session
Clear cache
Redirect to login
```

---

# 10. Authorization Error Handling

When user lacks permission:

```text
Do not show blank page.
Do not logout user.
Show permission denied message.
```

User message:

```text
You do not have permission to access this page.
```

For action buttons:

```text
Hide button if user lacks permission.
Also enforce backend RBAC.
```

---

# 11. Validation Error Handling

Backend must validate all DTOs.

Frontend must validate all forms using Zod/React Hook Form.

Validation errors should be:

* Clear
* Field-specific
* User-friendly
* Consistent

Examples:

```text
Hospital name is required.
Store code is required.
Quantity must be greater than zero.
Expiry date is required for MRP items.
Accepted quantity cannot exceed received quantity.
```

---

# 12. Duplicate Error Handling

AAHAR must prevent duplicate master data.

Examples:

```text
Veg Thali
Veg-Thali
VEG_THALI
```

should be detected as similar duplicates.

User messages:

```text
Similar item already exists.
Similar category already exists.
This employee code already exists.
This mapping already exists.
```

Backend must return `409 Conflict`.

---

# 13. Inventory Error Handling

Inventory errors are critical because wrong stock affects sales, closing, and ERP.

## GRN Errors

Examples:

```text
Batch number is required for MRP items.
Expiry date is required for MRP items.
Expired batch cannot be accepted.
Accepted quantity plus rejected quantity must equal received quantity.
Only MRP items can be added to GRN.
Item is not mapped to selected store.
```

User messages:

```text
Batch number is required for this item.
Expiry date is required for this item.
Expired stock cannot be accepted.
Accepted and rejected quantities must match received quantity.
```

---

## Stock Errors

Examples:

```text
Stock balance not found.
Insufficient stock.
Selected batch has insufficient quantity.
Stock balance mismatch.
```

User messages:

```text
Selected batch has insufficient stock.
Available stock is 20. Please enter quantity up to 20.
```

---

## Transfer Errors

Examples:

```text
Transfer quantity exceeds current stock.
Source and destination cannot be same.
MRP transfer requires batch and expiry.
Ready-made item cannot be transferred from Store.
MRP item cannot be transferred from Kitchen.
```

User messages:

```text
Transfer quantity exceeds available stock.
Selected batch has available stock 90. Requested quantity is 100.
This item cannot be transferred from the selected source.
```

---

## Acknowledgement Errors

Examples:

```text
Accepted quantity plus rejected quantity must equal sent quantity.
Rejected quantity requires rejection reason.
Transfer already acknowledged.
Cancelled transfer cannot be acknowledged.
```

User messages:

```text
Accepted and rejected quantities must match sent quantity.
Please enter rejection reason.
This transfer has already been acknowledged.
```

---

# 14. Kitchen Production Error Handling

Examples:

```text
Only READYMADE items can be produced.
Item is not mapped to selected kitchen.
Produced quantity must be greater than zero.
Wastage quantity cannot exceed produced quantity.
Posted production cannot be edited.
Cancelled production cannot be posted.
```

User messages:

```text
Only ready-made items can be added to production.
This item is not mapped to the selected kitchen.
Produced quantity must be greater than zero.
Wastage quantity cannot exceed produced quantity.
```

---

# 15. Restaurant Stock Error Handling

Examples:

```text
Restaurant stock not found.
Item out of stock.
Expired stock cannot be sold.
Near-expiry approval required.
```

User messages:

```text
This item is out of stock.
Expired stock cannot be sold.
Supervisor approval is required for near-expiry stock.
```

---

# 16. POS Error Handling

Future POS errors must be handled carefully.

Examples:

```text
Cart is empty.
Item is out of stock.
Item is not available in current time slot.
Employee ID is invalid.
Payment is required.
```

User messages:

```text
Please add at least one item to the cart.
This item is currently out of stock.
This item is not available at this time.
Invalid employee ID.
Please complete payment before billing.
```

---

# 17. Payment Error Handling

Payment errors must never create duplicate payments.

## Payment Initiation Errors

Examples:

```text
Order already paid.
Active payment attempt already exists.
Invalid payment mode.
Gateway unavailable.
```

User messages:

```text
This order is already paid.
A payment is already in progress for this order.
Payment gateway is currently unavailable. Please try again.
```

---

## Payment Callback Errors

Examples:

```text
Duplicate callback.
Amount mismatch.
Invalid gateway signature.
Unknown payment status.
```

System behavior:

```text
Do not create duplicate payment.
Store payment event.
Mark for reconciliation if needed.
```

User message:

```text
Payment is being verified. Please wait.
```

---

## Network Failure After Deduction

If user payment is deducted but network fails:

System must:

```text
Check gateway status
Verify server-side
Mark success if confirmed
Keep pending if unknown
Allow retry only after safe verification
```

User message:

```text
Payment status is being verified. Please do not pay again.
```

---

# 18. ERP/SUN Error Handling

ERP posting failures must not block business transactions after closing approval.

Examples:

```text
SUN API unavailable
Payload validation failed
Duplicate posting
Authentication failed
Network timeout
```

System behavior:

```text
Mark ERP export as FAILED or RETRY_PENDING.
Store request/response payload.
Allow retry.
Do not duplicate posting.
```

User message:

```text
ERP posting failed and has been marked for retry.
```

---

# 19. Closing Error Handling

Examples:

```text
Closing already submitted.
Closing already approved.
Mismatch requires reason.
Mismatch requires supervisor approval.
Unapproved closing cannot be posted to ERP.
```

User messages:

```text
This closing has already been submitted.
This closing has already been approved.
Please enter reason for mismatch.
Supervisor approval is required before ERP posting.
```

---

# 20. Wastage Error Handling

Examples:

```text
Wastage quantity exceeds stock.
Expired stock requires batch information.
Day-end readymade wastage requires supervisor approval.
Approved wastage cannot be edited.
```

User messages:

```text
Wastage quantity exceeds available stock.
Batch information is required for expired stock.
Supervisor approval is required for day-end wastage.
```

---

# 21. Database Error Handling

Backend must catch database errors and convert them into friendly messages.

Examples:

## Unique Constraint

Backend message:

```text
This record already exists.
```

## Foreign Key Error

Backend message:

```text
Referenced record not found.
```

## Connection Error

Backend message:

```text
Database temporarily unavailable. Please try again.
```

Do not expose raw Prisma errors to UI.

Bad:

```text
PrismaClientKnownRequestError P2002
```

Good:

```text
This record already exists.
```

---

# 22. Logging Rules

Backend logs must include:

```text
requestId
service
method
path
statusCode
durationMs
userId
hospitalId
errorName
errorMessage
```

Do not log:

```text
Full JWT
Refresh token
OTP in production
Payment credentials
Database password
Gateway secrets
```

---

# 23. Request ID Rule

Every request must have:

```text
X-Request-Id
```

If frontend receives an error, it should show support-friendly message:

```text
Something went wrong. Please contact support with Request ID: abc-123
```

---

# 24. Frontend API Client Rules

API client must:

* Attach latest token.
* Handle 401.
* Handle 403.
* Handle 409.
* Handle 422.
* Handle 500.
* Parse backend message.
* Avoid showing raw `Failed to fetch`.
* Add timeout handling.
* Retry only safe requests when appropriate.

Do not automatically retry:

```text
Payment callbacks
Payment initiation
GRN post
Stock transfer dispatch
Acknowledgement submit
Closing approval
ERP post
```

unless idempotency exists.

---

# 25. Retry Rules

Safe to retry:

```text
GET requests
Dashboard data
Report loading
List APIs
```

Be careful retrying:

```text
POST
PATCH
DELETE
Payment
Stock movement
ERP posting
```

Never retry critical write operations automatically unless:

```text
idempotency key exists
```

---

# 26. Error Boundary

Frontend must have a global error boundary.

If UI crashes:

Show:

```text
Something went wrong.

Please refresh the page. If the issue continues, contact support.
```

Provide:

```text
Request ID / Error ID if available
```

---

# 27. 404 Page

If route not found:

Show:

```text
Page not found.

The page you are looking for does not exist.
```

Actions:

```text
Go to Dashboard
Go Back
```

---

# 28. 500 Page

If server-side page fails:

Show:

```text
Unable to load this page.

Please try again or contact support.
```

---

# 29. Offline / Backend Down

If backend is unreachable:

Show:

```text
Unable to connect to AAHAR services.

Please check your network or contact IT support.
```

Do not show only:

```text
Failed to fetch
```

---

# 30. User-Friendly Message Examples

| Technical Error    | User Message                          |
| ------------------ | ------------------------------------- |
| Failed to fetch    | Unable to connect to server           |
| JWT expired        | Your session has expired              |
| Forbidden          | You do not have permission            |
| Prisma P2002       | This record already exists            |
| Cannot POST        | Service is unavailable                |
| Stock balance null | Stock not available for selected item |
| Duplicate callback | Payment already processed             |
| ERP timeout        | ERP posting failed and will retry     |

---

# 31. Error Handling by Role

## Store User

Should understand:

```text
Stock issue
Batch issue
GRN issue
Transfer issue
```

## Kitchen User

Should understand:

```text
Production issue
Wastage issue
Kitchen stock issue
```

## Restaurant User

Should understand:

```text
Acknowledgement issue
Restaurant stock issue
Closing issue
```

## POS Operator

Should understand:

```text
Payment issue
Stock unavailable
Employee invalid
```

## Supervisor

Should understand:

```text
Approval required
Mismatch issue
Wastage issue
```

## Finance User

Should understand:

```text
ERP failed
Reconciliation mismatch
Payment mismatch
```

---

# 32. Development Rules

When Codex implements any module:

* Add user-friendly errors.
* Do not expose stack traces.
* Convert Prisma errors.
* Add validation messages.
* Add Swagger error responses.
* Add frontend toast handling.
* Add empty/loading/error states.
* Add request ID to error responses.
* Run lint and build.

---

# 33. Regression Rules

Whenever error handling changes:

Test:

```text
Login failure
Expired token
Invalid permission
Duplicate item
Invalid GRN
Insufficient stock
Transfer validation
Kitchen production validation
Network failure
Backend down
```

---

# 34. Production Monitoring

Production errors should be sent to monitoring tools.

Recommended future tools:

```text
Sentry
Azure Application Insights
Grafana
Wazuh / SIEM
```

Captured data:

```text
error type
service
route
user ID
hospital ID
request ID
timestamp
stack trace
environment
```

Do not send sensitive data.

---

# 35. Severity Levels

## Low

Examples:

```text
Validation error
Duplicate entry
Missing optional field
```

## Medium

Examples:

```text
Permission error
Stock validation error
Failed report load
```

## High

Examples:

```text
Payment failure
ERP posting failure
Stock mismatch
Closing mismatch
```

## Critical

Examples:

```text
Database down
Payment duplication
Inventory corruption
Unauthorized access
Production outage
```

---

# 36. Definition of Done

Error handling is acceptable when:

* Users see friendly messages.
* Developers see useful logs.
* Request ID exists.
* Sensitive data is hidden.
* 401 and 403 are handled differently.
* Network errors are clear.
* Validation errors show near fields.
* Critical write operations are not retried unsafely.
* Payment errors do not create duplicate deductions.
* Inventory errors do not corrupt stock.
* ERP errors are retryable and auditable.

---

# 37. Final Rule

AAHAR must never fail silently.

Every error must be:

```text
Caught
Classified
Logged
Displayed clearly
Auditable where required
Recoverable where possible
```

Production users should always know:

```text
What happened
What they should do next
Who to contact if needed
```
