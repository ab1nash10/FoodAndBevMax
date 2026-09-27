# AAHAR - Production Readiness

Version: 1.0
Product Name: AAHAR
Document Type: Production Readiness Standard
Status: Mandatory before UAT and Go-Live

---

# 1. Purpose

This document defines the production readiness requirements for AAHAR.

AAHAR is a hospital Food & Cafeteria Management Platform. It will handle:

* Hospital data
* User data
* Employee data
* Inventory
* GRN
* Stock movement
* Kitchen production
* Restaurant stock
* POS billing
* Payments
* Closing
* ERP/SUN posting
* Audit logs

Because of this, AAHAR must not go live until production readiness checks are completed.

---

# 2. Production Readiness Goals

AAHAR production must be:

* Secure
* Stable
* Auditable
* Recoverable
* Scalable
* Monitored
* Backup-enabled
* Payment-safe
* ERP-ready
* Role-based
* Performance-tested

---

# 3. Environment Strategy

AAHAR should have separate environments.

```text
Local Development
↓
Sandbox / Integration
↓
UAT
↓
Production
```

---

## 3.1 Local Development

Purpose:

* Coding
* Debugging
* Codex development
* Local testing

Uses:

* Local Docker PostgreSQL
* Local Redis
* Local OTP
* Development secrets

URL examples:

```text
http://localhost:3000
http://localhost:4001
http://localhost:4002
http://localhost:4003
```

---

## 3.2 Sandbox Environment

Purpose:

* Internal demo
* API testing
* Integration testing
* Early business review

Should use:

* Sandbox database
* Sandbox Redis
* Test payment credentials
* EAM test integration
* SUN ERP UAT endpoint

Example URL:

```text
https://sandbox-aahar.company.com
```

---

## 3.3 UAT Environment

Purpose:

* Business testing
* Hospital user testing
* Manager approval
* UAT sign-off

Should use:

* UAT database
* UAT Redis
* UAT payment credentials
* SUN UAT
* Realistic sample data

Example URL:

```text
https://uat-aahar.company.com
```

---

## 3.4 Production Environment

Purpose:

* Real hospital operations

Should use:

* Production database
* Production Redis
* Production payment gateways
* Production ERP/SUN
* Production monitoring
* Production backup
* Production security

Example URL:

```text
https://aahar.company.com
```

---

# 4. Recommended Hosting Architecture

Recommended production hosting:

```text
Azure
```

Recommended Azure services:

```text
Azure Front Door / Application Gateway
Azure WAF
Azure App Service / Azure Container Apps / AKS
Azure Database for PostgreSQL
Azure Cache for Redis
Azure Key Vault
Azure Blob Storage
Azure Monitor
Application Insights
```

---

# 5. Production Architecture

Recommended flow:

```text
Users / POS / PWA
        ↓
HTTPS Domain
        ↓
WAF
        ↓
Load Balancer
        ↓
Frontend Apps
        ↓
Backend APIs
        ↓
Private Network
        ↓
PostgreSQL + Redis
        ↓
Workers / Queues
        ↓
ERP/SUN / Payment Gateways
```

---

# 6. Network Security

Production must ensure:

* Database is not public.
* Redis is not public.
* Backend APIs are exposed only through gateway/load balancer.
* Admin portal uses HTTPS.
* API uses HTTPS.
* Payment callbacks use HTTPS.
* ERP endpoints are IP restricted where possible.

---

# 7. WAF Requirements

Use WAF to protect against:

* SQL injection
* XSS
* Bad bots
* Malicious payloads
* Excessive requests
* Known attack patterns
* DDoS attempts

Recommended:

```text
Azure WAF
AWS WAF
Cloudflare WAF
```

---

# 8. Load Balancer Requirements

Production should use a load balancer.

Purpose:

* High availability
* Traffic distribution
* Failover
* No direct backend exposure
* HTTPS termination

---

# 9. Secrets Management

Production secrets must not be stored in `.env` files on servers.

Use:

```text
Azure Key Vault
```

or equivalent.

Secrets include:

* Database password
* JWT secrets
* Refresh token secret
* Redis connection string
* Payment gateway keys
* Pine Labs credentials
* PayU credentials
* Razorpay credentials
* ERP/SUN credentials
* SMS gateway credentials

---

# 10. Environment Variables

Production must have separate values for:

```text
NODE_ENV=production
DATABASE_URL
REDIS_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
CORS_ORIGINS
PAYMENT_GATEWAY_KEYS
ERP_SUN_URL
SMS_PROVIDER_KEYS
```

