import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

interface BcvRate {
  currency: string
  rate: number
  source: string
  fetchedAt: string
}

// BCV rates are in the range 100-1000 Bs per USD/EUR (as of 2026)
const MIN_RATE = 1
const MAX_RATE = 10000

/**
 * Parse a BCV-format number.
 * BCV uses comma as decimal separator: "508,60040000" → 508.6004
 */
function parseBcvNumber(raw: string): number | null {
  // Remove spaces
  let cleaned = raw.trim().replace(/\s/g, '')
  // BCV format: "508,60040000" - comma is decimal, dot could be thousands
  // Try: remove dots (thousands), replace comma with dot (decimal)
  const v1 = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
  // Try: just replace comma with dot
  const v2 = parseFloat(cleaned.replace(',', '.'))
  // Use the more reasonable value
  const candidates = [v1, v2].filter(v => !isNaN(v) && v >= MIN_RATE && v <= MAX_RATE)
  if (candidates.length > 0) return candidates[0]
  if (!isNaN(v1) && v1 >= MIN_RATE && v1 <= MAX_RATE) return v1
  if (!isNaN(v2) && v2 >= MIN_RATE && v2 <= MAX_RATE) return v2
  return null
}

function isValidRate(v: number): boolean {
  return !isNaN(v) && v >= MIN_RATE && v <= MAX_RATE
}

/**
 * Attempt 1: Fetch the BCV official page and extract rates.
 * The BCV website shows a "TIPO DE CAMBIO DE REFERENCIA" section with rates
 * for USD ($), EUR (€), CNY, TRY, RUB.
 * Rates are in format like "508,60040000" (comma as decimal).
 */
