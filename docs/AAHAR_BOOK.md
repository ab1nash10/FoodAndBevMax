# AAHAR Master Knowledge Base

Version: 1.0
Last Updated Context: Current development state after Phase 4.6F Global Location Context and Item Price Master fixes
Purpose: Preserve the complete AAHAR project knowledge so the project can continue with any developer or AI tool even if the current chat history is unavailable.

---

## 1. Project Summary

AAHAR is a hospital-based Food and Cafeteria Management Platform for Max Healthcare style operations.

AAHAR manages the complete lifecycle:

```text
Location setup
-> Store/F&B setup
-> Kitchen setup
-> Restaurant setup
-> POS device/payment machine setup
-> Item category and item master
-> Item price master
-> Menu and item mapping
-> MRP procurement through manual GRN
-> Store stock
-> Kitchen production
-> Kitchen stock
-> Store/Kitchen transfer to Restaurant
-> Restaurant acknowledgement
-> Restaurant stock
-> Restaurant operations
-> POS billing
-> Order/KOT
-> Payments
-> Closing
-> Supervisor approval
-> ERP/SUN posting
-> Reports and audit
```

The system is being developed as an enterprise-grade hospital F&B operations platform, not a simple cafeteria billing app.

---

## 2. Current Product Status

### Completed Major Phases

```text
Phase 1 - Organization/Foundation: Completed
Phase 2A - Item Category and Item Master: Completed
Phase 2B - Employee Master: Completed
Phase 2C - Mapping Foundation: Completed
Phase 3A - Manual GRN and Store Stock: Completed
Phase 3B - Store to Restaurant Transfer and Restaurant Stock: Completed
Phase 4A - Kitchen Production and Kitchen Stock: Completed
Phase 4B - Kitchen to Restaurant Transfer: Completed
Phase 4.5 - Platform Stabilization: Completed
Phase 4.6A - Restaurant Edit and Location/Store/Kitchen Status Controls: Completed
Phase 4.6B - Item/Category/Mapping/Inventory Filters and Active Controls: Completed
Phase 4.6C - Item Price Master: Completed
Phase 4.6F - Global Location Context: Completed
Restaurant List UI Refinement: Completed
Transfer UI FEFO Item-First Selection: Completed
```

### Pending / Next Major Phases

```text
Phase 4.6D - POS Device Master and Payment Machine Master: Delivered
Phase 4.6E - UI Foundation and Dashboard Upgrade: Pending
Phase 5A - Restaurant Operations / Menu Availability: Pending
Phase 5B - POS Billing: Pending
Phase 6 - Common Order Engine and KOT: Pending
Phase 7 - Payments and Reconciliation: Pending
Phase 8 - Closing and Supervisor Approval: Pending
Phase 9 - Wastage and Day-End Handling: Pending
Phase 10 - ERP/SUN Integration: Pending
Phase 11 - Reports: Pending
Phase 12 - Sandbox/UAT/Production Hardening: Pending
```

### Approximate Completion

```text
Backend foundation: about 80 percent
Business logic foundation: about 80 percent
Database design: about 95 percent foundation complete
UI foundation: about 40 percent
Production readiness: about 60 percent foundation complete
Overall AAHAR: about 70 percent for foundation and pre-POS modules
```

---

## 3. Technology Stack

### Frontend

```text
Next.js
TypeScript
TailwindCSS
ShadCN UI
Lucide React
React Hook Form
Zod
TanStack Query
```

### Backend

```text
NestJS
TypeScript
Prisma ORM
PostgreSQL
Redis
Swagger
JWT
RBAC
```

### Development Tools

```text
pnpm
Turborepo
Docker Desktop
Docker Compose
VS Code
GitHub
Render attempted for demo deployment
Future preferred production hosting: Azure
```

---

## 4. Repository and Branching

GitHub repo:

```text
https://github.com/knowsudhansh/aahar
```

Current active development branch:

```text
feature/phase-2-master-data
```

Main branch holds stable Phase 1 foundation. Current feature branch has most of the latest Phase 2, 3, 4 work.

Recommended branch strategy:

```text
main = stable code
feature/* = development branches
release/* = UAT release candidates
hotfix/* = urgent fixes
```