Never use development secrets in production.

---

# 11. CORS Rules

Development may allow:

```text
http://localhost:3000
```

Production must allow only official domains.

Example:

```text
CORS_ORIGINS=https://aahar.company.com
```

Do not allow:

```text
*
```

in production.

---

# 12. Authentication Readiness

Before production:

* OTP login must work.
* OTP must not be logged.
* JWT must expire properly.
* Refresh token flow must work.
* Logout must clear session.
* Invalid token must redirect to login.
* Expired session must show friendly message.
* User inactive state must block login.
* Audit logs must capture login/logout.

---

# 13. Authorization Readiness

Before production:

* RBAC must be applied to all protected APIs.
* Role permissions must be seeded.
* Unauthorized APIs must return 401.
* Forbidden APIs must return 403.
* UI should hide inaccessible menu items.
* Backend must still enforce permissions even if UI hides buttons.

---

# 14. Audit Logging Readiness

Audit logs must exist for:

* Login
* Logout
* User changes
* Role changes
* Permission changes
* Hospital setup
* Store setup
* Kitchen setup
* Restaurant setup
* Item master changes
* GRN posting
* Stock adjustment
* Transfer dispatch
* Transfer acknowledgement
* Kitchen production posting
* Order creation
* Payment change
* Refund
* Closing submission
* Supervisor approval
* Wastage approval
* ERP posting

Audit logs must capture:

```text
user_id
hospital_id
entity_name
entity_id
action
old_value
new_value
ip_address
request_id
user_agent
created_at
```

---

# 15. Database Readiness

Production PostgreSQL must have:

* Automated backups
* Point-in-time recovery
* Encryption at rest
* Encryption in transit
* Restricted access
* Separate DB users
* Monitoring
* Slow query logging
* Migration strategy

Application must not use database superuser.

Recommended DB users:

```text
aahar_app
aahar_readonly
aahar_reporting
```

---

# 16. Database Migration Readiness

Before deployment:

Run:

```powershell
pnpm db:generate
pnpm db:deploy
```

Production should not use:

```powershell
prisma migrate dev
```

Production should use:

```powershell
prisma migrate deploy
```

Migration rules:

* Review migration before production.
* Backup database before migration.
* Run migration in UAT first.
* Verify rollback plan.
* Never manually edit production schema.

---

# 17. Redis Readiness

Redis is used for:

* OTP
* Rate limiting
* Session/cache support
* Future queues
* Future payment locks

Production Redis must have:

* Private access
* Authentication
* TLS if supported
* Monitoring
* Memory limits
* Persistence policy if needed

---

# 18. File Storage Readiness

Future uploads may include:

* Proof attachments
* Wastage proof
* Closing proof
* Item images
* Reports
* ERP export files

Use:

```text
Azure Blob Storage
```

Do not store production files directly on app server disk.

---

# 19. Payment Readiness

Before payment go-live:

* Payment attempt table exists.
* One active payment attempt per order.
* Idempotency key is mandatory.
* Duplicate callback protection exists.
* Server-side gateway verification exists.
* Payment status recovery exists.
* Refund audit exists.
* Reconciliation status exists.
* Payment logs are secure.

Payment modes:

```text
Cash
Card
UPI
Pine Labs
PayU
Razorpay
Complimentary
```

---

# 20. Payment Failure Handling

If payment is deducted but network fails:

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

# 21. Pine Labs Readiness

Before Pine Labs production:

* Pine Labs UAT tested.
* Device mapping tested.
* Terminal ID configured.
* Payment success verified.
* Payment failure verified.
* Timeout scenario tested.
* Duplicate transaction prevented.
* Refund flow tested if applicable.
* Reconciliation report available.

AAHAR must not store:

```text
Card number
CVV
Track data
Sensitive card data
```

---

# 22. PayU / Razorpay Readiness

Before production:

* Test mode completed.
* Live keys stored in Key Vault.
* Callback URL configured.
* Webhook signature verified.
* Duplicate callback handled.
* Payment status API integrated.
* Refund API tested.
* Reconciliation tested.

---

# 23. Inventory Readiness

Before production, verify:

* GRN works.
* Batch tracking works.
* Expiry tracking works.
* Store stock updates correctly.
* Store transfer works.
* Restaurant acknowledgement works.
* Restaurant stock updates correctly.
* Kitchen production works.
* Kitchen stock updates correctly.
* Kitchen transfer works.
* Rejected quantity returns to source.
* Stock ledger is created for every movement.
* Stock balance never updates without ledger.

---

