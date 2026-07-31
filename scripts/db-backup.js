#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// JO-Administrativo — Backup completo de base de datos con orden de dependencias
// ═══════════════════════════════════════════════════════════════════════════════
//
// USO:
//   node db-backup.js                                  # backup automático
//   node db-backup.js mi_backup                        # backup con nombre
//   node db-backup.js --url "postgres://..." backup    # backup con URL directa
//   node db-backup.js --restore archivo.sql.gz          # restaurar backup
//   node db-backup.js --restore archivo.sql.gz -y       # restaurar sin confirmar
//   node db-backup.js --schema-only                     # solo estructura
//
// REQUISITOS:
//   - Node.js 18+
//   - DATABASE_URL (en .env, variable de entorno, o con --url)
//   - npm install pg dotenv (solo la primera vez)
//
// NOTA: El backup genera INSERTs en el orden correcto de dependencias FK para
//       que al hacer restore no haya errores de llaves foráneas.
// ═══════════════════════════════════════════════════════════════════════════════

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

// ── Config ──────────────────────────────────────────────────────────────────

// Buscar DATABASE_URL en: argumento --url > variable de entorno > .env.local
let DB_URL = null;
const urlIdx = process.argv.indexOf('--url');
if (urlIdx !== -1 && process.argv[urlIdx + 1]) {
  DB_URL = process.argv[urlIdx + 1];
} else {
  DB_URL = process.env.DATABASE_URL;
}
const OUTPUT_DIR = path.join(__dirname, '..', 'backups');

if (!DB_URL) {
  console.error('❌ DATABASE_URL no está definida.');
  console.error('   Crea un archivo .env.local con tu DATABASE_URL o pásala como variable de entorno.');
  console.error('   La encuentras en: Vercel → Settings → Environment Variables');
  process.exit(1);
}

// ── Tablas en orden de dependencia (padres primero, hijos después) ──────────
// Este orden garantiza que al importar, las tablas referenciadas existen antes
// que las tablas que las referencian.

const TABLES_ORDER = [
  // Nivel 0: Sin dependencias FK
  'Settings',
  'PaymentMethod',
  'Currency',
  'Category',
  'Plan',
  'Supplier',
  'Branch',
  'CostCenter',

  // Nivel 1: Dependen solo de nivel 0
  'User',                // → Branch
  'Client',              // sin FK obligatoria
  'ExchangeRate',        // → Currency (from + to)
  'Product',             // → Currency, Category

  // Nivel 2: Dependen de nivel 1
  'Inventory',           // → Product, Branch
  'RecipeComponent',     // → Product (parent + component)
  'ClientMembership',    // → Client, Plan
  'Attendance',          // → Client
  'Notification',        // → User, Client?
  'AuditLog',            // → User?
  'SalesTarget',         // → User
  'InventoryCheck',      // → User, Branch
  'Expense',             // → Currency, User, Branch
  'InventoryAdjustment', // → Product, User, Branch
  'CashRegister',        // → User, Branch, Currency

  // Nivel 3: Dependen de nivel 2
  'InventoryCheckItem',  // → InventoryCheck, Product
  'MembershipFreeze',    // → ClientMembership, User
  'Purchase',            // → Supplier, Currency, Branch
  'CostEntry',           // → CostCenter, Currency, User
  'ExpenseBudget',       // → CostCenter
  'AccountPayable',      // → Supplier?, Purchase?, Currency

  // Nivel 4: Dependen de nivel 3
  'PurchaseLine',        // → Purchase, Product
  'SupplierPayment',     // → Supplier?, AccountPayable?, User
  'Sale',                // → Client?, CashRegister?, Currency?, User, Branch
  'CashMovement',        // → CashRegister, Currency, User
  'CashCut',             // → CashRegister
  'CashAudit',           // → CashRegister, User

  // Nivel 5: Dependen de Sale (nivel 4)
  'SaleLine',            // → Sale, Product
  'SalePayment',         // → Sale, Currency
  'AccountReceivable',   // → Client, Sale, Currency?, User?

  // Nivel 6: Dependen de nivel 5
  'ClientPayment',       // → Client, AccountReceivable, User
];