---

## 5. Current Local Environment

Local URLs:

```text
Admin Portal: http://localhost:3000
Auth Service: http://localhost:4001
User Service: http://localhost:4002
Organization Service: http://localhost:4003
Auth Swagger: http://localhost:4001/api/docs
User Swagger: http://localhost:4002/api/docs
Organization Swagger: http://localhost:4003/api/docs
```

Demo login:

```text
Mobile: 9999999999
OTP: 000000
```

Local database:

```text
PostgreSQL running through Docker
Database: aahar
User: aahar
Port: 5433
```

Local Redis:

```text
Redis running through Docker
Port: 6379
```

Daily startup:

```powershell
cd C:\Users\SudhanshuV_Ext\Desktop\aahar
docker ps
pnpm dev
```

If stale Node issue:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

If Next.js Turbopack runtime error:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force frontend/apps/admin-portal/.next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .turbo -ErrorAction SilentlyContinue
pnpm dev
```

If Prisma EPERM on Windows:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm db:generate
```

View database data:

```powershell
pnpm exec prisma studio --schema prisma/schema.prisma
```

Prisma Studio URL:

```text
http://localhost:5555
```

---

## 6. Important Terminology Decision

Originally the top-level entity was called Hospital.

Business later requested this to be called Location in the UI.

Current decision:

```text
Business UI term: Location
Internal backend/database term: Hospital / hospitalId
```

Reason: many existing modules depend on hospitalId. Renaming all backend references now could break GRN, stock, transfers, kitchen production, restaurant stock, and future POS. Therefore, UI uses Location while internal code can keep hospitalId.

---

## 7. Core Business Hierarchy

Current structure:

```text
Location (internal Hospital)
|-- Store/F&B
|-- Kitchen
|-- Restaurant
|-- POS Devices
|-- Payment Machines
```

When a new Location is created:

```text
Default Main Store is auto-created
Default Main Kitchen is auto-created
```

Additional stores and kitchens can be manually created later.

---

## 8. Item Type Flows

AAHAR has three item types.

### MRP / Packed Item Flow

```text
Item Master
-> Store Item Mapping
-> GRN
-> Accepted batch quantity
-> Store Stock
-> Store to Restaurant Transfer
-> Restaurant Acknowledgement
-> Restaurant Stock
-> Future POS Sale
```

Examples:

```text
Water bottle
Coke
Chips
Packed juice
```

Rules:

```text
MRP item requires batch number
MRP item requires expiry date
GRN only accepts MRP items mapped to the selected store
Stock remains batch-wise internally
Transfer UI shows item-first selection and internally allocates batches using FEFO
```

### READYMADE / Kitchen Item Flow

```text
Item Master
-> Kitchen Item Mapping
-> Kitchen Production
-> Post Production
-> Kitchen Stock
-> Kitchen to Restaurant Transfer
-> Restaurant Acknowledgement
-> Restaurant Stock
-> Future POS Sale
```

Examples:

```text
Samosa
Pakora
Sandwich
Poha
Thali
```

Rules:

```text
Only READYMADE items can be mapped to Kitchen
Only READYMADE items can be produced
Produced quantity minus wastage quantity becomes accepted stock
Kitchen stock transfers to Restaurant
```

### LIVE Item Flow

```text
Item Master
-> Restaurant Menu Mapping
-> Time slot/day availability
-> Future Order/KOT
```

Examples:

```text
Dosa
Paratha
Chole Bhature
Fresh meal
```

Rules:

```text
LIVE items do not need stock in current phase
LIVE items require menu availability and future KOT
```

---

## 9. Completed Functional Modules

### 9.1 Authentication and RBAC

Completed:

```text
OTP login
JWT access token
Refresh token foundation
RBAC permissions
Roles
User service
Swagger
Session stabilization
Global API error handling
```

Important stabilization added:

```text
Logout clears token, cache, user state, permissions, local/session storage
401 attempts refresh once, then logs out if refresh fails
403 shows permission denied without logging user out
React Query cache invalidation added for many mutations
Friendly error messages added
Global 404/error/forbidden pages added
```

### 9.2 Location Foundation

Completed:

