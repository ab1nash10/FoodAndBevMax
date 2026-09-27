# AAHAR - Session Management

Version: 1.0
Product Name: AAHAR
Document Type: Session Management Standard
Status: Mandatory for production readiness

---

# 1. Purpose

This document defines how AAHAR handles:

* Login sessions
* JWT access tokens
* Refresh tokens
* User profile state
* Role and permission state
* Hospital context
* Frontend cache
* Logout behavior
* Expired sessions
* Stale-session issues

This document exists because during development we observed that some issues were fixed only after logout and login again.

In production, users must not be forced to manually logout and login to fix stale permissions or stale data.

---

# 2. Session Management Goals

AAHAR session management must ensure:

* User remains authenticated securely.
* Expired sessions are handled gracefully.
* Permissions remain fresh.
* Role changes are reflected correctly.
* API calls always use the latest valid token.
* Stale frontend cache is cleared when required.
* Logout clears all sensitive data.
* `401 Unauthorized` and `403 Forbidden` are handled properly.
* Production users never see confusing authentication failures.

---

# 3. Login Flow

AAHAR login flow:

```text
User enters mobile number
↓
System sends OTP
↓
User verifies OTP
↓
Auth Service returns accessToken + refreshToken
↓
Frontend stores token
↓
Frontend loads user profile
↓
Frontend loads roles and permissions
↓
Dashboard opens
```

---

# 4. Token Types

## 4.1 Access Token

Purpose:

* Used for API calls.
* Short-lived.
* Contains user identity and permissions.

Recommended expiry:

```text
30 minutes
```

## 4.2 Refresh Token

Purpose:

* Used to get a new access token.
* Longer-lived.
* Should be stored more carefully than access token.

Recommended expiry:

```text
7 days
```

---

# 5. JWT Payload

JWT should include:

```text
sub
mobile
email
roles
permissions
hospital_id
iat
exp
```

JWT must not include:

```text
OTP
secrets
payment credentials
database credentials
large user objects
```

---

# 6. Frontend Session Storage

For current development:

```text
localStorage is acceptable
```

For production, recommended:

```text
httpOnly secure cookie
```

If localStorage is used temporarily:

* Never store secrets.
* Clear token on logout.
* Clear token on invalid session.
* Clear React Query cache on logout.
* Never log tokens in browser console.
* Never expose tokens in UI.

---

# 7. Session Bootstrap

When user opens AAHAR:

```text
Check accessToken
↓
If token exists:
    Validate/load profile
    Load roles
    Load permissions
    Load hospital context
    Open dashboard
Else:
    Redirect to login
```

Frontend must not assume that token presence means session is valid.

---

# 8. Permission Refresh Rule

Issue observed during development:

```text
New permissions added
↓
Old token does not contain new permissions
↓
API fails
↓
Logout/Login fixes it
```

Production solution:

When the app starts:

* Load latest user profile.
* Load latest roles.
* Load latest permissions.
* Compare token permissions with backend permissions if needed.
* If mismatch occurs, refresh token or ask user to refresh session.

User-friendly message:

```text
Your access has been updated. Please refresh your session.
```

---

# 9. Role and Permission Changes

If admin changes a user's role or permissions:

System should either:

1. Refresh permissions on next page load, or
2. Force token refresh, or
3. Ask user to login again with a clear message.

The system must never silently fail.

---

# 10. API Client Token Handling

Every protected request must include:

```http
Authorization: Bearer <accessToken>
```

API client must:

* Read the latest token.
* Attach token to request.
* Handle `401 Unauthorized`.
* Handle `403 Forbidden`.
* Show user-friendly errors.
* Redirect to login when needed.
* Avoid infinite retry loops.

---

# 11. Handling 401 Unauthorized

`401 Unauthorized` means one of the following:

```text
Token missing
Token expired
Token invalid
User inactive
Session invalid
```

Frontend behavior:

```text
Clear session
Clear cache
Redirect to login
Show message:
Your session has expired. Please login again.
```

The system should not keep retrying with the same invalid token.

---

# 12. Handling 403 Forbidden

