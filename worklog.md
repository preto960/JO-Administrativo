---
Task ID: 1-8
Agent: Main
Task: Correcciones del módulo producto (8 fixes)

Work Log:
- Created /api/upload endpoint (was missing, causing image upload to fail)
- Added SKU uniqueness validation in POST /api/products and PUT /api/products/[id] (returns 409 with product name)
- Modified POS barcode scanner to show selection dialog when multiple products share the same SKU
- Changed handleToggleActive to disable/enable per-branch (sets stock=0 in that branch's inventory) when branch is selected
- Added generatingLabel state with full-screen loader overlay for barcode label generation
- Added two-option delete dialog: "Eliminar Permanentemente" (hard delete) or "Solo Desactivar" (soft delete)
- Hard delete checks dependencies (sale lines, purchase lines, recipes, inventory, adjustments) and shows them to user
- Changed bulk import to skip products without SKU instead of auto-generating, with clear error messages
- Centered product name in barcode label PDF using align:'center'

Stage Summary:
- 7 files changed, 416 insertions, 52 deletions
- New file: src/app/api/upload/route.ts
- Build successful, pushed to main
---
Task ID: 1
Agent: main
Task: Fix permissions system - permissions not taking effect when toggled in editor

Work Log:
- Investigated full permissions architecture: types, defaults, custom overrides, store, UI usage
- Found 3 critical bugs: (1) useAuth() not reactive to permission changes, (2) canManage* flags never checked in UI, (3) cash-register used hardcoded role check
- Fixed useAuth() hook to subscribe to permissionsVersion from Zustand store
- Added permission gates to products-table.tsx (canManageProducts): New, Import, Edit, Delete, ToggleActive
- Added permission gates to clients-table.tsx (canManageClients): New, Edit, Delete, Dispatch, Reactivate
- Added permission gates to expenses-table.tsx (canManageExpenses): New, Delete
- Fixed cash-register-view.tsx: replaced isCashier role check with canManageCash permission
- Added permission gates to suppliers-view.tsx (canManageSuppliers): New, Edit, Delete, Pedido
- Gated Settings sub-tabs: Usuarios/Roles/Categorías require canManageUsers, Sistema/Tutorial require admin, Auditoría requires canViewAudit
- Created server-side auth helper /src/lib/require-auth.ts with requireAuth(), requireAdmin(), requireManageUsers()
- Added server-side permission checks to 12 API routes: role-permissions, users, products, expenses, clients, suppliers, settings, branches, categories
- Build passed with zero errors

Stage Summary:
- Permissions now fully functional: UI buttons show/hide based on role permissions
- Server-side protection on all write API routes prevents unauthorized access
- useAuth() re-renders when custom permissions load from database
- All Settings sub-tabs properly gated by permission level

---
Task ID: 1
Agent: Main Agent
Task: Agregar botón "Pagar" directo en la tarjeta del proveedor

Work Log:
- Analicé el módulo de proveedores existente (suppliers-view.tsx)
- Confirmé que ya existía toda la funcionalidad de pagos (diálogo Abonar, API payment, FIFO allocation)
- Identifiqué que el botón "Abonar" solo estaba accesible dentro del diálogo de Deudas
- Agregué botón "Pagar" directamente en la tarjeta del proveedor, visible cuando balance > 0
- El botón abre directamente el diálogo de pago con el monto pre-llenado al balance total
- Compilación exitosa sin errores

Stage Summary:
- Botón "Pagar" agregado en cada tarjeta de proveedor con deuda
- Usa estilo verde (border-green-300, text-green-700) para distinguirlo
- Se muestra condicionalmente solo cuando supplier.balance > 0
- No requiere permiso canManage (cualquier usuario puede registrar pagos)
- Archivo modificado: src/components/clients/suppliers-view.tsx