```text
Location master business-facing UI
Internal Hospital model preserved
Auto-create Main Store and Main Kitchen on Location creation
Active/inactive toggle
Location freeze behavior
Filters by status/state/city/payment option
Global Location Context selector
```

Global Location Context:

```text
Top-right location pin icon
Popover opens with All Locations and active Locations
Selecting Location scopes supported pages by hospitalId
All Locations means no hospitalId filter
Selection persists in browser storage
Cleared on logout/session reset
```

### 9.3 Store Foundation

Completed:

```text
Store master
Store Code auto-generation: STR0001, STR0002, ...
No Store Type field in UI
No Address field in UI
Active/inactive toggle
Inactive store blocks new GRN/post/transfer operations
```

### 9.4 Kitchen Foundation

Completed:

```text
Kitchen master
Kitchen Code auto-generation: KIT0001, KIT0002, ...
Opening/Closing Time removed from UI
Active/inactive toggle
Inactive kitchen blocks production/transfer operations
```

### 9.5 Restaurant Master

Completed:

```text
Restaurant create redesign
Restaurant edit route implemented
Restaurant list UI refined with thumbnail/name/location/options/actions
Restaurant Code auto-generation: RST0001, RST0002, ...
Store/Kitchen fields removed from Restaurant create/edit
Restaurant supports legal/GST/banking/options/Sodexo/ERP fields
```

Current restaurant create/edit sections:

```text
Basic Information
FSSAI
Images
GST Information
Banking Information
More Options
Sodexo Information
ERP Fields
```

Restaurant options include:

```text
Offline
Open 24x7
Veg Only
Takeaway
Delivery
Home Delivery
At Table Dining
In Room Dining
In Car Dining
POS Orders
Online Orders
Inventory
```

Restaurant list should show:

```text
Restaurant name with thumbnail
Location display text
Online toggle
Active/options badges
Edit
Delete
Print QR placeholder
Customer Orders Activity placeholder
```

### 9.6 Item Category Master

Completed:

```text
Global Item Category Master
Create/list/edit/delete
Active/inactive toggle
Filters
Duplicate protection with normalized name
```

Duplicate examples blocked:

```text
Veg Thali
Veg-Thali
VEG_THALI
```

### 9.7 Item Master

Completed:

```text
Global Item Master
Item Code auto-generation: ITM0001, ITM0002, ...
Create/list/edit/delete
MRP/READYMADE/LIVE item types
VEG/NON_VEG/EGGETARIAN type
HSN code
Preparation time
Active/inactive toggle
Duplicate protection
```

Inactive item is blocked from new mappings and new operations but historical data remains visible.

### 9.8 Employee Master

Completed:

```text
Global Employee Master
Employee Code
Employee Name
Department
Designation
Mobile
Eligible For Discount
Active
Validate employee API
```

Future: employee data may come from HR/employee API instead of manual entry.

### 9.9 Time Slot Master

Completed:

```text
Time Slot Master
Breakfast
Lunch
Dinner
All Time
24x7
Active/inactive
Duplicate protection
```

### 9.10 Store Item Mapping

Completed:

```text
Maps MRP items to Stores
Only MRP allowed
Duplicate mapping blocked
Active/inactive toggle
Filters
Inactive mapping blocks GRN selection
```

### 9.11 Kitchen Item Mapping

Completed:

```text
Maps READYMADE items to Kitchens
Only READYMADE allowed
Duplicate mapping blocked
Active/inactive toggle
Filters
Inactive mapping blocks Kitchen Production selection
```

### 9.12 Restaurant Menu Mapping

Completed:

```text
Maps MRP, READYMADE, LIVE items to Restaurant menu
Multiple time slots supported
Days of week supported as array
Position Type supported: First, Last, Before Item, After Item
Display order kept internal
Active/inactive toggle
Available/unavailable toggle
Duplicate restaurant+item active mapping blocked
```

### 9.13 Item Price Master

Completed:

```text
Location-level price
Optional restaurant-specific price
Rate types: NORMAL, STAFF, ROOM, COUNTER
Tax Inclusive flag
GST Percent dropdown: 0, 5, 12, 18
Effective From / Effective To
Active/inactive
Overlap protection
Resolve price API
```