async function scrapeBcvDirect(): Promise<BcvRate[]> {
  const results: BcvRate[] = []
  const now = new Date().toISOString()

  try {
    const response = await fetch('https://www.bcv.org.ve/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      signal: AbortSignal.timeout(20000),
    })

    if (!response.ok) {
      throw new Error(`BCV HTTP ${response.status}`)
    }

    const html = await response.text()

    // ── Strategy A: Look for JSON/JS data in <script> tags ──
    const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi)
    if (scriptBlocks) {
      for (const script of scriptBlocks) {
        const jsContent = script.replace(/<\/?script[^>]*>/gi, '')

        // Look for Drupal settings (BCV uses Drupal CMS)
        const drupalMatch = jsContent.match(/jQuery\.extend\(Drupal\.settings\s*,\s*(\{[\s\S]*?\})\s*\)/)
        if (drupalMatch) {
          const jsonStr = drupalMatch[1]
          const usdMatch = jsonStr.match(/(?:"d[oó]lar"|dolar|"USD"|usd)["\s:=\]]*["\s]*([0-9]+[.,][0-9]+)/i)
          const eurMatch = jsonStr.match(/(?:"euro"|"EUR"|eur)["\s:=\]]*["\s]*([0-9]+[.,][0-9]+)/i)
          if (usdMatch) {
            const v = parseBcvNumber(usdMatch[1])
            if (v && !results.some(r => r.currency === 'USD')) {
              results.push({ currency: 'USD', rate: Math.round(v * 100) / 100, source: 'BCV', fetchedAt: now })
            }
          }
          if (eurMatch) {
            const v = parseBcvNumber(eurMatch[1])
            if (v && !results.some(r => r.currency === 'EUR')) {
              results.push({ currency: 'EUR', rate: Math.round(v * 100) / 100, source: 'BCV', fetchedAt: now })
            }
          }
        }

        // Generic patterns for rates in JS
        const usdPatterns = [
          /d[oó]lar\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /USD\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /"amount"\s*:\s*"?([0-9]+[,.\d]+)"?/i,
          /tasa_dolar\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /precio_dolar\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
        ]
        const eurPatterns = [
          /euro\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /EUR\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /tasa_euro\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /precio_euro\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
        ]

        for (const p of usdPatterns) {
          if (results.some(r => r.currency === 'USD')) break
          const m = jsContent.match(p)
          if (m) {
            const v = parseBcvNumber(m[1])
            if (v) results.push({ currency: 'USD', rate: Math.round(v * 100) / 100, source: 'BCV', fetchedAt: now })
          }
        }
        for (const p of eurPatterns) {
          if (results.some(r => r.currency === 'EUR')) break
          const m = jsContent.match(p)
          if (m) {
            const v = parseBcvNumber(m[1])
            if (v) results.push({ currency: 'EUR', rate: Math.round(v * 100) / 100, source: 'BCV', fetchedAt: now })
          }
        }
      }
    }

    // ── Strategy B: HTML patterns - look for rates near USD/EUR labels ──
    if (!results.some(r => r.currency === 'USD')) {
      const usdHtmlPatterns = [
        /d[oó]lar[^0-9]*([0-9]+[,]\d{2,})/gi,
        /USD[^0-9]*([0-9]+[,]\d{2,})/gi,
        /\$\s*<\/?\w+[^>]*>\s*([0-9]+[,]\d{2,})/gi,
        /data-valor="([0-9]+[,]\d{2,})"/gi,
        /class="[^"]*dolar[^"]*"[^>]*>\s*([0-9]+[,]\d{2,})/gi,
        /id="[^"]*dolar[^"]*"[^>]*>[\s\S]*?([0-9]+[,]\d{2,})/i,
      ]

      for (const pattern of usdHtmlPatterns) {
        const matches = [...html.matchAll(pattern)]
        for (const match of matches) {
          const value = parseBcvNumber(match[1])
          if (value) {
            results.push({ currency: 'USD', rate: Math.round(value * 100) / 100, source: 'BCV', fetchedAt: now })
            break
          }
        }
        if (results.some(r => r.currency === 'USD')) break
      }
    }

    if (!results.some(r => r.currency === 'EUR')) {
      const eurHtmlPatterns = [
        /euro[^0-9]*([0-9]+[,]\d{2,})/gi,
        /EUR[^0-9]*([0-9]+[,]\d{2,})/gi,
        /€\s*<\/?\w+[^>]*>\s*([0-9]+[,]\d{2,})/gi,
        /class="[^"]*euro[^"]*"[^>]*>\s*([0-9]+[,]\d{2,})/gi,
      ]

      for (const pattern of eurHtmlPatterns) {
        const matches = [...html.matchAll(pattern)]
        for (const match of matches) {
          const value = parseBcvNumber(match[1])
          if (value) {
            results.push({ currency: 'EUR', rate: Math.round(value * 100) / 100, source: 'BCV', fetchedAt: now })
            break
          }
        }
        if (results.some(r => r.currency === 'EUR')) break
      }
    }

    // ── Strategy C: Find all decimal numbers in the page ──
    // BCV shows rates like "508,60040000" - numbers with comma decimals
    if (!results.some(r => r.currency === 'USD')) {
      // Find numbers with comma decimals (BCV format)
      const numberPattern = /(\d{2,4},\d{2,8})/g
      const allNumbers: { value: number; index: number }[] = []
      let numMatch: RegExpExecArray | null
      while ((numMatch = numberPattern.exec(html)) !== null) {
        const value = parseBcvNumber(numMatch[1])
        if (value && isValidRate(value)) {
          allNumbers.push({ value, index: numMatch.index })
        }
      }

      // Also find numbers with dot decimals (some pages might use dot)
      const dotPattern = /(\d{2,4}\.\d{2,8})/g
      while ((numMatch = dotPattern.exec(html)) !== null) {
        const value = parseFloat(numMatch[1])
        if (isValidRate(value)) {
          allNumbers.push({ value, index: numMatch.index })
        }
      }

      // If we found numbers, the largest ones near each other are likely the rates
      // BCV rates: USD ~508, EUR ~596, CNY ~70, TRY ~15, RUB ~5
      // USD and EUR are typically the two largest values
      allNumbers.sort((a, b) => b.value - a.value)
      if (allNumbers.length >= 1) {
        results.push({ currency: 'USD', rate: Math.round(allNumbers[0].value * 100) / 100, source: 'BCV', fetchedAt: now })
      }
      if (allNumbers.length >= 2 && allNumbers[1].value > allNumbers[0].value * 0.5) {
        results.push({ currency: 'EUR', rate: Math.round(allNumbers[1].value * 100) / 100, source: 'BCV', fetchedAt: now })
      }
    }
  } catch (error) {
    console.error('[BCV Direct] Failed:', error instanceof Error ? error.message : 'Unknown error')
  }

  return results
}

/**
 * Attempt 2: BCV sub-pages with rate information.
 */
async function scrapeBcvEndpoints(): Promise<BcvRate[]> {
  const results: BcvRate[] = []
  const now = new Date().toISOString()

  const endpoints = [
    'https://www.bcv.org.ve/tasas-informativas-sistema-bancario',
    'https://www.bcv.org.ve/estadisticas/tasas-de-referencia',
    'https://www.bcv.org.ve/?q=tasas',
  ]

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(15000),
      })

      if (!response.ok) continue

      const html = await response.text()
      const numberPattern = /(\d{2,4},\d{2,8})/g
      const found: number[] = []
      let m: RegExpExecArray | null
      while ((m = numberPattern.exec(html)) !== null) {
        const v = parseBcvNumber(m[1])
        if (v && isValidRate(v)) found.push(v)
      }

      found.sort((a, b) => b - a)
      if (found.length >= 1 && !results.some(r => r.currency === 'USD')) {
        results.push({ currency: 'USD', rate: Math.round(found[0] * 100) / 100, source: 'BCV-pagina', fetchedAt: now })
      }
      if (found.length >= 2 && !results.some(r => r.currency === 'EUR')) {
        results.push({ currency: 'EUR', rate: Math.round(found[1] * 100) / 100, source: 'BCV-pagina', fetchedAt: now })
      }

      if (results.some(r => r.currency === 'USD')) break
    } catch {
      continue
    }
  }

  return results
}

/**
 * Attempt 3: Fallback - pydolarve API (BCV monitor specifically).
 */