// Orden inverso para TRUNCATE (hijos primero → padres después)
const REVERSE_ORDER = [...TABLES_ORDER].reverse();

// ── Helpers ─────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
}

/**
 * Escapa un valor para usar dentro de un INSERT SQL.
 * Maneja NULL, números, booleans, strings y JSON.
 */
function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';

  const type = typeof val;

  if (type === 'number') return String(val);
  if (type === 'boolean') return val ? 'true' : 'false';

  // Fechas: convertirlas a timestamp ISO
  if (val instanceof Date || (type === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/))) {
    return `'${String(val).replace(/'/g, "''")}'`;
  }

  // JSON objects/arrays
  if (type === 'object') {
    const jsonStr = JSON.stringify(val);
    return `'${jsonStr.replace(/'/g, "''")}'`;
  }

  // Strings normales
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Genera una sentencia INSERT para una fila de datos.
 */
function buildInsertRow(tableName, columns, values) {
  const colList = columns.map(c => `"${c}"`).join(', ');
  const valList = values.map(v => escapeSqlValue(v)).join(', ');
  return `INSERT INTO "${tableName}" (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;`;
}

// ── Funciones principales ──────────────────────────────────────────────────

async function createClient() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

/**
 * Obiene las columnas de una tabla en orden.
 */
async function getTableColumns(client, tableName) {
  const res = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '${tableName}'
    ORDER BY ordinal_position;
  `);
  return res.rows.map(r => r.column_name);
}

/**
 * Obtiene todas las filas de una tabla, ordenadas por id.
 */
async function getTableData(client, tableName, columns) {
  const colList = columns.map(c => `"${c}"`).join(', ');
  const res = await client.query(`SELECT ${colList} FROM "${tableName}" ORDER BY "id";`);
  return res.rows;
}

/**
 * Genera el archivo SQL de backup completo con datos.
 */
async function backupData(outputFile) {
  console.log('📦 Conectando a la base de datos...');
  const client = await createClient();

  // Verificar tablas que realmente existen
  const existingTables = [];
  for (const table of TABLES_ORDER) {
    const res = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '${table}'
      );
    `);
    if (res.rows[0].exists) {
      existingTables.push(table);
    } else {
      console.log(`   ⚠️  Tabla "${table}" no existe en la base de datos, se omitirá.`);
    }
  }

  const existingReverse = [...existingTables].reverse();
  let totalRows = 0;

  console.log(`📦 Exportando datos de ${existingTables.length} tablas en orden de dependencias...`);

  const sqlParts = [];

  // Cabecera
  sqlParts.push(`-- ═══════════════════════════════════════════════════════════════════`);
  sqlParts.push(`-- JO-Administrativo — Backup de Base de Datos`);
  sqlParts.push(`-- Fecha: ${new Date().toISOString()}`);
  sqlParts.push(`-- Tablas: ${existingTables.length}`);
  sqlParts.push(`-- Generado por: db-backup.js`);
  sqlParts.push(`-- ═══════════════════════════════════════════════════════════════════`);
  sqlParts.push(``);
  sqlParts.push(`-- ── CONFIGURACIÓN: desactiva FK para evitar errores de orden ─────`);
  sqlParts.push(`BEGIN;`);
  sqlParts.push(``);

  // Nota: Neon/PostgreSQL serverless no permite SET session_replication_role
  // ni DISABLE TRIGGER ALL. Usamos TRUNCATE CASCADE que funciona sin superuser.
  // Los INSERTs usan ON CONFLICT DO NOTHING para idempotencia.

  // Limpiar tablas en orden inverso (hijos primero)
  sqlParts.push(`-- Limpiar tablas existentes en orden inverso (hijos → padres)`);
  const truncateList = existingReverse.map(t => `"${t}"`).join(', ');
  sqlParts.push(`TRUNCATE TABLE ${truncateList} CASCADE;`);
  sqlParts.push(``);

  // Generar INSERTs en orden de dependencia
  sqlParts.push(`-- ── INSERT DE DATOS (en orden de dependencia, padres primero) ─────`);
  sqlParts.push(``);

  for (const table of existingTables) {
    process.stdout.write(`   Exportando ${table}... `);

    try {
      const columns = await getTableColumns(client, table);
      if (columns.length === 0) {
        console.log('sin columnas, omitiendo.');
        sqlParts.push(`-- (sin columnas) ${table}`);
        sqlParts.push(``);
        continue;
      }

      const rows = await getTableData(client, table, columns);
      const count = rows.length;
      totalRows += count;

      if (count === 0) {
        console.log(`${count} filas (vacía)`);
        sqlParts.push(`-- (vacía) ${table} — 0 filas`);
        sqlParts.push(``);
        continue;
      }

      // Generar INSERTs en batches de 100 para no hacer el archivo gigante
      sqlParts.push(`-- ${table} — ${count} filas`);

      for (const row of rows) {
        const values = columns.map(col => row[col]);
        sqlParts.push(buildInsertRow(table, columns, values));
      }

      sqlParts.push(``);
      console.log(`${count} filas ✅`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      sqlParts.push(`-- ❌ ERROR en ${table}: ${err.message}`);
      sqlParts.push(``);
    }
  }

  // Reactivar FK — no se necesita en Neon, TRUNCATE CASCADE se encarga
  sqlParts.push(`COMMIT;`);
  sqlParts.push(``);
  sqlParts.push(`-- ✅ Backup completado — ${totalRows} filas totales`);
  sqlParts.push(`-- Para restaurar: node db-backup.js --restore ${path.basename(outputFile)}.gz`);

  const sqlContent = sqlParts.join('\n');

  await client.end();

  // Guardar archivo
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, sqlContent, 'utf8');

  // Comprimir con gzip
  const zlib = require('zlib');
  const gzip = zlib.createGzip();
  const input = fs.createReadStream(outputFile);
  const compressedFile = `${outputFile}.gz`;
  const output = fs.createWriteStream(compressedFile);

  await new Promise((resolve, reject) => {
    input.pipe(gzip).pipe(output).on('finish', resolve).on('error', reject);
  });

  // Borrar el .sql sin comprimir para ahorrar espacio
  fs.unlinkSync(outputFile);

  const sizeMB = (fs.statSync(compressedFile).size / (1024 * 1024)).toFixed(2);
  console.log('');
  console.log(`✅ Backup completado:`);
  console.log(`   📄 Archivo: ${compressedFile}`);
  console.log(`   📊 Total filas: ${totalRows}`);
  console.log(`   💾 Tamaño: ${sizeMB} MB`);
  console.log('');
  console.log(`Para restaurar: node db-backup.js --restore ${path.basename(compressedFile)}`);
}