Price resolution priority:

```text
1. Restaurant-specific active price
2. Location-level active price
3. Item basePrice/MRP fallback
4. Price missing status
```

For tax inclusive:

```text
Customer pays entered price
Base amount = price / (1 + GST percent / 100)
GST amount = price - base amount
```

For tax exclusive:

```text
Customer pays price + GST
```

### 9.14 Manual GRN

Completed:

```text
Manual GRN entry
GRN number auto-generation
GRN header
GRN lines
GRN batches
Batch number mandatory
Expiry date mandatory
Accepted/rejected quantity
Post to stock
Stock ledger
Stock balance
```

Rules:

```text
Only MRP items allowed
Item must be mapped to store
Accepted + rejected = received
Expired batch cannot be accepted
Only accepted quantity increases store stock
Posted GRN cannot be edited
Cancelled GRN cannot be posted
```

### 9.15 Store Stock

Completed:

```text
Store stock from posted GRN
Batch-wise stock
Expiry-aware stock
Stock balances
Stock ledgers
Filters
```

Pending UX improvement:

```text
Store Stock should group by Store + Item in one row and expand to show batch details.
Database should remain batch-wise.
```

### 9.16 Store to Restaurant Transfer

Completed:

```text
Transfer number auto-generation: TRF0001, TRF0002, ...
Store source
Restaurant destination
Transfer draft
Dispatch
Batch-wise internal transfer lines
FEFO item-first transfer UI
Restaurant acknowledgement
Reject quantity returns to Store
Accepted quantity increases Restaurant Stock
```

Transfer UI improvement completed:

```text
User selects item and quantity
UI shows total available quantity
UI shows FEFO batch allocation preview
UI internally sends batch-wise transfer lines
Manual batch selection optional
```

### 9.17 Restaurant Stock

Completed:

```text
Restaurant stock receives accepted MRP from Store transfer
Restaurant stock receives accepted READYMADE from Kitchen transfer
Restaurant Stock page available
Filters
Source Store/Kitchen visible
```

### 9.18 Kitchen Production and Kitchen Stock

Completed:

```text
Kitchen production header/lines
Production number auto-generation: PRD0001, PRD0002, ...
Only READYMADE items mapped to kitchen appear
Produced quantity
Wastage quantity
Accepted quantity
Post production
Kitchen stock ledger
Kitchen stock balance
```

### 9.19 Kitchen to Restaurant Transfer

Completed:

```text
Existing transfer engine reused
SourceType = KITCHEN
DestinationType = RESTAURANT
READYMADE items only
Dispatch reduces Kitchen Stock
Acknowledgement increases Restaurant Stock
Rejected quantity returns to Kitchen
```

---

## 10. Pending High-Priority Modules

### 10.1 Phase 4.6D - POS Device Master and Payment Machine Master (Delivered)

Business requested Counter to be renamed to POS/POS Devices.

Structure:

```text
POS
|-- POS Devices
|-- Payment Machines
```

POS Device fields:

```text
Name
Code
Active
Location/Hospital
Restaurants multi-select
Entity placeholder
Host Name
KOT Print toggle
Invoice Print toggle
```

POS Device to Restaurant relation:

```text
Many-to-many
One POS device can map to multiple restaurants
One restaurant can use multiple POS devices
```

Tables:

```text
pos_devices
pos_device_restaurants
```

Payment Machine fields:

```text
Location/Hospital
POS Device
Status
Name
Serial Number
Pine Labs Merchant ID
Pine Labs Security Token
Pine Labs IMEI
Pine Labs Merchant Store POS Code
Primary UPI: PHONEPE, UPI_PAYTM, UPI_SALE, UPI_BHARAT_QR (BHARATPE, GOOGLE_PAY, OTHER retained)
Default toggle (one live default per POS device)
```

Security:

```text
Pine Labs Security Token is sensitive
Do not log token
Mask token in UI
In production move to Key Vault or encrypted field
```

BA validations implemented:

