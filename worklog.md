---
Task ID: 1
Agent: Main Agent
Task: Fix 10 bugs and implement supplier system overhaul

Work Log:
- Fixed activeView persistence using Zustand persist middleware (Bug 1)
- Fixed cashRegId always null in pos-payment-modal.tsx — now fetches open cash register and passes ID (Bug 2)
- Fixed userId hardcoded as 'current-user' in cash-register-view.tsx — now uses real user.id
- Fixed currencyId hardcoded as 'current-currency' in cash movements — now fetches base currency
- Fixed resolve-branch.ts consuming request body — removed body reading, added branchFromBody helper
- Fixed POS stock check using wrong branch inventory — now filters by selectedBranchId (Bug 3)
- Added maxStock to CartItem and validate in addItem/updateQuantity (Bug 4)
- Added server-side stock validation in sales API before creating sale (Bug 5)
- Fixed low stock alerts requiring minStock > 0 to avoid flooding (Bug 6)
- Added supplier actions: Edit, History (payables+payments), Pay buttons (Bug 7)
- Rewrote supplier payment API with $transaction safety + cash register connection (Bug 8)
- Added paidUpfront field to Purchase model — credit purchases don't create debt
- Created SupplierPayment model for audit trail
- Created /api/suppliers/[id]/route.ts for GET/PUT (detail + edit)
- Created /api/suppliers/[id]/payables/route.ts for payable/payment history
- Rewrote suppliers-view.tsx with edit dialog, history dialog, payment with method selection
- Added overdue payable alerts to dashboard API + UI (Bug 9)
- Fixed duplicate notifications — now one per admin summarizing all low-stock products (Bug 10)
- Fixed notification API to filter by userId
- Updated use-notifications hook to pass userId in requests
- Pushed schema changes to Neon DB (prisma db push)
- Build verified successfully

Stage Summary:
- All 10 issues resolved
- 3 new API routes created
- 1 new Prisma model (SupplierPayment)
- 1 new field on Purchase (paidUpfront)
- Build passing with no errors
