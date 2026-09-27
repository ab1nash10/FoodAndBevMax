# AAHAR - UI UX Guidelines

Version: 1.0
Product Name: AAHAR
Document Type: UI/UX Standards
Status: Mandatory for all future frontend development

---

# 1. Purpose

This document defines the UI and UX standards for all AAHAR applications.

All future Codex prompts must include:

```text
Read docs/UI_UX_GUIDELINES.md
```

The goal is to ensure:

* Consistent UI
* Modern enterprise design
* Hospital-friendly appearance
* Scalable design system
* Reusable components
* Mobile responsiveness

---

# 2. Design Philosophy

AAHAR should feel like:

```text
Modern
Professional
Clean
Fast
Healthcare-grade
Enterprise-grade
```

Not like:

```text
Student project
Bootstrap admin panel
Old ERP screen
Spreadsheet application
```

---

# 3. Visual Theme

Primary Theme:

```text
Healthcare + Food Operations
```

Visual Identity:

```text
AAHAR
Max Healthcare
Food & Cafeteria Management Platform
```

Design Style:

```text
Minimal
Clean
Modern
Card Based
Dashboard Style
```

---

# 4. Technology Standards

Frontend must use:

```text
Next.js
TypeScript
TailwindCSS
ShadCN UI
Lucide Icons
React Hook Form
Zod
TanStack Query
```

Do not introduce:

```text
Bootstrap
jQuery
Material UI
Ant Design
```

without approval.

---

# 5. Layout Standard

All applications should follow:

```text
┌──────────────────────────────┐
│ Top Header                   │
├──────────────┬───────────────┤
│ Sidebar      │ Main Content  │
│ Navigation   │               │
└──────────────┴───────────────┘
```

Components:

```text
Header
Sidebar
Breadcrumb
Page Header
Cards
Tables
Forms
Dialogs
Drawers
Toasts
```

---

# 6. Sidebar Standards

Sidebar should be:

```text
Collapsible
Icon Based
Responsive
Sticky
```

Use Lucide Icons.

Example:

```text
Dashboard
Hospitals
Stores
Kitchens
Restaurants
Counters

Item Categories
Items
Employees
Time Slots

Store Items
Kitchen Items
Restaurant Menus
```

---

# 7. Page Header Standard

Every page should have:

```text
Page Title
Description
Primary Action Button
```

Example:

```text
Items

Manage food and beverage items.

[ Create Item ]
```

---

# 8. Card Standards

Use cards for:

```text
Dashboards
Summary metrics
Details
Configuration sections
```

Card style:

```text
Rounded corners
Soft shadows
Clean spacing
```

Avoid:

```text
Heavy borders
Dense layouts
```

---

# 9. Dashboard Standards

Use KPI cards:

```text
Total Hospitals
Total Restaurants
Total Items
Today's Sales
Pending Transfers
Pending Closings
```

Card format:

```text
Icon
Value
Label
Trend
```

---

# 10. Table Standards

All list pages must use modern tables.

Required:

```text
Search
Pagination
Sorting
Filters
Status Badge
Actions Menu
```

Columns should never feel crowded.

Actions:

```text
View
Edit
Delete
```

should be grouped in:

```text
⋮ Actions
```

dropdown.

---

# 11. Form Standards

Every form should include:

```text
Section title
Field label
Helper text
Validation
```

Example:

```text
Item Name
Enter the item name

[________________]
```

Required fields:

```text
Item Name *
```

Validation:

```text
Inline
Real-time where possible
```

---

# 12. Button Standards

Primary:

```text
Create
Save
Submit
Approve
```

Secondary:

```text
Cancel
Back
Close
```

Danger:

```text
Delete
Reject
```

Do not overuse colors.

---

# 13. Status Badges

Use badges.

Examples:

```text
Active
Inactive

Approved
Rejected
Pending

Available
Out Of Stock

Posted
Failed
```

Badges should be visually distinct.

---

# 14. Empty States

Never show blank pages.

Example:

```text
No Items Found

Create your first item to get started.

[ Create Item ]
```

---

# 15. Loading States

Use:

```text
Skeleton loaders
```

instead of:

```text
Loading...
```

where possible.

---

# 16. Error States

Show friendly messages.

Good:

```text
Unable to load items.
Please try again.
```

Bad:

```text
500 Internal Server Error
```

---

# 17. Toast Notifications

Success:

```text
Item created successfully
```

Error:

```text
Unable to create item
```

Warning:

```text
Similar item already exists
```

---

# 18. Date and Time Format

Use:

```text
19 Jun 2026, 4:30 PM
```

Avoid:

```text
2026-06-19T16:30:00.000Z
```

for UI.

---

# 19. Item Master UI Standard

Display:

```text
Item Name
Item Code
Category
Type
Item Type
Preparation Time
HSN Code
Status
Created
Updated
```

Item Code:

```text
Auto Generated
Read Only
```

Example:

```text
ITM0001
ITM0002
ITM0003
```

---

# 20. Restaurant Menu UI Standard

Use:

```text
Restaurant
Item
Time Slots
Days Available
Availability
Position
```

Time Slots:

```text
Checkbox Group
```

Example:

```text
☑ Breakfast
☑ Lunch
☑ Dinner
```

Days:

```text
Checkbox Group
```

Example:

```text
☑ Monday
☑ Tuesday
☑ Wednesday
```

Position:

```text
First
Last
Before Item
After Item
```

Never show raw numeric display order.

---

# 21. Modern UX Rules

Prefer:

```text
Checkboxes
Tags
Badges
Multi-select
Cards
Drawers
```

Avoid:

```text
Large dropdown chains
Raw text arrays
Complex forms
```

---

# 22. Mobile Responsiveness

All pages must work on:

```text
Desktop
Tablet
Mobile
```

Breakpoints:

```text
sm
md
lg
xl
```

Sidebar should collapse on mobile.

---

# 23. Accessibility

Required:

```text
Keyboard navigation
Focus states
Labels
Readable contrast
```

---

# 24. Future Applications

These standards apply to:

```text
Admin Portal
Store App
Kitchen App
Restaurant App
POS App
Supervisor App
Finance App
Employee PWA
Customer PWA
Delivery App
```

---

# 25. Codex UI Rules

Every future Codex prompt must follow:

```text
Read docs/UI_UX_GUIDELINES.md
```

Codex must:

* Use ShadCN UI
* Use Lucide Icons
* Use card-based layouts
* Use modern tables
* Use status badges
* Use loading skeletons
* Use empty states
* Use toast messages
* Use responsive layouts

Do not generate outdated admin panels.

---

# 26. AAHAR Design Goal

AAHAR should look comparable to:

```text
Modern SaaS products
Enterprise Operations Platforms
Hospital Administration Systems
Restaurant Management Platforms
```

while remaining:

```text
Simple
Fast
Professional
Scalable
```