```text
Host name must be unique across live POS devices
  Duplicate save is rejected naming the restaurants already tagged to that host name
POS device name/code/host name accept alphanumerics plus space . - _
Serial number, Pinelab merchant id and store POS code are digits only
Pinelab IMEI is alphanumeric
Only one live payment machine per POS device can hold the Default flag
  Turning Default on demotes the previous holder in the same transaction and audits both rows
  A partial unique index backs the rule at the database level
Restaurant mappings are only rewritten when the caller sends a list,
  or when a location change invalidates them
```

Screen behaviour:

```text
Create and edit open as pop-ups over the grid
Status, KOT Print, Invoice Print, Active and Default render as toggle buttons
  and write through directly from the grid
Restaurant's Accessibility is a per-row action opening a multi-select pop-up
Grid pages at 20 records by default with a 10/20/25/50 page-size selector
Search covers every column shown in the grid
```

Notes:

```text
Interactive primitives (Modal, Toggle) live in components/ui-controls.tsx marked 'use client'
  so server-rendered pages keep importing components/ui.tsx without entering the client bundle
```

### 10.2 Phase 4.6E - UI Foundation and Dashboard Upgrade

Goals:

```text
Max Healthcare branding
AAHAR logo integration
Favicon
Modern light theme
Optional dark theme
Modern sidebar/topbar
Dashboard V1
Reusable UI components
Responsive layout
KPI cards
Charts/placeholder charts
Status badges
Modern tables
Modern forms
```

Brand assets desired:

```text
Max logo: frontend/apps/admin-portal/public/brand/max-logo.svg
Max favicon: frontend/apps/admin-portal/public/brand/max-favicon.ico
AAHAR logo: frontend/apps/admin-portal/public/brand/aahar-logo.png
```

UI color direction:

```text
Primary Max Blue: #0B5CAD
Deep Navy: #0F172A
Primary Teal: #0F766E
Emerald: #10B981
Mint Background: #ECFDF5
Page Background: #F8FAFC
Card Background: #FFFFFF
Border: #E2E8F0
Text Primary: #0F172A
Text Secondary: #64748B
Warning: #F59E0B
Danger: #EF4444
Info Blue: #2563EB
```

Dashboard V1 should show:

```text
Locations
Stores
Kitchens
Restaurants
Items
Employees
GRNs
Transfers
Pending Acknowledgements
Store Stock
Kitchen Stock
Restaurant Stock
Recent GRNs
Recent Transfers
Inventory summary
```

### 10.3 Phase 5A - Restaurant Operations / Menu Availability

Goal:

```text
Create Restaurant Operations foundation before POS.
```

API planned:

```text
GET /api/v1/restaurant-operations/menu-availability
GET /api/v1/restaurant-operations/summary
```

Menu availability rules:

```text
Restaurant active
Item active
Restaurant menu mapping active/available
Day of week valid
Time slot valid
MRP and READYMADE need restaurant stock > 0
LIVE needs menu/time validity but no stock in current phase
```

Availability statuses:

```text
AVAILABLE
OUT_OF_STOCK
TIME_NOT_AVAILABLE
DAY_NOT_AVAILABLE
INACTIVE
NOT_MAPPED
PRICE_NOT_CONFIGURED (recommended future)
```

### 10.4 Phase 5B - POS Billing

Future POS billing will need:

```text
Restaurant stock
Menu availability
Item price master
POS device master
Payment machine master
Cart
Invoice
KOT
Payment modes
Stock deduction
```

Do not start POS until POS Device Master and Restaurant Operations are ready.

---

## 11. Important Business Rules

### Location Active/Inactive

If Location is inactive:

```text
Block new Store/Kitchen/Restaurant creation
Block GRN post for stores under that Location
Block transfers under that Location
Block Kitchen Production post under that Location
Historical data remains visible
No automatic delete
```

### Store Active/Inactive

If Store is inactive:

```text
Do not allow Store Item Mapping
Do not allow GRN post
Do not allow Store to Restaurant Transfer dispatch
Existing stock/history remains visible
```

### Kitchen Active/Inactive

If Kitchen is inactive:

```text
Do not allow Kitchen Item Mapping
Do not allow Kitchen Production post
Do not allow Kitchen to Restaurant Transfer dispatch
Existing stock/history remains visible
```

### Item Category Active/Inactive

If category inactive:

