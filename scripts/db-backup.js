#!/usr/bin/env node
/**
 * db-backup.js — JO-Administrativo Database Backup & Restore
 *
 * Genera un backup AUTOSUFICIENTE: al restaurar en una DB vacía/nueva,
 * crea las tablas (DDL) y luego inserta los datos (DML).
 * NO requiere ejecutar prisma db push por separado.
 *
 * BACKUP:  node scripts/db-backup.js
 * RESTORE: node scripts/db-backup.js --restore backups/archivo.sql.gz
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

// ── Env ──
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
if (!process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
}
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ DATABASE_URL no encontrada. Verifica .env.local o .env');
  process.exit(1);
}

// ── Tablas en orden topológico de dependencias FK ──
const TABLE_ORDER = [
  'Settings', 'PaymentMethod', 'Currency', 'Category', 'Plan', 'Supplier',
  'Branch', 'CostCenter', 'User', 'Client', 'ExchangeRate', 'Product',
  'Inventory', 'RecipeComponent', 'ClientMembership', 'Attendance',
  'Notification', 'AuditLog', 'SalesTarget', 'InventoryCheck', 'Expense',
  'InventoryAdjustment', 'CashRegister', 'InventoryCheckItem',
  'MembershipFreeze', 'Purchase', 'CostEntry', 'ExpenseBudget',
  'AccountPayable', 'PurchaseLine', 'SupplierPayment', 'Sale',
  'CashMovement', 'CashCut', 'CashAudit', 'SaleLine', 'SalePayment',
  'AccountReceivable', 'ClientPayment'
];

const Q = (name) => `"${name}"`;

// ═══════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════

function timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'bigint') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (Buffer.isBuffer(val)) return `'\\x${val.toString('hex')}'::bytea`;
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Parser state-machine para dividir SQL en sentencias.
 * Maneja comillas simples (') y escapes ('') correctamente.
 * Ignora líneas de comentarios (--).
 */
function splitSqlStatements(sql) {
  const stmts = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "'" && !inQuote) {
      inQuote = true;
      cur += ch;
    } else if (ch === "'" && inQuote && next === "'") {
      // '' = comilla escapada dentro de string
      cur += "''";
      i++; // saltar la siguiente comilla
    } else if (ch === "'" && inQuote) {
      inQuote = false;
      cur += ch;
    } else if (ch === ';' && !inQuote) {
      const s = cur.trim();
      if (s && !s.startsWith('--')) stmts.push(s);
      cur = '';
    } else {
      cur += ch;
    }
  }

  const s = cur.trim();
  if (s && !s.startsWith('--')) stmts.push(s);
  return stmts;
}

// ═══════════════════════════════════════════════════
// DDL GENERATION — Lee estructura desde pg_catalog
// ═══════════════════════════════════════════════════

/**
 * Genera CREATE TABLE + ALTER TABLE (FKs) + CREATE INDEX
 * a partir del catálogo de PostgreSQL para una tabla dada.
 */
async function generateTableDDL(client, tableOid) {
  // Nombre de la tabla
  const nameRes = await client.query(
    `SELECT relname FROM pg_catalog.pg_class WHERE oid = $1`, [tableOid]
  );
  const tableName = nameRes.rows[0].relname;

  // ── Columnas ──
  const colRes = await client.query(`
    SELECT
      a.attname,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull,
      pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS col_default
    FROM pg_catalog.pg_attribute a
    LEFT JOIN pg_catalog.pg_attrdef d
      ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE a.attrelid = $1
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `, [tableOid]);

  // ── Constraints: PK, UNIQUE, CHECK ──
  const consRes = await client.query(`
    SELECT contype, conname,
           pg_catalog.pg_get_constraintdef(oid) AS condef
    FROM pg_catalog.pg_constraint
    WHERE conrelid = $1 AND contype IN ('p', 'u', 'c')
    ORDER BY
      CASE contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'c' THEN 3 END,
      conname
  `, [tableOid]);

  // ── Foreign Keys ──
  const fkRes = await client.query(`
    SELECT conname,
           pg_catalog.pg_get_constraintdef(oid) AS condef
    FROM pg_catalog.pg_constraint
    WHERE conrelid = $1 AND contype = 'f'
    ORDER BY conname
  `, [tableOid]);

  // ── Índices que NO respaldan un constraint (PK/UNIQUE) ──
  const idxRes = await client.query(`
    SELECT c.relname AS idxname,
           pg_catalog.pg_get_indexdef(c.oid) AS idxdef
    FROM pg_catalog.pg_index ix
    JOIN pg_catalog.pg_class c ON c.oid = ix.indexrelid
    WHERE ix.indrelid = $1
      AND NOT ix.indisprimary
      AND NOT ix.indisunique
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint cn
        WHERE cn.conindid = c.oid
      )
    ORDER BY c.relname
  `, [tableOid]);

  // ── Construir CREATE TABLE ──
  const lines = colRes.rows.map(col => {
    let line = `  ${Q(col.attname)} ${col.data_type}`;
    if (col.attnotnull) line += ' NOT NULL';
    if (col.col_default !== null) line += ` DEFAULT ${col.col_default}`;
    return line;
  });

  // Constraints inline (PK, UNIQUE, CHECK) con nombre
  for (const c of consRes.rows) {
    lines.push(`  CONSTRAINT ${Q(c.conname)} ${c.condef}`);
  }

  let sql = `CREATE TABLE ${Q(tableName)} (\n${lines.join(',\n')}\n);\n`;

  // FKs via ALTER TABLE (para claridad)
  for (const fk of fkRes.rows) {
    sql += `ALTER TABLE ${Q(tableName)} ADD CONSTRAINT ${Q(fk.conname)} ${fk.condef};\n`;
  }

  // Índices independientes
  for (const idx of idxRes.rows) {
    sql += `${idx.idxdef};\n`;
  }

  return sql;
}