async function fetchPydolarve(): Promise<BcvRate[]> {
  const results: BcvRate[] = []
  const now = new Date().toISOString()

  try {
    const response = await fetch('https://pydolarve.org/api/v1/dollar', {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (response.ok) {
      const data = await response.json()
      if (data.monitors) {
        const bcvMonitor = data.monitors.find((m: { name: string; title?: string }) =>
          m.name.toLowerCase().includes('bcv') ||
          (m.title && m.title.toLowerCase().includes('oficial')) ||
          m.name.toLowerCase().includes('oficial')
        )
        if (bcvMonitor?.price) {
          const v = parseFloat(bcvMonitor.price)
          if (isValidRate(v)) {
            results.push({ currency: 'USD', rate: Math.round(v * 100) / 100, source: 'pydolarve-BCV', fetchedAt: now })
          }
        }
        const eurMonitor = data.monitors.find((m: { name: string; title?: string }) =>
          m.name.toLowerCase().includes('euro')
        )
        if (eurMonitor?.price) {
          const v = parseFloat(eurMonitor.price)
          if (isValidRate(v)) {
            results.push({ currency: 'EUR', rate: Math.round(v * 100) / 100, source: 'pydolarve-BCV', fetchedAt: now })
          }
        }
      }
    }
  } catch (error) {
    console.error('[Pydolarve] Failed:', error instanceof Error ? error.message : 'Unknown error')
  }

  return results
}

/**
 * Main function: tries all methods and returns best rates.
 */
async function fetchBcvRates(): Promise<BcvRate[]> {
  let rates = await scrapeBcvDirect()

  if (!rates.some(r => r.currency === 'USD')) {
    const subRates = await scrapeBcvEndpoints()
    for (const r of subRates) {
      if (!rates.some(er => er.currency === r.currency)) rates.push(r)
    }
  }

  if (!rates.some(r => r.currency === 'USD')) {
    const fallbackRates = await fetchPydolarve()
    for (const r of fallbackRates) {
      if (!rates.some(er => er.currency === r.currency)) rates.push(r)
    }
  }

  if (!rates.some(r => r.currency === 'USD')) {
    rates.push({
      currency: 'USD',
      rate: 508.60,
      source: 'fallback-estatico',
      fetchedAt: new Date().toISOString(),
    })
  }

  // If we have USD but not EUR, estimate EUR ≈ USD * 1.17
  if (rates.some(r => r.currency === 'USD') && !rates.some(r => r.currency === 'EUR')) {
    const usdRate = rates.find(r => r.currency === 'USD')!
    rates.push({
      currency: 'EUR',
      rate: Math.round(usdRate.rate * 1.17 * 100) / 100,
      source: `${usdRate.source}-estimado`,
      fetchedAt: usdRate.fetchedAt,
    })
  }

  return rates
}

// GET /api/exchange-rates
export async function GET() {
  try {
    const rates = await fetchBcvRates()

    const usdCurrency = await db.currency.findUnique({ where: { code: 'USD' } })
    const eurCurrency = await db.currency.findUnique({ where: { code: 'EUR' } })
    const vesCurrency = await db.currency.findUnique({ where: { code: 'VES' } })

    async function upsertRate(fromId: string, toId: string, rate: number) {
      if (!fromId || !toId) return
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const existing = await db.exchangeRate.findFirst({
        where: { fromCurrencyId: fromId, toCurrencyId: toId, date: { gte: today } },
      })

      if (existing) {
        await db.exchangeRate.update({ where: { id: existing.id }, data: { rate } })
      } else {
        await db.exchangeRate.create({ data: { fromCurrencyId: fromId, toCurrencyId: toId, rate, date: new Date() } })
      }
    }

    const usdRate = rates.find(r => r.currency === 'USD')
    if (usdRate && usdCurrency && vesCurrency) {
      await upsertRate(usdCurrency.id, vesCurrency.id, usdRate.rate)
    }

    const eurRate = rates.find(r => r.currency === 'EUR')
    if (eurRate && eurCurrency && vesCurrency) {
      await upsertRate(eurCurrency.id, vesCurrency.id, eurRate.rate)
    }

    // Update Settings with both USD and EUR reference rates
    const settings = await db.settings.findFirst()
    if (settings) {
      const updateData: Record<string, number> = {}
      if (usdRate) updateData.usdRate = usdRate.rate
      if (eurRate) updateData.eurRate = eurRate.rate

      // Compute the effective exchange rate:
      // If customRate is set (>0), use it; otherwise use the selected reference currency rate
      const refCurrency = settings.referenceCurrency || 'USD'
      const refRate = rates.find(r => r.currency === refCurrency) || usdRate
      if (refRate && !settings.customRate) {
        updateData.exchangeRate = refRate.rate
      }

      if (Object.keys(updateData).length > 0) {
        await db.settings.update({
          where: { id: settings.id },
          data: updateData,
        })
      }
    }

    return NextResponse.json({ rates, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[Exchange Rates API] Error:', error)
    return NextResponse.json({ error: 'Error al obtener tasas de cambio', rates: [] }, { status: 500 })
  }
}