```text
Do not allow use for new/updated items
Existing items/history remains visible
```

### Item Active/Inactive

If item inactive:

```text
Do not allow Store Item Mapping
Do not allow Kitchen Item Mapping
Do not allow Restaurant Menu Mapping
Do not allow GRN line selection
Do not allow Kitchen Production line selection
Do not allow future POS/menu sale
Historical data remains visible
```

### Mapping Active/Inactive

If mapping inactive:

```text
Store Item Mapping inactive -> item does not appear in GRN
Kitchen Item Mapping inactive -> item does not appear in Kitchen Production
Restaurant Menu inactive -> item does not appear in future Restaurant Operations/POS
```

### Stock Integrity

```text
No stock update without stock ledger
No negative stock
No restaurant stock without acknowledgement
Rejected quantity returns to source
Batch and expiry preserved for MRP
FEFO used for transfer allocation
```

### Business Date

All transaction modules must respect businessDate:

```text
GRN
Production
Transfers
Acknowledgements
Orders
Payments
Closing
ERP
Reports
```

Business date exists because restaurants may close after midnight.

---

## 12. Database and Prisma Notes

Database is already integrated and actively used.

Key DB components:

```text
PostgreSQL
Prisma schema
Prisma migrations
Prisma Client
Seed script
Docker local database
```

Local DB connection:

```text
Host: localhost
Port: 5433
Database: aahar
User: aahar
Password: aahar_password
```

Use Prisma Studio for viewing data:

```powershell
pnpm exec prisma studio --schema prisma/schema.prisma
```

Important:

```text
Use Prisma Studio mainly for viewing data.
Do not manually edit stock_balances or stock_ledgers.
Stock must change only through workflows: GRN, Transfer, Acknowledgement, Kitchen Production.
```

Development migration:

```powershell
pnpm db:migrate
```

Sandbox/UAT/Production migration:

```powershell
pnpm db:deploy
```

Never use migrate dev in production.

---

## 13. Deployment Notes

Render was attempted for quick sharing.

Render deployment issue encountered:

```text
Auth service built successfully but runtime failed to find @aahar/config/dist/index.js.
```

Root cause:

```text
pnpm monorepo workspace packages are not packaged/resolved correctly at runtime when deploying a single service on Render.
```

Recommendation:

```text
Do not continue ad-hoc Render troubleshooting during active feature development.
Finish foundation modules first.
Then run a dedicated Deployment Preparation Sprint.
```

Future deployment should include:

```text
Monorepo-aware build/start scripts
Possibly Docker-based deployment
Shared package runtime resolution
PostgreSQL
Redis
Migrations/seeding
CORS setup
Environment variables
```

Preferred long-term production hosting:

```text
Azure
```

Possible demo/sandbox hosting:

```text
Render
Railway
Azure Sandbox
```

---

## 14. UI / UX Direction

AAHAR UI should look like:

```text
Modern SaaS dashboard
Healthcare-grade enterprise app
Food and cafeteria management platform
Inventory and restaurant operations system
Clean, premium, responsive
```

Default theme:

```text
Light theme
```

Optional:

```text
Dark theme for kitchen/POS/night shift
```

Key UI principles:

```text
Modern sidebar
Top header
Global Location selector
KPI cards
Charts
Status badges
Grouped forms
Responsive tables
Expandable rows for stock
Friendly errors
Loading skeletons
Empty states
```

Current Global Location Selector requirement completed:

```text
Compact location pin in top-right header
Click opens popover
Shows All Locations and active Locations
Selecting filters data globally
```

Stock page UX pending:

```text
Store Stock should group by item and expand to batch details.
Restaurant Stock and Kitchen Stock should later follow similar grouping.
```

---

## 15. Role-Based UI Plan

AAHAR should eventually have role-specific screens/portals while using the same backend.

### Admin Portal

Users:

```text
Super Admin
Location Admin
IT/Admin team
```

Screens:

```text
Locations
Stores
Kitchens
Restaurants
Masters
Mappings
Pricing
Inventory
Settings
Reports
```

### Store Portal

Users:

```text
Store Manager
Store Receiver
```

Screens:

```text
GRN
Store Stock
Transfers
Stock Ledgers
```