# 24. Stock Integrity Rules

Production must enforce:

```text
No negative stock
No stock without ledger
No expired batch sale
No MRP without batch
No MRP without expiry
No restaurant stock without acknowledgement
No duplicate stock movement
```

---

# 25. Business Date Readiness

Production must support:

```text
transaction_datetime
business_date
```

Business date is required for:

* GRN
* Production
* Transfers
* Orders
* Payments
* Closing
* ERP
* Reports

This is important because restaurants may close after midnight.

---

# 26. POS Readiness

Before POS go-live:

* Restaurant stock availability works.
* Zero stock item cannot be sold.
* Staff discount validation works.
* Payment modes work.
* Invoice generation works.
* KOT generation works.
* Stock deduction works.
* Cancellation rules work.
* Shift end works.
* Printer/bill format tested.

---

# 27. KOT Readiness

Before kitchen operations go live:

* KOT generation works.
* Kitchen dashboard works.
* Accept KOT works.
* Preparing status works.
* Ready status works.
* Dispatch status works.
* Special instruction appears.
* Payment status appears.
* Room/table/counter context appears.

---

# 28. Closing Readiness

Before go-live:

* Restaurant closing works.
* Payment summary works.
* Item summary works.
* Expected sale calculated.
* Actual collection captured.
* Difference calculated.
* Mismatch reason required.
* Supervisor approval works.
* Approved closing locks.
* Closing becomes ERP-ready.

---

# 29. Wastage Readiness

Before go-live:

* Breakage wastage works.
* Expired stock wastage works.
* Day-end readymade wastage works.
* Wastage approval works.
* Approved wastage reduces stock.
* Wastage ledger created.
* Proof upload works if required.

---

# 30. ERP/SUN Readiness

Before ERP go-live:

* ERP payload format approved.
* SUN UAT endpoint tested.
* Posting status works.
* Retry logic works.
* Failed posting visible.
* Duplicate posting prevented.
* Only approved/final data posted.
* ERP export logs created.
* ERP posting attempts logged.

Do not post:

* Failed payments
* Cancelled orders
* Unapproved closings
* Unapproved wastage
* Duplicate transactions

---

# 31. Reporting Readiness

Reports required before production:

* Sales report
* Payment mode report
* GST report
* Discount report
* GRN report
* Batch stock report
* Near expiry report
* Expired stock report
* Kitchen production report
* Transfer report
* Acknowledgement report
* Wastage report
* Closing report
* ERP posting report
* Audit log report

Reports must support:

* Date range
* Hospital filter
* Restaurant filter
* Export to Excel/CSV
* Pagination

---

# 32. Monitoring Readiness

Production monitoring must include:

* API uptime
* API latency
* Error rate
* Database health
* Redis health
* Queue health
* Payment failures
* ERP failures
* Login failures
* Stock mismatch alerts

Recommended tools:

```text
Azure Monitor
Application Insights
Grafana
Sentry
```

---

# 33. Logging Readiness

Logs must include:

```text
request_id
service
method
path
status_code
duration_ms
user_id
hospital_id
error_name
error_message
```

Logs must not include:

```text
JWT tokens
Refresh tokens
OTP in production
Payment credentials
Database passwords
Secrets
```

---

# 34. Alerting Readiness

Production alerts should trigger for:

* API down
* Database down
* Redis down
* High error rate
* Payment failures
* ERP posting failures
* Stock mismatch
* Low disk/storage
* High CPU/memory
* Failed backups

---

# 35. Backup Readiness

Before go-live:

* Database backup enabled.
* Point-in-time recovery enabled.
* Blob/file backup enabled.
* Backup restore tested.
* Backup retention policy approved.
* Disaster recovery documented.

Minimum:

```text
Daily backup
Point-in-time recovery
30-day retention
```

---

# 36. Disaster Recovery Readiness

Disaster recovery plan must define:

* Recovery Time Objective
* Recovery Point Objective
* Backup restore process
* Failover process
* Responsible team
* Escalation contacts

Recommended:

```text
RPO: 15 minutes to 1 hour
RTO: 2 to 4 hours
```

Final numbers should be approved by business/IT.

---

# 37. Performance Readiness

Performance targets:

```text
Login < 3 seconds
Dashboard < 3 seconds
POS item search < 1 second
Order creation < 3 seconds
Payment initiation < 5 seconds
GRN save < 3 seconds
Transfer dispatch < 3 seconds
Reports < 10 seconds for normal range
```

Load testing should include:

* Concurrent users
* POS billing
* Kitchen KOT
* QR orders
* Payment callbacks
* Reports
* ERP jobs

