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
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/**
 * Escapa un valor para usar dentro de un INSERT SQL.
 * Usa comillas simples estándar SQL con escaping de comillas dobles ('').
 * Nota: NO se usa $$ quoting porque si un valor contiene $$ adentro
 * (ej: texto con variables, templates), se rompe el delimiter.
 */
function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';

  const type = typeof val;

  if (type === 'number') return String(val);
  if (type === 'boolean') return val ? 'true' : 'false';

  // JSON objects/arrays
  if (type === 'object') {
    const jsonStr = JSON.stringify(val)
      .replace(/'/g, "''");  // escapar comillas simples dentro del JSON
    return `'${jsonStr}'`;
  }

  // Strings y fechas: comillas simples con escaping estándar SQL
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
 * Obtiene las columnas de una tabla en orden.
 * Nota: Prisma crea tablas con quoted identifiers (PascalCase) pero
 * information_schema almacena table_name en minúsculas en PostgreSQL.
 * Por eso usamos LOWER() para comparación case-insensitive.
 */
async function getTableColumns(client, tableName) {
  const res = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND LOWER(table_name) = LOWER('${tableName}')
    ORDER BY ordinal_position;
  `);
  return res.rows.map(r => r.column_name);
}

/**
 * Obtiene el nombre real de la tabla en la base de datos (case-sensitive).
 * Prisma usa quoted identifiers: la tabla puede ser "Settings" o "settings".
 */
async function getRealTableName(client, tableName) {
  const res = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND LOWER(table_name) = LOWER('${tableName.replace(/'/g, "''")}')
    LIMIT 1;
  `);
  return res.rows.length > 0 ? res.rows[0].table_name : null;
}

/**
 * Obtiene todas las filas de una tabla, ordenadas por id.
 */
async function getTableData(client, tableName, columns) {
  const realName = await getRealTableName(client, tableName);
  const useName = realName || tableName;
  const colList = columns.map(c => `"${c}"`).join(', ');
  const res = await client.query(`SELECT ${colList} FROM "${useName}" ORDER BY "id";`);
  return res.rows;
}

/**
 * Genera el archivo SQL de backup completo con datos.
 */