`403 Forbidden` means:

```text
User is authenticated but does not have required permission.
```

Frontend behavior:

```text
Do not logout user.
Show message:
You do not have permission to perform this action.
```

Examples:

```text
Store Manager tries to access User Management
POS Operator tries to approve Closing
Kitchen Operator tries to post ERP
```

---

# 13. Refresh Token Flow

When access token expires:

```text
API returns 401
↓
Frontend calls refresh token API
↓
New access token received
↓
Failed request is retried once
↓
If refresh fails, logout user
```

Important rules:

* Retry only once.
* Avoid infinite retry loop.
* If refresh token expired, logout.
* If refresh API fails, logout.
* Clear cache after logout.

---

# 14. Logout Flow

Logout must:

* Call logout API.
* Clear access token.
* Clear refresh token.
* Clear user profile.
* Clear selected hospital.
* Clear selected role context.
* Clear React Query cache.
* Clear menu cache.
* Clear permissions cache.
* Redirect to login.

Logout must work even if the backend logout API fails.

---

# 15. React Query Cache Rules

After login:

```text
Clear old cache
Load fresh user/session data
```

After logout:

```text
Clear all cache
```

After create/update/delete:

```text
Invalidate related queries
```

Examples:

```text
Create Item Category
↓
Invalidate item categories list

Create Item
↓
Invalidate items list

Create GRN
↓
Invalidate GRNs, Store Stock, Stock Ledger

Dispatch Transfer
↓
Invalidate Transfers, Store Stock

Acknowledge Transfer
↓
Invalidate Transfers, Restaurant Stock, Source Stock

Post Kitchen Production
↓
Invalidate Kitchen Productions, Kitchen Stock
```

---

# 16. Stale Session Prevention

Frontend should detect:

* Missing token
* Expired token
* Invalid token
* Permission mismatch
* User inactive
* Role inactive
* Hospital context mismatch

When detected:

```text
Clear session
Redirect to login
Show clear message
```

---

# 17. Session Expired UI

Create a standard modal/message:

```text
Session Expired

Your session has expired or your access has changed.
Please login again to continue.

[Login Again]
```

This is better than showing random API errors to the user.

---

# 18. Multiple Tabs Behavior

If user logs out in one tab:

* Other tabs should logout automatically.
* Use browser `storage` event if localStorage is used.

If token is refreshed in one tab:

* Other tabs should use the updated token.

If permission changes are detected:

* All tabs should reload session state.

---

# 19. Development Behavior

Development may use:

```text
OTP = 000000
localStorage
localhost URLs
terminal OTP logging
```

But production must use:

```text
Real OTP provider
Secure cookies or hardened token storage
HTTPS
Strict CORS
Secure refresh token handling
No OTP logging
```

---

# 20. Production Behavior

Production must have:

* HTTPS only.
* Secure cookies preferred.
* No OTP logging.
* No debug token logging.
* Token expiry enforced.
* Refresh token rotation if possible.
* Session timeout.
* Inactive user check.
* Audit log for login/logout.
* Failed login attempt monitoring.

---

# 21. Audit Requirements

Audit these events:

* OTP requested
* OTP verified
* Login success
* Login failure
* Logout
* Token refresh
* Session expired
* Invalid token
* Permission denied
* User inactive
* Refresh token failure

Audit fields:

```text
user_id
mobile
ip_address
user_agent
request_id
event_type
created_at
```

---

# 22. Security Requirements

Never log:

```text
Full JWT token
Refresh token
OTP in production
Secrets
Passwords
Payment credentials
Database credentials
```

Allowed in development only:

```text
OTP test logging
```

Production logs must never contain OTP values or tokens.

---

# 23. Required Future Implementation

Before UAT, implement:

* Global session provider.
* Token refresh mechanism.
* `401` global handler.
* `403` global handler.
* React Query cache clearing.
* Session expired modal.
* Logout across tabs.
* Permission refresh after login.
* Secure production token strategy.
* Global API error handling.
* Consistent retry strategy.

---

# 24. Frontend Session Manager Responsibilities