### Kitchen Portal

Users:

```text
Chef
Kitchen Operator
```

Screens:

```text
Kitchen Production
Kitchen Stock
Kitchen Transfers
Future KOT Queue
```

### Restaurant Portal

Users:

```text
Restaurant Manager
Restaurant Operator
```

Screens:

```text
Pending Acknowledgements
Restaurant Stock
Menu Availability
Closing
```

### POS Portal

Users:

```text
POS Operator
```

Screens:

```text
Billing
Cart
Payment
Invoice
KOT
```

### Supervisor Portal

Users:

```text
Supervisor
```

Screens:

```text
Approvals
Closing Mismatch
Wastage
Delivery Assignment
```

### Finance/ERP Portal

Users:

```text
Finance User
```

Screens:

```text
Payments
Reconciliation
ERP/SUN Posting
Reports
```

Do not create all portals immediately. Build shared design system and permission-driven navigation first.

---

## 16. Known Development Issues and Fixes

### Next.js Turbopack Runtime Error

Error:

```text
Cannot find module '../chunks/ssr/[turbopack]_runtime.js'
```

Fix:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force frontend/apps/admin-portal/.next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .turbo -ErrorAction SilentlyContinue
pnpm dev
```

### Prisma EPERM on Windows

Error:

```text
EPERM operation not permitted rename query_engine-windows.dll.node
```

Fix:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm db:generate
```

### OTP Failed / Failed to Fetch

Causes:

```text
Auth service not running
Frontend env points to wrong IP
CORS issue
Stale Node process
```

Fix local env:

```text
frontend/apps/admin-portal/.env.local
```