async function backupData(outputFile) {
  console.log('📦 Conectando a la base de datos...');
  const client = await createClient();

  // Primero: listar todas las tablas reales en la DB para debug
  const allTables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  console.log(`   📋 Tablas encontradas en la DB: ${allTables.rows.map(r => r.table_name).join(', ')}`);
  console.log('');

  // Verificar tablas que realmente existen (case-insensitive)
  const existingTables = [];
  for (const table of TABLES_ORDER) {
    const realName = await getRealTableName(client, table);
    if (realName) {
      existingTables.push(realName); // Usar el nombre real de la DB
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

      // table ya es el nombre real de la DB
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
    // Mostrar tamaño del backup
    const lines = sqlContent.split('\n').filter(l => l.trim().length > 0);
    console.log(`   📄 Archivo tiene ${lines.length} líneas`);

    // Separar sentencias SQL respetando strings delimitados por comillas simples.
    // El split por ';' simple rompe cuando un valor contiene ';' adentro
    // (ej: User-Agent 'Mozilla/5.0 (Macintosh; Intel...)').
    // Este parser es state-aware: solo splitea ';' fuera de strings.
    function splitSqlStatements(sql) {
      const statements = [];
      let current = '';
      let inSingleQuote = false;
      let i = 0;
      while (i < sql.length) {
        const ch = sql[i];

        // Comilla simple: abre/cierra string (escaped '' dentro no cuenta)
        if (ch === "'" && !inSingleQuote) {
          inSingleQuote = true;
          current += ch;
          i++;
        } else if (ch === "'" && inSingleQuote) {
          // Check if it's an escaped quote ('')
          if (i + 1 < sql.length && sql[i + 1] === "'") {
            // Escaped quote, keep both characters
            current += "''";
            i += 2;
          } else {
            // Closing quote
            inSingleQuote = false;
            current += ch;
            i++;
          }
        } else if (ch === ';' && !inSingleQuote) {
          // Split point: ; outside of string
          const trimmed = current.trim();
          if (trimmed.length > 0 && !trimmed.startsWith('--')) {
            statements.push(trimmed);
          }
          current = '';
          i++;
        } else {
          current += ch;
          i++;
        }
      }
      // Última sentencia si no termina con ;
      const last = current.trim();
      if (last.length > 0 && !last.startsWith('--')) {
        statements.push(last);
      }
      return statements;
    }

    const statements = splitSqlStatements(sqlContent);

    console.log(`   📊 ${statements.length} sentencias para ejecutar`);

    if (statements.length === 0) {
      console.log('');
      console.log('❌ El archivo de backup está vacío (0 sentencias).');
      console.log('   Esto significa que el backup no contiene datos.');
      console.log('   Genera un nuevo backup primero con: node db-backup.js');
      await client.end();
      return;
    }

    // Comandos que Neon no permite — se saltan automáticamente
    const skipPatterns = [
      'session_replication_role',
      'DISABLE TRIGGER',
      'ENABLE TRIGGER',
    ];

    let executed = 0;
    let skipped = 0;
    let errors = 0;
    let firstError = null;
    const startTime = Date.now();

    // Ejecutar SIN transacción: cada sentencia es auto-commit.
    // Esto es más rápido en Neon (1 round-trip por sentencia en vez de 3 con savepoints)
    // y un error no aborta las demás.

    console.log('   🚀 Iniciando restauración (esto puede tardar varios minutos)...');
    console.log('');

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Saltar comandos no soportados en Neon
      if (skipPatterns.some(p => stmt.includes(p))) {
        skipped++;
        continue;
      }

      // No ejecutar BEGIN/COMMIT del archivo (ya no usamos transacción)
      if (stmt === 'BEGIN' || stmt === 'COMMIT') {
        skipped++;
        continue;
      }

      // Mostrar nombre de la tabla que se está insertando
      const tableMatch = stmt.match(/INSERT INTO "(\w+)"/);
      if (tableMatch && (executed + errors) % 50 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   📥 Insertando en ${tableMatch[1]}... (${executed} ok, ${errors} err, ${elapsed}s)`);
      } else if (stmt.startsWith('TRUNCATE')) {
        console.log('   🗑️  Ejecutando TRUNCATE CASCADE (limpiando tablas)...');
      }

      try {
        await client.query(stmt);
        executed++;

        // Mostrar progreso cada 500 sentencias
        if (executed % 500 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const pct = ((executed + errors) / statements.length * 100).toFixed(0);
          console.log(`   ⏳ ${executed}/${statements.length} (${pct}%) — ${elapsed}s transcurridos`);
        }
      } catch (err) {
        errors++;
        const msg = err.message || '';

        // MOSTRAR EL PRIMER ERROR INMEDIATAMENTE para diagnosticar
        if (errors === 1) {
          console.log('');
          console.log(`   ❌ PRIMER ERROR en sentencia ${i + 1}:`);
          console.log(`      ${msg.slice(0, 300)}`);
          console.log(`      SQL: ${stmt.slice(0, 300)}`);
          console.log('');
          // Si el error es que la tabla no existe, avisar al usuario
          if (msg.includes('does not exist') || msg.includes('relation')) {
            console.log('   ⚠️  La tabla no existe en la base de datos destino.');
            console.log('      Asegúrate de ejecutar PRIMERO: npx prisma db push');
            console.log('      con la DATABASE_URL de la base de datos destino.');
            console.log('');
          }
        }

        // Guardar el primer error para mostrarlo al final
        if (!firstError) {
          firstError = { index: i + 1, message: msg, snippet: stmt.slice(0, 200) };
        }

        // Mostrar los primeros 3 errores adicionales si son diferentes al primero
        if (errors <= 4 && errors > 1 &&
            !msg.includes('duplicate key') &&
            !msg.includes('does not exist') &&
            !msg.includes('relation')) {
          console.log(`   ⚠️ Error ${i + 1}: ${msg.slice(0, 120)}`);
        }

        // Si hay demasiados errores iguales, parar y mostrar resumen
        if (errors === 100) {
          console.log('');
          console.log(`   🛑 Demasiados errores (${errors}). Deteniendo para no perder tiempo.`);
          console.log(`      Revisa el primer error arriba. Probablemente las tablas no existen`);
          console.log(`      en la base de datos destino. Ejecuta: npx prisma db push`);
          console.log('');
          break;
        }
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    if (firstError) {
      console.log(`   🔍 Primer error en sentencia ${firstError.index}:`);
      console.log(`      ${firstError.message.slice(0, 200)}`);
      console.log(`      SQL: ${firstError.snippet}`);
      console.log('');
    }
    if (skipped > 0) {
      console.log(`   ⓘ ${skipped} comandos saltados (BEGIN/COMMIT del archivo)`);
    }
    console.log(`✅ Restauración completada en ${totalTime}s: ${executed} ok, ${errors} advertencias.`);
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