---

# 38. Security Readiness

Before production:

* HTTPS enabled.
* WAF enabled.
* CORS strict.
* Rate limiting enabled.
* Helmet enabled.
* Secrets in Key Vault.
* RBAC applied.
* Audit logs enabled.
* No debug endpoints public.
* No Swagger public unless protected.
* No test credentials in production.
* No OTP logging in production.

---

# 39. Swagger Readiness

In development and UAT:

```text
Swagger allowed
```

In production:

Option A:

```text
Swagger disabled
```

Option B:

```text
Swagger protected by admin authentication/IP restriction
```

Swagger must never expose secrets.

---

# 40. CORS Readiness

Production CORS must allow only approved frontend domains.

Allowed example:

```text
https://aahar.company.com
```

Not allowed:

```text
*
http://localhost:3000
random public origins
```

---

# 41. Rate Limiting Readiness

Rate limiting required for:

* OTP
* Login
* Payment APIs
* Public QR APIs
* Report exports
* ERP retry APIs

Examples:

```text
OTP: 5 requests per minute
Login: 10 attempts per minute
Payment: strict throttling
```

---

# 42. UI Readiness

Before UAT:

* Login UI complete.
* Dashboard complete.
* Sidebar clean.
* Light/dark theme working if enabled.
* All forms show validation.
* Tables have pagination.
* Empty states exist.
* Loading states exist.
* Error states exist.
* Mobile/tablet layout tested.
* No technical terms shown to business users.

Do not show:

```text
JWT
RBAC
API
Sprint
Stack trace
```

---

# 43. Regression Readiness

Before go-live:

Run:

```text
docs/REGRESSION_CHECKLIST.md
```

All completed modules must pass.

No module should be moved to production with known critical regression.

---

# 44. UAT Readiness

Before UAT:

* UAT environment ready.
* UAT users created.
* Roles assigned.
* Sample hospitals configured.
* Stores configured.
* Kitchens configured.
* Restaurants configured.
* Items configured.
* Stock configured.
* Test scenarios prepared.
* UAT sign-off form prepared.

---

# 45. Go-Live Readiness

Before go-live:

* Production environment ready.
* Domain configured.
* SSL certificate configured.
* Database migrated.
* Seed data applied.
* Admin users created.
* Backups verified.
* Monitoring verified.
* Payment credentials verified.
* ERP credentials verified.
* Rollback plan ready.
* Support team ready.
* Hypercare plan ready.

---

# 46. Rollback Readiness

Every production release must have rollback plan.

Rollback includes:

* Code rollback
* Database rollback/restore plan
* Feature flag if available
* Payment rollback considerations
* ERP duplicate prevention
* Communication plan

---

# 47. Release Checklist

Before release:

```text
[ ] Code merged
[ ] Build passed
[ ] Tests passed
[ ] Migration reviewed
[ ] Backup taken
[ ] Deployment approved
[ ] Smoke testing completed
[ ] Monitoring active
[ ] Support informed
```

---

# 48. Post-Go-Live Hypercare

After go-live:

Monitor closely for:

* Login failures
* POS failures
* Payment failures
* Stock mismatch
* ERP posting failures
* Slow pages
* User feedback
* Closing mismatches

Hypercare period:

```text
1 to 4 weeks
```

---

# 49. Production Support

Support process should define:

* L1 support
* L2 technical support
* Escalation path
* Business owner
* IT owner
* Incident severity
* SLA

---

# 50. Incident Severity

## Severity 1

Examples:

```text
System down
POS not working
Payment duplication
Database down
Critical security issue
```

## Severity 2

Examples:

```text
ERP posting failed
Restaurant closing blocked
Major inventory mismatch
```

## Severity 3

Examples:

```text
Report incorrect
UI issue
Minor feature issue
```

## Severity 4

Examples:

```text
Cosmetic issue
Minor text issue
Enhancement request
```

---

# 51. Final Production Readiness Rule

AAHAR must not go live until:

* Authentication is stable.
* RBAC is stable.
* Inventory is traceable.
* Payment is safe.
* ERP posting is controlled.
* Audit logs are working.
* Backups are verified.
* Monitoring is active.
* Regression checklist passes.
* UAT is signed off.

---

# 52. Definition of Production Ready

AAHAR is production ready only when:

```text
All critical workflows work
All critical data is auditable
All payment flows are safe
All ERP posting is controlled
All users have correct roles
All environments are configured
All backups are tested
All monitoring is active
All go-live approvals are complete
```