// ═══════════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════════

async function backup() {
  console.log('📦 db-backup.js v2 — Backup AUTOSUFICIENTE (DDL + DML)');
  console.log('📦 Conectando a la base de datos...');
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    // ── Descubrir tablas en la DB ──
    const allTables = await client.query(`
      SELECT c.relname, c.oid
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname NOT LIKE '\\_%'
      ORDER BY c.relname
    `);

    if (allTables.rows.length === 0) {
      console.error('');
      console.error('❌ No se encontraron tablas en la base de datos.');
      console.error('   ¿Estás apuntando a la DB correcta?');
      console.error('   Para hacer backup de la DB ORIGEN, asegúrate de que .env.local');
      console.error('   tenga la DATABASE_URL de la base de datos que tiene datos.');
      process.exit(1);
    }

    // Ordenar por known dependency order, unknowns al final
    const orderMap = {};
    TABLE_ORDER.forEach((name, i) => { orderMap[name.toLowerCase()] = i; });

    const sorted = allTables.rows.sort((a, b) => {
      const ai = orderMap[a.relname.toLowerCase()] ?? 999;
      const bi = orderMap[b.relname.toLowerCase()] ?? 999;
      return ai - bi;
    });

    console.log(`   📋 ${sorted.length} tablas encontradas:`);
    console.log(`   ${sorted.map(t => t.relname).join(', ')}`);
    console.log('');
    console.log('📦 Generando backup completo (DDL + DML)...');

    const output = [];

    // ── Header ──
    output.push('-- =============================================');
    output.push('-- JO-Administrativo — Backup Autosuficiente');
    output.push(`-- Generado: ${new Date().toISOString()}`);
    output.push('--');
    output.push('-- Este archivo contiene TODO lo necesario para');
    output.push('-- restaurar en una base de datos vacía/nueva:');
    output.push('--   1. DROP TABLE (limpia tablas existentes)');
    output.push('--   2. CREATE TABLE (estructura completa)');
    output.push('--   3. INSERT DATA (todos los datos)');
    output.push('--');
    output.push('-- NO requiere prisma db push antes de restaurar.');
    output.push('-- =============================================');
    output.push('');
    output.push('SET search_path TO public;');
    output.push('');

    // ═══ PARTE 1: DROP TABLE (reverse order) ═══
    output.push('-- ============================================================');
    output.push('-- PARTE 1: DROP TABLE IF EXISTS CASCADE (orden inverso)');
    output.push('-- ============================================================');

    for (let i = sorted.length - 1; i >= 0; i--) {
      output.push(`DROP TABLE IF EXISTS ${Q(sorted[i].relname)} CASCADE;`);
    }
    output.push('');

    // ═══ PARTE 2: CREATE TABLE (dependency order) ═══
    output.push('-- ============================================================');
    output.push('-- PARTE 2: CREATE TABLE + ALTER TABLE (FK) + INDEX');
    output.push('-- ============================================================');
    output.push('');

    let ddlCount = 0;
    for (const table of sorted) {
      output.push(`-- ── Tabla: ${table.relname} ──`);
      const ddl = await generateTableDDL(client, table.oid);
      output.push(ddl);
      output.push('');
      ddlCount++;
    }

    console.log(`   ✅ DDL generado: ${ddlCount} tablas`);

    // ═══ PARTE 3: INSERT DATA (dependency order) ═══
    output.push('-- ============================================================');
    output.push('-- PARTE 3: INSERT DATA (orden de dependencias)');
    output.push('-- ============================================================');
    output.push('');

    let totalRows = 0;
    let insertCount = 0;

    for (const table of sorted) {
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM ${Q(table.relname)}`
      );
      const count = countRes.rows[0].cnt;
      totalRows += count;

      if (count === 0) {
        console.log(`   ${table.relname}: 0 filas (vacía)`);
        output.push(`-- ${table.relname}: 0 rows`);
        output.push('');
        continue;
      }

      console.log(`   ${table.relname}: ${count} filas`);

      // Obtener columnas
      const colRes = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND LOWER(table_name) = LOWER($1)
        ORDER BY ordinal_position
      `, [table.relname]);

      const colNames = colRes.rows.map(r => Q(r.column_name));
      const colList = colNames.join(', ');
      const colRaw = colRes.rows.map(r => r.column_name);

      // Exportar en batches
      const BATCH = 500;
      for (let offset = 0; offset < count; offset += BATCH) {
        const dataRes = await client.query(
          `SELECT * FROM ${Q(table.relname)} ORDER BY 1 LIMIT ${BATCH} OFFSET ${offset}`
        );
        for (const row of dataRes.rows) {
          const vals = colRaw.map(c => escapeSqlValue(row[c]));
          output.push(
            `INSERT INTO ${Q(table.relname)} (${colList}) VALUES (${vals.join(', ')});`
          );
          insertCount++;
        }
      }
      output.push('');
    }

    console.log(`   ✅ DML generado: ${insertCount} INSERTs, ${totalRows} filas totales`);

    if (totalRows === 0) {
      console.warn('');
      console.warn('   ⚠️  ATENCIÓN: El backup tiene 0 filas.');
      console.warn('   ¿DATABASE_URL apunta a la base de datos correcta (la que tiene datos)?');
      console.warn('   Si quieres backup de la DB origen, apunta .env.local a esa DB.');
      console.warn('');
    }

    // ── Comprimir y guardar ──
    console.log('   💾 Comprimiendo archivo...');
    const fullSQL = output.join('\n');
    const compressed = zlib.gzipSync(Buffer.from(fullSQL));

    const backupsDir = path.resolve(__dirname, '..', 'backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

    const filename = `backup_${timestamp()}.sql.gz`;
    const filepath = path.join(backupsDir, filename);
    fs.writeFileSync(filepath, compressed);

    const sizeMB = (compressed.length / (1024 * 1024)).toFixed(2);
    console.log('');
    console.log('✅ Backup completado:');
    console.log(`   📄 Archivo: ${filepath}`);
    console.log(`   📊 Tablas:   ${sorted.length}`);
    console.log(`   📊 Filas:    ${totalRows}`);
    console.log(`   📊 INSERTs:  ${insertCount}`);
    console.log(`   💾 Tamaño:   ${sizeMB} MB`);
    console.log('');
    console.log(`Para restaurar en otra DB:`);
    console.log(`  1. Cambia DATABASE_URL en .env.local a la nueva DB`);
    console.log(`  2. node scripts/db-backup.js --restore backups/${filename}`);
    console.log('');
    console.log('   ⚡ El restore creará las tablas automáticamente (no necesitas prisma db push)');

  } finally {
    await client.end();
  }
}