The AAHAR frontend session manager must handle:

```text
Login
Logout
Token storage
Token refresh
User profile loading
Permission loading
Hospital context loading
Session expiry
Cache clearing
Redirects
```

It should expose:

```text
currentUser
isAuthenticated
permissions
roles
selectedHospital
login()
logout()
refreshSession()
hasPermission()
```

---

# 25. API Error Handling Rules

For API errors:

## 401

```text
Logout user
Clear cache
Redirect to login
Show session expired message
```

## 403

```text
Keep user logged in
Show permission denied message
```

## 409

```text
Show conflict message
Example:
Similar item already exists
```

## 422 / 400

```text
Show validation errors
```

## 500

```text
Show friendly error
Log request ID
```

---

# 26. User-Friendly Messages

Use clear messages.

Good:

```text
Your session has expired. Please login again.
You do not have permission to perform this action.
Similar item already exists.
Unable to save. Please check required fields.
```

Bad:

```text
JWT expired
Forbidden
Unhandled exception
Failed to fetch
```

---

# 27. Network Failure Handling

If network fails:

Show:

```text
Network issue detected.
Please check your connection and try again.
```

Do not show only:

```text
Failed to fetch
```

Network failures should not clear user session unless token validation fails.

---

# 28. Permission Menu Refresh

Sidebar/menu must be permission aware.

Rules:

* Load menu after login.
* Hide menu items user cannot access.
* Refresh menu if permissions change.
* If user accesses restricted route manually, show 403 page.

---

# 29. Hospital Context

AAHAR is hospital-first.

Session should support:

```text
selectedHospital
userHospitalAccess
hospitalSwitching
```

For now:

```text
Super Admin may access all hospitals.
Hospital Admin may access assigned hospital.
```

Future:

```text
Multi-hospital user context
```

must be supported.

---

# 30. Session Timeout

Recommended session timeout behavior:

```text
Access token expires after 30 minutes.
Refresh token expires after 7 days.
Idle timeout can be configured.
```

Before session expires, system may show:

```text
Your session will expire soon.
Do you want to continue?
```

---

# 31. Refresh Token Rotation

Future production recommendation:

* Rotate refresh token after every refresh.
* Invalidate old refresh token.
* Detect token reuse.
* Force logout on suspicious activity.

This improves security.

---

# 32. Dev vs Production Differences

## Development

```text
OTP logged to terminal
Localhost URLs
Local PostgreSQL
Local Redis
Development JWT secrets
```

## Production

```text
Real OTP provider
HTTPS
Production database
Production Redis
Key Vault secrets
Secure cookies
No OTP logs
Strict CORS
Monitoring
Audit logs
```

---

# 33. Codex Rules

When Codex modifies authentication/session code:

* Do not break OTP login.
* Do not remove JWT.
* Do not disable RBAC.
* Do not store secrets in frontend.
* Do not expose tokens in logs.
* Do not bypass `401` or `403` handling.
* Always run lint/build.
* Always test login/logout.
* Always verify protected API calls.
* Always verify session persists after browser refresh.

---

# 34. Regression Tests for Session

Before every release, test:

* Login works.
* Logout works.
* Browser refresh keeps session.
* Invalid token redirects to login.
* Expired token redirects to login or refreshes successfully.
* Missing permission shows 403.
* Logout clears cache.
* Multiple tabs logout together.
* Role/permission change does not cause stale broken UI.
* Protected routes cannot be accessed without login.

---

# 35. Definition of Done

Session management is production-ready when:

* Login works.
* Logout clears all state.
* Token refresh works.
* Expired token redirects to login.
* `403` shows permission message.
* React Query cache clears on logout.
* Permissions refresh correctly.
* No stale session requires manual workaround.
* Audit logs are created.
* Production secrets are not exposed.
* Network errors show friendly messages.
* User never needs to logout/login just to fix stale permissions silently.

---

# 36. Final Rule

AAHAR must never depend on manual logout/login to fix stale data or stale permissions in production.

The system must detect session issues and recover or guide the user clearly.
