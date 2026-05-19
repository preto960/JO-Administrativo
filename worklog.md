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
