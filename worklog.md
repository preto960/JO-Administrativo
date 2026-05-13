---
Task ID: 3-task-batch
Agent: main
Task: Add Stock to Product Dialog, Fix Green Flash, Implement Multi-Branch System

Work Log:

## TASK 1: Add Stock to Product Create/Edit Dialog

### 1a. Updated products-table.tsx dialog form
- Added `formStock` and `formMinStock` state variables (string type)
- Added two number input fields in the dialog after Price/Cost row: "Stock Inicial" and "Stock Mínimo"
- Both inputs use step="1" min="0"
- When editing, pre-populates from `product.inventories[0]?.stock` and `product.inventories[0]?.minStock`
- Includes `initialStock` and `minStock` in save body for both create and edit
- Added reset for these fields in `resetForm()`

### 1b. Updated /api/products POST route
- Accepts `initialStock` and `minStock` from request body
- Uses `stock: body.initialStock ?? 0` and `minStock: body.minStock ?? 0` when creating Inventory

### 1c. Updated /api/products/[id] PUT route
- Accepts `initialStock` and `minStock` from request body
- If provided, finds the inventory entry by productId and updates stock/minStock

## TASK 2: Fix Hardcoded Green/Emerald Colors

### 2a. Updated globals.css
- Changed `:root` CSS variables from emerald (hue 160) to neutral zinc (0 chroma) values
- Changed `.dark` CSS variables similarly to neutral equivalents
- Updated scrollbar thumb colors to neutral (`oklch(0.7 0 0)` and `oklch(0.5 0 0)`)
- No green/emerald color flash before settings load

### 2b. Fixed financial-dashboard.tsx KpiCard
- Changed default `color = 'emerald'` to `color = 'primary'`
- Renamed `colorMap.emerald` key to `colorMap.primary` with same class string
- Changed fallback from `colorMap.emerald` to `colorMap.primary`
- Changed all 3 `color="emerald"` props on KpiCard instances to `color="primary"`

### 2c. Fixed color-picker.tsx fallback
- Changed `let primaryValue = 'emerald'` to `let primaryValue = 'blue'` in `applySecondaryColor()`

## TASK 3: Multi-Branch System

### 3a. Added Branch model to prisma/schema.prisma
- New `Branch` model with: id, name, code (unique), address?, phone?, active, isMain, timestamps
- Relations: inventories, sales, purchases, cashRegisters, expenses, inventoryAdjustments
- Updated all 6 models (Inventory, Purchase, Sale, CashRegister, Expense, InventoryAdjustment) to:
  - Remove `@default("sucursal-1")` from branchId
  - Add `branch Branch @relation(fields: [branchId], references: [id])`

### 3b. Created /api/branches API routes
- GET: Returns all branches ordered by createdAt, includes record counts
- POST: Creates new branch, auto-generates code "sucursal-N"
- PUT (at /api/branches/[id]): Updates branch name/address/phone/active
- DELETE (at /api/branches/[id]): Deletes branch (prevents deleting main branch)

### 3c. Updated settings-view.tsx Sucursales tab
- Replaced placeholder with full branch management UI
- Branch table showing: name, code, address, phone, status, actions
- "Principal" badge for main branch
- Create/Edit dialog with name, address, phone fields
- Deactivate/Reactivate button (not available for main branch)
- Fetches branches on mount via /api/branches

### 3d. Added branch selector to Zustand store + app-header
- Added to use-app-store.ts: `selectedBranchId`, `branches`, `setSelectedBranchId`, `setBranches`, `BranchItem` interface
- Updated app-header.tsx: Added branch dropdown selector using shadcn Select
- Fetches branches on mount, auto-selects first active branch
- Shows current branch name in user dropdown menu

### 3e. Updated API routes to use branchId from request
- Created `resolveBranchId()` helper in `/src/lib/resolve-branch.ts` that:
  - Reads branchId from query parameter or request body
  - Falls back to first active branch from DB
  - Falls back to 'sucursal-1' for backwards compatibility
- Updated 9 API routes:
  - /api/products GET (filters inventory by branch) and POST (uses branchId from body)
  - /api/sales GET (filters by branch) and POST (uses branchId from body)
  - /api/purchases GET (filters by branch) and POST (uses branchId from body)
  - /api/dashboard GET (all queries filtered by branch)
  - /api/cash-register GET (filters by branch) and POST
  - /api/expenses GET (filters by branch) and POST (uses branchId from body)
  - /api/inventory/adjustment POST (uses branchId from body)
  - /api/cash-register/open POST
  - /api/sales/[id] POST (void sale - uses sale.branchId for inventory restore)

### 3f. Created seed script
- Created `prisma/seed-branch.ts` for seeding the default branch
- Executed direct SQL to create Branch table and insert default record before schema push
- Migrated existing data: updated all 'sucursal-1' references to the new branch ID

### 3g. Ran prisma db push
- Created Branch table via raw SQL first
- Inserted default branch ('Sucursal Principal', code: 'sucursal-1')
- Migrated existing records (Inventory, Sale, Purchase, CashRegister, Expense, InventoryAdjustment)
- Successfully pushed schema with all FK relations

Stage Summary:
- Product create/edit dialog now supports setting initial stock and minimum stock
- No more green/emerald color flash on page load - neutral zinc defaults until settings apply
- Full multi-branch system implemented with Branch model, API routes, management UI, and header selector
- All API routes respect branch context via resolveBranchId() helper
- Existing data migrated from hardcoded 'sucursal-1' to proper Branch reference
- Files modified: 17 | Files created: 5
---
