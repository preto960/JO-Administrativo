---
Task ID: 1
Agent: Main
Task: Módulo de Reportes - Desarrollo completo

Work Log:
- Analizó viabilidad de los 5 reportes solicitados contra el schema existente
- Modificó prisma/schema.prisma: agregó InventoryCheck, InventoryCheckItem, CostCenter, CostEntry, ExpenseBudget + campos Client (source, agreementName, promotionName)
- Creó migración SQL manual: 20260728000000_add_reports_module
- Creó 14 API routes bajo /api/reports/ (inventario, financiero, ventas, clientes con PDFs)
- Creó componente UI ReportsView con 5 tabs + 5 sub-componentes
- Registró 'reports' en AppView, sidebar, app-shell y permisos (admin, gerente)

Stage Summary:
- Archivos creados: 14 API routes + 6 UI components + 1 migration SQL + schema edit
- NO subido al repositorio (pendiente confirmación del usuario)
- Para aplicar BD: npx prisma db push

---
Task ID: ANALISIS-CREDITO-ABONO
Agent: main
Task: Analizar bugs reportados en ventas a crédito y abonos (no descuenta inventario + no respeta monto de abono)

Work Log:
- Revisé `src/components/pos/pos-payment-modal.tsx` — flujo POS con HybridPaymentSelector
- Revisé `src/components/shared/hybrid-payment-selector.tsx` — selector de pagos híbrido
- Revisé `src/app/api/sales/route.ts` — API POST /api/sales (POS)
- Revisé `src/app/api/clients/[id]/renew/route.ts` — API renovación
- Revisé `src/app/api/clients/[id]/tiquetera/route.ts` — API tiquetera
- Revisé `src/app/api/clients/[id]/dispatch/route.ts` — API despacho (crédito desde clientes)
- Revisé `src/app/api/clients/[id]/payment/route.ts` — API cobro de abono a cuenta
- Revisé `src/components/clients/clients-table.tsx` — UI renovación/tiquetera
- Comparé con commits históricos (c48c7d2, 03336e6, 1ef03c0, 66932f8, 2957981)

Stage Summary:
Se identificaron 3 bugs confirmados + 1 ambiguo:

BUG #1 (POS sale crédito - descuido de monto):
- En pos-payment-modal.tsx el monto ingresado en HybridPaymentSelector SÍ se envía a la API
- Pero sales/route.ts crea el AccountReceivable con amount = cp.amount (lo que el usuario escribió)
- Si usuario escribe monto < total: la diferencia (total - monto) queda SIN registrar (ni pago ni deuda) — BUG
- Si usuario escribe monto > total: la deuda excede el total de la venta — BUG
- Falta validación server-side: para ventas a crédito, el monto debe ser == total

BUG #2 (Renovación/Tiquetera a crédito - abono ignorado):
- En clients-table.tsx handleRenew (línea 1115-1118) y handleTiquetera (línea 1218-1221):
  cuando NO es híbrido, solo se envía paymentMethod y paymentReference al backend
  NO se envía el monto que el usuario escribió en HybridPaymentSelector
- En renew/route.ts (línea 251-256) y tiquetera/route.ts (línea 175-180):
  salePayments siempre usa effectivePrice (precio completo del plan) sin importar lo que el usuario escribió
- Por eso "cobra la deuda completa" aunque el usuario ingrese un abono menor
- Es el comportamiento heredado del pre-híbrido: el crédito SIEMPRE cubre el precio completo del plan
- Si se quiere soportar abono + crédito al renovar, hay que usar modo híbrido (que actualmente excluye crédito)

BUG #3 (POS sale - falta flexibilidad abono+crédito):
- El modo híbrido NO permite crédito (filter nonCreditMethods en hybrid-payment-selector.tsx línea 95)
- No hay forma en el POS de hacer: abono en efectivo + resto a crédito (combinación)
- El usuario solo puede: pagar todo en efectivo, pagar todo a crédito, o híbrido sin crédito

BUG #4 (Inventario no se descuenta en crédito - NO CONFIRMADO):
- Revisé sales/route.ts (líneas 178-198): el inventario SÍ se descuenta para toda venta, sin importar método de pago
- Revisé dispatch/route.ts (líneas 57-62): también descuenta
- Es posible que el usuario haya visto el bug #1 (monto < total) y malinterpretado como "no descuenta inventario"
- O quizás se refiera a un flujo distinto — NECESITA confirmación del usuario

Conclusión:
El bug #2 (renovación/tiquetera ignora abono) es el más serio y reproduce exactamente lo que reporta el usuario.
El bug #1 (POS crédito con monto != total) también es real pero menos obvio.