Use:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4001/api/v1
NEXT_PUBLIC_AUTH_API_URL=http://localhost:4001/api/v1
NEXT_PUBLIC_USER_API_URL=http://localhost:4002/api/v1
NEXT_PUBLIC_ORGANIZATION_API_URL=http://localhost:4003/api/v1
```

### CORS Local Network Issue

If team opens frontend using local IP, backend must allow that frontend origin in CORS_ORIGINS.

But office firewall/VPN may still block it.

Recommended team sharing right now:

```text
GitHub access for developers
Screen recording/screenshots for BA/manager
Sandbox deployment later
```

---

## 17. AI Tool Handoff Instructions

If switching to another AI tool, provide these files first:

```text
docs/AAHAR_BOOK.md
docs/CODEX_MASTER_PROMPT.md
docs/CODEX_RULES.md
docs/BRD.md
docs/ERD.md
docs/TRD.md
docs/FSD.md
docs/API_SPEC.md
docs/IMPLEMENTATION_PLAN.md
docs/UI_UX_GUIDELINES.md
docs/UI_REFERENCE.md
docs/SESSION_MANAGEMENT.md
docs/ERROR_HANDLING.md
docs/REGRESSION_CHECKLIST.md
docs/PRODUCTION_READINESS.md
docs/DEPLOYMENT_GUIDE.md
```

Tell the AI:

```text
Do not modify business logic unless explicitly asked.
Do not modify Prisma schema unless required.
Do not break completed modules.
Follow regression checklist before commit.
AAHAR uses Location as business UI term but hospitalId internally.
Phase 4.6D POS Device Master + Payment Machine Master is delivered.
Current next pending phase is Phase 4.6E UI Foundation and Dashboard Upgrade unless BA provides new changes.
```

---

## 18. Immediate Next Recommended Work

Phase 4.6D POS Device Master + Payment Machine Master is delivered, so POS Billing and
Restaurant Operations now have the master data they depend on:

```text
POS Billing needs POS Device
Payment flow needs Payment Machine
Restaurant operations need clear POS setup
Pine Labs needs terminal/master data
```

The next planned phases are:

```text
Phase 4.6E - UI Foundation and Dashboard Upgrade
Phase 5A - Restaurant Operations / Menu Availability
Phase 5B - POS Billing
```

---

## 19. Critical Regression Checklist Before Every Commit

At minimum test:

```text
Login/logout
Global Location selector
Location create/edit/status toggle
Store create/status toggle
Kitchen create/status toggle
Restaurant create/edit/list
POS Device create/edit/status-KOT-Invoice toggles
POS Device Restaurant's Accessibility mapping
POS Device duplicate host name rejection
Payment Machine create/edit/Default toggle handover
Item Category create/toggle
Item create/toggle
Employee create
Item Price create/edit/overlap check
Store Item Mapping
Kitchen Item Mapping
Restaurant Menu Mapping
GRN create/post
Store Stock
Store to Restaurant Transfer
Acknowledgement
Restaurant Stock
Kitchen Production
Kitchen Stock
Kitchen to Restaurant Transfer
Stock Ledgers
```

If any fail:

```text
Do not commit.
Fix first.
Run regression again.
```

---

## 20. Important Product Decisions

### Decision 1: Location vs Hospital

Business calls it Location; internal system can keep Hospital/hospitalId for stability.

### Decision 2: Item codes auto-generated

Format:

```text
ITM0001
ITM0002
```

### Decision 3: Store/Kitchen/Restaurant codes auto-generated

Formats:

```text
STR0001
KIT0001
RST0001
```

### Decision 4: Batch-wise DB, grouped UI

Database must stay batch-wise; UI can group by item for user friendliness.

### Decision 5: FEFO allocation

Transfer should default to item-first selection and FEFO batch allocation, with manual batch mode for advanced use.

### Decision 6: Price master required before POS

POS cannot be built until item prices exist.

### Decision 7: POS Device and Payment Machine required before POS Billing

POS Billing needs device/payment configuration.

### Decision 8: UI Foundation before POS

It is better to establish visual system before building POS because POS is a large UI-heavy module.

---

## 21. BA Change Log Summary

Important BA changes already incorporated or planned:

```text
Hospital renamed to Location in UI
Location creation fields changed
Auto-create Main Store and Main Kitchen on Location creation
Store form simplified
Kitchen form simplified
Restaurant form redesigned
Restaurant list redesigned
Restaurant Edit added
Restaurant Store/Kitchen fields removed
Restaurant supports legal/GST/banking/options/Sodexo/ERP fields
Counter renamed/planned as POS Device
Payment Machine Master planned
Global Location selector required
Location/Store/Kitchen active/inactive freeze rules added
Item/Category/Mapping active/inactive controls added
Item Price Master added
GST percent added to Item Price
Transfer item selection changed to item-first FEFO allocation
```

---

## 22. Future Payment Safety Plan

Payment module must follow:

```text
One active payment attempt per order
Idempotency key mandatory
Duplicate callback safe
Gateway success verified server-side
Unknown payment goes to reconciliation
Refund audited
No duplicate deduction
```

Payment modes planned:

```text
Cash
Card
UPI
Pine Labs
PayU
Razorpay
Complimentary
```

Payment machine security:

```text
Pine Labs security token sensitive
Do not log token
Mask in UI
Use Key Vault/encryption in production
```

---

## 23. Future ERP/SUN Plan

ERP should receive only final approved data.

Do not post:

```text
Failed payments
Cancelled orders
Unapproved closing mismatch
Unapproved wastage
Duplicate transactions
```

Posting statuses:

```text
NOT_READY
READY_TO_POST
POSTED
FAILED
RETRY_PENDING
CANCELLED
```

ERP/SUN posting should support retry and audit.

---

## 24. Future Dashboard Vision

Dashboard V1 before POS:

```text
Locations
Stores
Kitchens
Restaurants
Items
Employees
GRNs
Transfers
Pending Acknowledgements
Store Stock
Kitchen Stock
Restaurant Stock
Recent GRNs
Recent Transfers
Low Stock
Near Expiry
```

Dashboard V2 after POS:

```text
Today Sales
Today Orders
Payment Mode Split
Restaurant-wise Sales
Top Items
Closing Pending
ERP Pending
Payment Failures
```

---

## 25. Final Rule

AAHAR must be built as a secure, auditable, hospital-grade Food and Cafeteria Management Platform.

Priorities:

```text
Inventory correctness
Payment safety
Auditability
Role-based access
Location context
Business-date accuracy
ERP readiness
User-friendly UI
Production stability
```

Never trade stock correctness, payment safety, or auditability for speed.
