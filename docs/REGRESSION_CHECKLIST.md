# AAHAR - Regression Checklist

Version: 1.0
Product Name: AAHAR
Document Type: Regression Testing Checklist
Status: Mandatory before every Git commit, phase completion, and production release

---

# 1. Purpose

This checklist ensures that new development does not break already working AAHAR functionality.

AAHAR is now a multi-module hospital Food & Cafeteria Management Platform. Every new feature can affect:

* Authentication
* RBAC
* Master Data
* Inventory
* Kitchen
* Transfers
* Restaurant Stock
* Future POS
* Future Payments
* Future ERP

Therefore, regression testing is mandatory.

---

# 2. When To Use This Checklist

Run this checklist:

```text
Before every Git commit
Before every Git push
After every Codex implementation
After every database migration
After every seed change
After every UI change
Before moving to next phase
Before UAT
Before production deployment
```

---

# 3. Standard Commands

Before manual testing, run:

```powershell
pnpm db:generate
pnpm db:seed
pnpm lint
pnpm build
```

If database schema changed:

```powershell
pnpm db:migrate
```

If Prisma EPERM occurs on Windows:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm db:generate
```

Start app:

```powershell
pnpm dev
```

---

# 4. Health Check

Verify these URLs:

```text
http://localhost:3000
http://localhost:4001/api/v1/health
http://localhost:4002/api/v1/health
http://localhost:4003/api/v1/health
```

Expected:

```text
Admin Portal opens
Auth Service = OK
User Service = OK
Organization Service = OK
Database = OK
Redis = OK
```

---

# 5. Authentication Regression

## 5.1 Login

Test:

```text
URL: /auth/login
Mobile: 9999999999
OTP: 000000
```

Checklist:

* [ ] Login page opens.
* [ ] Send OTP works.
* [ ] OTP verification works.
* [ ] Dashboard opens after login.
* [ ] Token is stored correctly.
* [ ] User role is loaded.
* [ ] Permissions are loaded.
* [ ] Logout works.
* [ ] After logout, protected pages redirect to login.

---

## 5.2 Session Refresh

Checklist:

* [ ] Refresh browser after login.
* [ ] User remains logged in.
* [ ] Sidebar loads correctly.
* [ ] Dashboard loads correctly.
* [ ] API calls still include Bearer token.
* [ ] No stale permission issue.
* [ ] If token is invalid, user is redirected to login.

---

## 5.3 Stale Session Check

After seed or permission changes:

* [ ] Logout.
* [ ] Login again.
* [ ] New permissions are reflected.
* [ ] Old token does not cause broken access.

---

# 6. Swagger Regression

Verify Swagger opens:

```text
http://localhost:4001/api/docs
http://localhost:4002/api/docs
http://localhost:4003/api/docs
```

Checklist:

* [ ] Auth Swagger opens.
* [ ] User Swagger opens.
* [ ] Organization Swagger opens.
* [ ] New APIs appear in Swagger.
* [ ] Protected APIs show Authorize option.
* [ ] Request DTOs are visible.
* [ ] Error responses are documented.

---

# 7. RBAC Regression

Use Super Admin token.

Checklist:

* [ ] User can access Hospital APIs.
* [ ] User can access Master APIs.
* [ ] User can access Inventory APIs.
* [ ] User can access Kitchen APIs.
* [ ] Invalid token returns 401.
* [ ] Missing permission returns 403.
* [ ] APIs are not accidentally public.

---

# 8. Organization Regression

## 8.1 Hospital

Checklist:

* [ ] Create Hospital.
* [ ] List Hospitals.
* [ ] Edit Hospital.
* [ ] Delete / deactivate Hospital.
* [ ] Duplicate hospital code is blocked.
* [ ] Created Date Time shows.
* [ ] Updated Date Time shows.

---

## 8.2 Store

Checklist:

* [ ] Create Store with Hospital only.
* [ ] Store creation does not require Location.
* [ ] List Stores.
* [ ] Edit Store.
* [ ] Delete / deactivate Store.
* [ ] Duplicate Store Code is blocked.

---

## 8.3 Kitchen

Checklist:

* [ ] Create Kitchen with Hospital only.
* [ ] Kitchen creation does not require Location.
* [ ] List Kitchens.
* [ ] Edit Kitchen.
* [ ] Delete / deactivate Kitchen.
* [ ] Duplicate Kitchen Code is blocked.

---

## 8.4 Restaurant

Checklist:

* [ ] Create Restaurant with Hospital.
* [ ] Store mapping optional.
* [ ] Kitchen mapping optional.
* [ ] Location is not mandatory.
* [ ] List Restaurants.
* [ ] Edit Restaurant.
* [ ] Delete / deactivate Restaurant.
* [ ] Duplicate Restaurant Code is blocked.

---

## 8.5 Counter

Checklist:

* [ ] Create Counter under Restaurant.
* [ ] List Counters.
* [ ] Edit Counter.
* [ ] Delete / deactivate Counter.
* [ ] Duplicate Counter Code is blocked.

---

# 9. Master Data Regression

## 9.1 Item Category

Checklist:

* [ ] Create Item Category.
* [ ] List Item Categories.
* [ ] Edit Item Category.
* [ ] Delete Item Category.
* [ ] Duplicate protection works.

Duplicate tests:

```text
Veg Thali
Veg-Thali
VEG_THALI
```

Expected:

```text
Similar category already exists
```

---

## 9.2 Item Master

Checklist:

* [ ] Create MRP Item.
* [ ] Create READYMADE Item.
* [ ] Create LIVE Item.
* [ ] Item Code auto-generates.
* [ ] Item Code format is ITM0001, ITM0002, etc.
* [ ] Item Code is read-only.
* [ ] List Items.
* [ ] Edit Item.
* [ ] Delete Item.
* [ ] Duplicate item protection works.

Duplicate tests:

```text
Veg Thali
Veg-Thali
VEG_THALI
```

Expected:

```text
Similar item already exists
```

---

## 9.3 Employee Master

Checklist:

* [ ] Create Employee.
* [ ] List Employees.
* [ ] Edit Employee.
* [ ] Delete Employee.
* [ ] Validate Employee API works.
* [ ] Eligible For Discount flag works.

---

## 9.4 Time Slot

Checklist:

* [ ] Seeded time slots exist:

  * Breakfast
  * Lunch
  * Dinner
  * All Time
  * 24x7
* [ ] Create Time Slot.
* [ ] Edit Time Slot.
* [ ] Delete Time Slot.
* [ ] Duplicate time slot name is blocked.

---

# 10. Mapping Regression

## 10.1 Store Item Mapping

Checklist:

* [ ] Store Item page opens.
* [ ] Only MRP items appear.
* [ ] Map MRP item to Store.
* [ ] Duplicate Store + Item mapping is blocked.
* [ ] READYMADE item cannot be mapped to Store.
* [ ] LIVE item cannot be mapped to Store.

---

## 10.2 Kitchen Item Mapping

Checklist:

* [ ] Kitchen Item page opens.
* [ ] Only READYMADE items appear.
* [ ] Map READYMADE item to Kitchen.
* [ ] Duplicate Kitchen + Item mapping is blocked.
* [ ] MRP item cannot be mapped to Kitchen.
* [ ] LIVE item cannot be mapped to Kitchen.

---

## 10.3 Restaurant Menu Mapping

Checklist:

* [ ] Restaurant Menu page opens.
* [ ] MRP item can be mapped.
* [ ] READYMADE item can be mapped.
* [ ] LIVE item can be mapped.
* [ ] Duplicate Restaurant + Item mapping is blocked.
* [ ] Multiple Time Slots can be selected.
* [ ] Days of Week checkboxes work.
* [ ] Position Type works:

  * First
  * Last
  * Before Item
  * After Item
* [ ] Display order is not manually entered by user.
* [ ] UI shows item names for ordering.

---

# 11. GRN Regression

## 11.1 GRN Create

Precondition:

```text
MRP Item exists
MRP Item is mapped to Store
```

Checklist:

* [ ] GRN page opens.
* [ ] Create GRN page opens.
* [ ] Select Hospital.
* [ ] Select Store.
* [ ] Only mapped MRP items appear.
* [ ] Add item line.
* [ ] Add batch row.
* [ ] Batch Number required.
* [ ] Expiry Date required.
* [ ] Received Qty works.
* [ ] Accepted Qty works.
* [ ] Rejected Qty auto-calculates.
* [ ] Save Draft works.
* [ ] Post to Stock works.

---

## 11.2 GRN Validation

Checklist:

* [ ] Expired batch cannot be accepted.
* [ ] Accepted Qty + Rejected Qty = Received Qty.
* [ ] Non-MRP item cannot be added to GRN.
* [ ] Unmapped MRP item cannot be added.
* [ ] Posted GRN cannot be edited.
* [ ] Cancelled GRN cannot be posted.

---

## 11.3 Store Stock

Checklist:

* [ ] Store Stock page opens.
* [ ] Posted GRN quantity appears.
* [ ] Batch Number appears.
* [ ] Expiry Date appears.
* [ ] Available Qty is correct.
* [ ] Reserved Qty is correct.
* [ ] Status badge appears:

  * Available
  * Near Expiry
  * Expired
  * Out Of Stock

---

# 12. Store Transfer Regression

## 12.1 Store to Restaurant Transfer

Precondition:

```text
Store Stock exists from GRN
```

Checklist:

* [ ] Transfer page opens.
* [ ] Create Transfer page opens.
* [ ] Select Source Type = Store.
* [ ] Select Store.
* [ ] Select Restaurant.
* [ ] Store stock items appear.
* [ ] Batch Number appears.
* [ ] Expiry Date appears.
* [ ] Available Qty appears.
* [ ] Transfer Qty cannot exceed available stock.
* [ ] Save Draft works.
* [ ] Dispatch works.
* [ ] Store stock reduces after dispatch.

---

## 12.2 Store Transfer Acknowledgement

Checklist:

* [ ] Pending transfer appears.
* [ ] Accept Full works.
* [ ] Accept Partial works.
* [ ] Reject Full works.
* [ ] Accepted Qty + Rejected Qty = Sent Qty.
* [ ] Accepted qty increases Restaurant Stock.
* [ ] Rejected qty returns to Store Stock.
* [ ] Audit log is created.

---

# 13. Kitchen Production Regression

## 13.1 Kitchen Production

Precondition:

```text
READYMADE item exists
READYMADE item is mapped to Kitchen
```

Checklist:

* [ ] Kitchen Production page opens.
* [ ] Create Production page opens.
* [ ] Select Hospital.
* [ ] Select Kitchen.
* [ ] Only mapped READYMADE items appear.
* [ ] Produced Qty works.
* [ ] Wastage Qty works.
* [ ] Accepted Qty calculates correctly.
* [ ] Save Draft works.
* [ ] Post Production works.
* [ ] Posted production cannot be edited.
* [ ] Cancelled production cannot be posted.

---

## 13.2 Kitchen Stock

Checklist:

* [ ] Kitchen Stock page opens.
* [ ] Posted production appears in Kitchen Stock.
* [ ] Available Qty = Accepted Qty.
* [ ] Wastage Qty does not increase stock.
* [ ] Business Date appears.
* [ ] Status badge appears.

---

# 14. Kitchen Transfer Regression

## 14.1 Kitchen to Restaurant Transfer

Precondition:

```text
Kitchen Stock exists from posted production
```

Checklist:

* [ ] Transfer page opens.
* [ ] Select Source Type = Kitchen.
* [ ] Select Kitchen.
* [ ] Select Restaurant.
* [ ] Kitchen stock items appear.
* [ ] Only READYMADE items appear.
* [ ] Available Qty appears.
* [ ] Business Date appears.
* [ ] Transfer Qty cannot exceed available stock.
* [ ] Save Draft works.
* [ ] Dispatch works.
* [ ] Kitchen stock reduces after dispatch.

---

## 14.2 Kitchen Transfer Acknowledgement

Checklist:

* [ ] Pending transfer appears.
* [ ] Accept Full works.
* [ ] Accept Partial works.
* [ ] Reject Full works.
* [ ] Accepted qty increases Restaurant Stock.
* [ ] Rejected qty returns to Kitchen Stock.
* [ ] Restaurant Stock shows Source = Kitchen.
* [ ] Audit log is created.

---

# 15. Restaurant Stock Regression

Checklist:

* [ ] Restaurant Stock page opens.
* [ ] MRP items from Store transfer appear.
* [ ] READYMADE items from Kitchen transfer appear.
* [ ] Available Qty is correct.
* [ ] Batch appears for MRP.
* [ ] Expiry appears for MRP.
* [ ] Source appears:

  * Store
  * Kitchen
* [ ] Status badge appears.
* [ ] Search/filter works.

---

# 16. UI Regression

Checklist:

* [ ] Sidebar opens.
* [ ] Sidebar navigation works.
* [ ] Header renders.
* [ ] Theme toggle works if implemented.
* [ ] Login branding works.
* [ ] Dashboard opens.
* [ ] Tables show pagination.
* [ ] Empty states show correctly.
* [ ] Loading states show correctly.
* [ ] Toast success/error messages work.
* [ ] Forms are responsive.
* [ ] No technical text is shown to users:

  * JWT
  * RBAC
  * API
  * Sprint

---

# 17. API Regression

For every new API:

Checklist:

* [ ] API appears in Swagger.
* [ ] DTO schema appears.
* [ ] Success response follows standard format.
* [ ] Error response follows standard format.
* [ ] Invalid request gives validation error.
* [ ] Unauthorized request returns 401.
* [ ] Forbidden request returns 403.
* [ ] Pagination works for list APIs.
* [ ] Search works where applicable.
* [ ] Filter works where applicable.

---

# 18. Database Regression

Checklist:

* [ ] Migration exists.
* [ ] Migration applied successfully.
* [ ] Seed runs successfully.
* [ ] Prisma generate passes.
* [ ] No duplicate enum conflicts.
* [ ] No broken relation.
* [ ] No required field breaks existing data.
* [ ] Soft delete works.
* [ ] CreatedAt and UpdatedAt work.

---

# 19. Git Checklist

Before commit:

```powershell
git status
```

Checklist:

* [ ] No `.env` files staged.
* [ ] No `node_modules` staged.
* [ ] No `.next` folder staged.
* [ ] No `.turbo` folder staged.
* [ ] No `*.tsbuildinfo` staged.
* [ ] Migration files are staged.
* [ ] Source files are staged.
* [ ] Docs are staged if updated.

Commit:

```powershell
git add .
git commit -m "message"
git push origin branch-name
```

---

# 20. Current Completed Module Checklist

Mark after every regression pass:

```text
[ ] Login
[ ] Dashboard
[ ] Hospital
[ ] Store
[ ] Kitchen
[ ] Restaurant
[ ] Counter
[ ] Item Category
[ ] Item Master
[ ] Employee Master
[ ] Time Slot
[ ] Store Item Mapping
[ ] Kitchen Item Mapping
[ ] Restaurant Menu Mapping
[ ] GRN
[ ] Store Stock
[ ] Store Transfer
[ ] Store Transfer Acknowledgement
[ ] Restaurant Stock
[ ] Kitchen Production
[ ] Kitchen Stock
[ ] Kitchen Transfer
[ ] Kitchen Transfer Acknowledgement
```

---

# 21. Rule

If any regression test fails:

```text
Do not commit.
Do not move to next phase.
Fix the issue first.
Run regression again.
```

This rule is mandatory for AAHAR because future modules such as POS, Payments, Closing, and ERP depend on the correctness of earlier modules.

---

# 22. Future POS Regression

Checklist:

- [ ] POS screen opens.
- [ ] Restaurant selection works.
- [ ] Counter selection works.
- [ ] Customer type selection works.
- [ ] Employee ID validation works for staff discount.
- [ ] MRP items show only if restaurant stock exists.
- [ ] READYMADE items show only if restaurant stock exists.
- [ ] LIVE items show based on menu availability.
- [ ] Zero-stock items cannot be sold.
- [ ] Cart add/remove/update quantity works.
- [ ] Discount calculation works.
- [ ] GST calculation works.
- [ ] Payment mode selection works.
- [ ] Invoice generation works.
- [ ] KOT generation works where required.
- [ ] Stock deduction happens only after confirmed sale.
- [ ] Cancellation rules work.

---

# 23. Future Order Engine Regression

Checklist:

- [ ] ROOM_CALL order works.
- [ ] ROOM_QR order works.
- [ ] COUNTER_POS order works.
- [ ] TABLE_QR order works.
- [ ] EMPLOYEE_MOBILE order works.
- [ ] EMPLOYEE_QR order works.
- [ ] EMPLOYEE_COUNTER order works.
- [ ] All order sources use one common order engine.
- [ ] Order status history is created.
- [ ] Order cancellation is audited.
- [ ] Business date is captured.
- [ ] Customer type is captured.
- [ ] Rate type is applied correctly.

---

# 24. Future KOT Regression

Checklist:

- [ ] KOT is generated for LIVE items.
- [ ] KOT is generated for configured READYMADE items.
- [ ] KOT is not generated for MRP items unless configured.
- [ ] Kitchen dashboard shows new KOT.
- [ ] Kitchen can accept KOT.
- [ ] Kitchen can mark Preparing.
- [ ] Kitchen can mark Ready.
- [ ] Kitchen can mark Dispatched.
- [ ] KOT status updates order status.
- [ ] Special instructions appear correctly.

---

# 25. Future Payment Regression

Checklist:

- [ ] Cash payment works.
- [ ] Card payment works.
- [ ] UPI payment works.
- [ ] Pine Labs payment works.
- [ ] PayU payment works.
- [ ] Razorpay payment works.
- [ ] Complimentary payment works with approval.
- [ ] One active payment attempt per order.
- [ ] Duplicate payment is blocked.
- [ ] Payment callback is idempotent.
- [ ] Gateway status is verified server-side.
- [ ] Failed payment does not create invoice as paid.
- [ ] Unknown payment goes to reconciliation.
- [ ] Refund flow is audited.

---

# 26. Future Delivery Regression

Checklist:

- [ ] Supervisor can assign delivery operator.
- [ ] Delivery operator can accept task.
- [ ] Delivery operator can mark picked up.
- [ ] Delivery operator can mark out for delivery.
- [ ] Delivery operator can mark delivered.
- [ ] Failed delivery can be marked.
- [ ] Room delivery requires supervisor assignment.
- [ ] Counter pickup does not require delivery operator.
- [ ] Delivery status updates order status.

---

# 27. Future Closing Regression

Checklist:

- [ ] Restaurant closing screen opens.
- [ ] Expected sale amount is calculated.
- [ ] Cash declared amount is captured.
- [ ] Card declared amount is captured.
- [ ] UPI declared amount is captured.
- [ ] Pine Labs declared amount is captured.
- [ ] PayU/Razorpay declared amount is captured.
- [ ] Actual collection amount is calculated.
- [ ] Difference amount is calculated.
- [ ] Matched closing can be submitted.
- [ ] Mismatch requires reason.
- [ ] Mismatch requires supervisor approval.
- [ ] Approved closing is locked.
- [ ] Closing becomes ready for ERP only after approval.

---

# 28. Future Wastage Regression

Checklist:

- [ ] Breakage wastage works.
- [ ] Expired stock wastage works.
- [ ] Day-end READYMADE wastage works.
- [ ] Spoiled item wastage works.
- [ ] Customer return wastage works.
- [ ] Wastage requires supervisor approval where configured.
- [ ] Approved wastage reduces stock.
- [ ] Wastage creates stock ledger.
- [ ] Wastage is audited.
- [ ] Expired MRP wastage tracks batch and expiry.

---

# 29. Future ERP/SUN Regression

Checklist:

- [ ] Sales posting payload is generated.
- [ ] Payment posting payload is generated.
- [ ] Discount posting payload is generated.
- [ ] Wastage posting payload is generated.
- [ ] Closing posting payload is generated.
- [ ] Refund posting payload is generated.
- [ ] Only approved/final transactions are marked Ready To Post.
- [ ] Failed payments are not posted.
- [ ] Cancelled orders are not posted.
- [ ] Unapproved closing mismatches are not posted.
- [ ] Unapproved wastage is not posted.
- [ ] Duplicate ERP posting is blocked.
- [ ] Failed ERP posting can be retried.
- [ ] ERP attempt logs are created.

---

# 30. Future Reports Regression

Checklist:

- [ ] Hospital sales report works.
- [ ] Location-wise sales report works.
- [ ] Restaurant-wise sales report works.
- [ ] Counter-wise sales report works.
- [ ] Item-wise sales report works.
- [ ] Payment mode report works.
- [ ] GST report works.
- [ ] Discount report works.
- [ ] Employee discount report works.
- [ ] GRN report works.
- [ ] Batch-wise stock report works.
- [ ] Near expiry report works.
- [ ] Expired stock report works.
- [ ] Kitchen production report works.
- [ ] Transfer report works.
- [ ] Acknowledgement report works.
- [ ] Wastage report works.
- [ ] Closing report works.
- [ ] Mismatch report works.
- [ ] ERP posting report works.
- [ ] Audit log report works.
- [ ] Excel/CSV export works.