/**
 * Exporta solo la estructura (schema) usando pg_dump o Prisma como fallback.
 */
async function backupSchemaOnly(outputFile) {
  console.log('📋 Generando schema SQL...');

  // Intentar con Prisma diff (no necesita pg_dump)
  const { execSync } = require('child_process');
  const schemaDir = path.resolve(__dirname, '..', 'JO-Administrativo');

  try {
    const sql = execSync('npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script', {
      cwd: schemaDir,
      timeout: 30000,
    }).toString();

    const header = `-- ═══════════════════════════════════════════════════════════════════\n-- JO-Administrativo — Schema de Base de Datos\n-- Fecha: ${new Date().toISOString()}\n-- Generado por: db-backup.js (via Prisma)\n-- ═══════════════════════════════════════════════════════════════════\n\n`;

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, header + sql, 'utf8');
    console.log(`✅ Schema guardado: ${outputFile}`);
  } catch (err) {
    console.error('❌ Error al generar schema:', err.message);
    process.exit(1);
  }
}

/**
 * Restaura un backup desde un archivo SQL.
 */
async function restoreBackup(inputFile) {
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Archivo no encontrado: ${inputFile}`);
    process.exit(1);
  }

  // Descomprimir si es .gz
  let sqlContent;
  if (inputFile.endsWith('.gz')) {
    console.log('📂 Descomprimiendo archivo...');
    const zlib = require('zlib');
    const compressed = fs.readFileSync(inputFile);
    sqlContent = zlib.gunzipSync(compressed).toString('utf8');
  } else {
    sqlContent = fs.readFileSync(inputFile, 'utf8');
  }

  console.log('⚠️  ATENCIÓN: Esto REEMPLAZARÁ todos los datos en la base de datos.');
  console.log('   Se ejecutará: TRUNCATE CASCADE + INSERT en orden de dependencias');
  console.log('');

  // Confirmación automática (en producción usar readline)
  if (process.argv.includes('--yes') || process.argv.includes('-y')) {
    console.log('   (--yes detectado, procediendo sin confirmación)');
  } else {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => rl.question('¿Estás seguro? Escribe SI para continuar: ', resolve));
    rl.close();
    if (answer !== 'SI') {
      console.log('❌ Cancelado.');
      process.exit(0);
    }
  }

  console.log('🔄 Conectando y ejecutando restore...');
  const client = await createClient();

  try {
    // Separar sentencias por ; y ejecutarlas individualmente
    // Esto evita que un solo error pare toda la restauración
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let executed = 0;
    let errors = 0;

    for (const stmt of statements) {
      try {
        await client.query(stmt);
        executed++;
      } catch (err) {
        errors++;
        // Solo mostrar si no es un error esperado (ON CONFLICT, tabla vacía, etc.)
        if (!err.message.includes('duplicate key') &&
            !err.message.includes('does not exist')) {
          console.log(`   ⚠️ Error: ${err.message.slice(0, 120)}`);
        }
      }
    }

    console.log('');
    console.log(`✅ Restauración completada: ${executed} sentencias ejecutadas, ${errors} advertencias.`);
  } catch (err) {
    console.log('');
    console.log(`❌ Error en restauración: ${err.message.slice(0, 200)}`);
  } finally {
    await client.end();
  }
}

/**
 * Muestra la ayuda.
 */
function showHelp() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   JO-Administrativo — Database Backup Tool              ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║                                                           ║');
  console.log('║  node db-backup.js                  Backup completo (data)║');
  console.log('║  node db-backup.js mi_nombre        Backup con nombre     ║');
  console.log('║  node db-backup.js --schema-only    Solo estructura       ║');
  console.log('║  node db-backup.js --restore arc    Restaurar backup     ║');
  console.log('║  node db-backup.js --restore arc -y Restaurar sin confirm ║');
  console.log('║                                                           ║');
  console.log('║  REQUISITO: DATABASE_URL en .env.local                    ║');
  console.log('║  npm install pg  (solo primera vez)                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const action = process.argv[2];
  const arg = process.argv[3];

  // Filtrar flags de la lista de argumentos para no interpretarlos como nombre
  const flags = ['--url', '--restore', '--schema-only', '--help', '-h', '-y', '--yes'];
  const nonFlagArgs = process.argv.slice(2).filter(a => !flags.includes(a));

  switch (action) {
    case '--restore':
      if (!arg) {
        console.error('❌ Especifica el archivo: node db-backup.js --restore archivo.sql.gz');
        process.exit(1);
      }
      await restoreBackup(arg);
      break;

    case '--schema-only':
      const schemaFile = arg || path.join(OUTPUT_DIR, `schema_${timestamp()}.sql`);
      await backupSchemaOnly(schemaFile);
      break;

    case '--url':
      // --url pasa, el nombre del backup es el próximo arg que no sea flag
      const backupName = nonFlagArgs[0] || 'backup';
      const outputFileUrl = path.join(OUTPUT_DIR, `${backupName}_${timestamp()}.sql`);
      await backupData(outputFileUrl);
      break;

    case '--help':
    case '-h':
      showHelp();
      break;

    case undefined:
      // Sin argumentos = backup automático con fecha
      const autoFile = path.join(OUTPUT_DIR, `backup_${timestamp()}.sql`);
      await backupData(autoFile);
      break;

    default:
      // Backup completo con nombre personalizado o automático
      const name = action || 'backup';
      const outputFile = path.join(OUTPUT_DIR, `${name}_${timestamp()}.sql`);
      await backupData(outputFile);
      break;
  }
})();