// ═══════════════════════════════════════════════════
// RESTORE
// ═══════════════════════════════════════════════════

async function restore(backupPath) {
  console.log('📂 Leyendo archivo de backup...');

  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Archivo no encontrado: ${backupPath}`);
    process.exit(1);
  }

  const raw = zlib.gunzipSync(fs.readFileSync(backupPath));
  const sql = raw.toString('utf-8');
  const lineCount = sql.split('\n').length;
  const stmts = splitSqlStatements(sql);

  console.log(`   📄 ${lineCount} líneas, ${stmts.length} sentencias`);

  if (stmts.length === 0) {
    console.error('');
    console.error('❌ El archivo no contiene sentencias ejecutables.');
    console.error('   Esto significa que el backup no tiene datos.');
    console.error('   Genera un nuevo backup primero desde la DB que tiene datos.');
    process.exit(1);
  }

  // ── Contar sentencias por tipo ──
  let dropCount = 0, createCount = 0, alterCount = 0, insertCount = 0, otherCount = 0;
  for (const s of stmts) {
    if (s.startsWith('DROP TABLE')) dropCount++;
    else if (s.startsWith('CREATE TABLE')) createCount++;
    else if (s.startsWith('ALTER TABLE')) alterCount++;
    else if (s.startsWith('INSERT INTO')) insertCount++;
    else if (s.startsWith('CREATE INDEX') || s.startsWith('SET ')) otherCount++;
  }
  console.log('');
  console.log(`   📋 Contenido del backup:`);
  console.log(`      DROP TABLE:    ${dropCount}`);
  console.log(`      CREATE TABLE: ${createCount}`);
  if (createCount === 0 && insertCount > 0) {
    console.warn('');
    console.warn('   ⚠️  WARNING: Este backup NO tiene CREATE TABLE.');
    console.warn('   Necesitas generar un nuevo backup con el script v2.');
    console.warn('   Ejecuta: node scripts/db-backup.js');
    console.warn('');
  }
  console.log(`      ALTER TABLE:  ${alterCount}`);
  console.log(`      INSERT:        ${insertCount}`);
  console.log(`      Otros:        ${otherCount}`);
  console.log('');

  // ── Confirmación ──
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirmed = await new Promise(resolve => {
    rl.question(
      '⚠️  ATENCIÓN: Esto REEMPLAZARÁ todos los datos en la base de datos.\n' +
      '   Se ejecutará: DROP TABLE + CREATE TABLE + INSERT (backup autosuficiente)\n\n' +
      '   ¿Estás seguro? Escribe SI: ',
      ans => {
        rl.close();
        resolve(ans.trim() === 'SI');
      }
    );
  });

  if (!confirmed) {
    console.log('❌ Cancelado.');
    process.exit(0);
  }

  console.log('🔄 Conectando a la base de datos destino...');
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  let ok = 0, err = 0;
  const firstErrors = [];
  const startTime = Date.now();
  let lastTableName = '';

  try {
    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i];

      try {
        await client.query(stmt);
        ok++;
      } catch (e) {
        err++;
        if (firstErrors.length < 5) {
          firstErrors.push({
            num: i + 1,
            msg: e.message,
            sql: stmt.substring(0, 200)
          });
        }
        if (err >= 100) {
          console.error(`\n\n❌ Demasiados errores (${err}), deteniendo restore...`);
          break;
        }
      }

      // Progreso
      const total = ok + err;
      if (total % 10 === 0 || total === stmts.length) {
        // Detectar tabla actual
        const m = stmt.match(/(?:DROP TABLE|CREATE TABLE|ALTER TABLE|INSERT INTO)\s+[""]?(\w{2,})/);
        if (m) lastTableName = m[1];

        const pct = (total / stmts.length * 100).toFixed(0);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        process.stdout.write(
          `\r   ⏳ ${total}/${stmts.length} (${pct}%) — ${lastTableName} — ✅${ok} ❌${err} — ${elapsed}s        `
        );
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n');
    console.log('✅ Restore completado:');
    console.log(`   ✅ ${ok} sentencias exitosas`);
    console.log(`   ❌ ${err} sentencias fallidas`);
    console.log(`   ⏱️  Tiempo: ${totalTime}s`);

    if (firstErrors.length > 0) {
      console.log('');
      console.log('   Primeros errores:');
      for (const e of firstErrors) {
        console.log(`   [#${e.num}] ${e.msg}`);
        console.log(`   SQL: ${e.sql}`);
        console.log('');
      }
    }

    if (err === 0 && createCount > 0) {
      console.log('');
      console.log('   🎉 Todas las tablas y datos se restauraron correctamente.');
      console.log('   El backup era autosuficiente: no necesitas prisma db push.');
    }

  } finally {
    await client.end();
  }
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('');
  console.log('JO-Administrativo — Database Backup & Restore');
  console.log('');
  console.log('Uso:');
  console.log('  node scripts/db-backup.js                          # Backup completo (DDL + DML)');
  console.log('  node scripts/db-backup.js --restore <archivo>    # Restore en DB destino');
  console.log('');
  console.log('El backup es AUTOSUFICIENTE:');
  console.log('  ✅ DROP TABLE (limpia tablas existentes)');
  console.log('  ✅ CREATE TABLE (crea estructura completa con PKs, FKs, indexes)');
  console.log('  ✅ INSERT (restaura todos los datos)');
  console.log('');
  console.log('NO necesitas ejecutar prisma db push en la DB destino.');
  console.log('Solo cambia DATABASE_URL en .env.local y ejecuta --restore.');
  console.log('');
  process.exit(0);
}

if (args.includes('--restore')) {
  const fileArg = args[args.indexOf('--restore') + 1];
  if (!fileArg) {
    console.error('Uso: node scripts/db-backup.js --restore <archivo.sql.gz>');
    process.exit(1);
  }
  restore(path.resolve(fileArg));
} else {
  backup();
}
