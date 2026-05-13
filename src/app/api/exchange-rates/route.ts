import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

interface BcvRate {
  currency: string
  rate: number
  source: string
  fetchedAt: string
}

/**
 * Attempt 1: Fetch the BCV official page and extract rates from HTML.
 * The BCV website often uses JSON data embedded in <script> tags or
 * specific HTML elements with rates.
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

    // ── Strategy A: Look for JSON data in <script> tags ──
    // BCV sometimes embeds rate data as JSON objects inside script blocks
    const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi)
    if (scriptBlocks) {
      for (const script of scriptBlocks) {
        const jsContent = script.replace(/<\/?script[^>]*>/gi, '')

        // Look for Drupal settings JSON (BCV uses Drupal CMS)
        const drupalMatch = jsContent.match(/jQuery\.extend\(Drupal\.settings\s*,\s*(\{[\s\S]*?\})\s*\)/)
        if (drupalMatch) {
          try {
            const jsonStr = drupalMatch[1]
            // Try to find rates in the Drupal settings object
            const usdPattern = jsonStr.match(/(?:"d[oó]lar"|dolar|"USD"|usd)["\s:]*["\s]*([0-9]+[.,][0-9]+)/i)
            const eurPattern = jsonStr.match(/(?:"euro"|"EUR"|eur)["\s:]*["\s]*([0-9]+[.,][0-9]+)/i)
            if (usdPattern) {
              const v = parseFloat(usdPattern[1].replace(/\./g, '').replace(',', '.'))
              if (!isNaN(v) && v >= 15 && v <= 200) {
                results.push({ currency: 'USD', rate: Math.round(v * 100) / 100, source: 'BCV', fetchedAt: now })
              }
            }
            if (eurPattern) {
              const v = parseFloat(eurPattern[1].replace(/\./g, '').replace(',', '.'))
              if (!isNaN(v) && v >= 15 && v <= 200) {
                results.push({ currency: 'EUR', rate: Math.round(v * 100) / 100, source: 'BCV', fetchedAt: now })
              }
            }
          } catch { /* not valid JSON, continue */ }
        }

        // Look for dollar/euro objects directly
        const usdPatterns = [
          /d[oó]lar\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /USD\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /dolar_oficial\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /tasa_dolar\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /precio_dolar\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /"amount"\s*:\s*"?([0-9]+[,.\d]+)"?/i,
        ]
        const eurPatterns = [
          /euro\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /EUR\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /tasa_euro\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
          /precio_euro\s*[:=]\s*"?([0-9]+[,.\d]+)"?/i,
        ]

        const hasUsd = results.some(r => r.currency === 'USD')
        const hasEur = results.some(r => r.currency === 'EUR')

        for (const p of usdPatterns) {
          if (hasUsd) break
          const m = jsContent.match(p)
          if (m) {
            const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
            if (!isNaN(v) && v >= 15 && v <= 200) {
              results.push({ currency: 'USD', rate: Math.round(v * 100) / 100, source: 'BCV', fetchedAt: now })
            }
          }
        }
        for (const p of eurPatterns) {
          if (hasEur) break
          const m = jsContent.match(p)
          if (m) {
            const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
            if (!isNaN(v) && v >= 15 && v <= 200) {
              results.push({ currency: 'EUR', rate: Math.round(v * 100) / 100, source: 'BCV', fetchedAt: now })
            }
          }
        }
      }
    }

    // ── Strategy B: Look for rates in specific HTML elements ──
    // BCV uses specific divs/spans for exchange rates
    if (!results.some(r => r.currency === 'USD')) {
      // BCV rate section often has specific classes
      const usdHtmlPatterns = [
        /d[oó]lar[^<]*<\/?\w+[^>]*>[^<]*<\/?\w+[^>]*>[^0-9]*([0-9]+[,.\d]+)/gi,
        /id="dolar"[^>]*>[\s\S]*?([0-9]+[,.\d]+)/i,
        /class="dolar"[^>]*>[\s\S]*?([0-9]+[,.\d]+)/i,
        /class="recuadro-tasa"[^>]*>[\s\S]*?([0-9]+[,.\d]+)/gi,
        /class="field-content"[^>]*>[\s\S]*?d[oó]lar[\s\S]*?([0-9]+[,.\d]+)/gi,
        /data-valor="([0-9]+[,.\d]+)"/gi,
        /content="([0-9]+[,.\d]+)"[^>]*property="dc:title"/i,
      ]

      for (const pattern of usdHtmlPatterns) {
        const matches = html.matchAll(pattern)
        for (const match of matches) {
          const rawValue = match[1].replace(/\./g, '').replace(',', '.')
          const value = parseFloat(rawValue)
          if (!isNaN(value) && value >= 15 && value <= 200) {
            results.push({ currency: 'USD', rate: Math.round(value * 100) / 100, source: 'BCV', fetchedAt: now })
            break
          }
        }
        if (results.some(r => r.currency === 'USD')) break
      }
    }

    if (!results.some(r => r.currency === 'EUR')) {
      const eurHtmlPatterns = [
        /euro[^<]*<\/?\w+[^>]*>[^<]*<\/?\w+[^>]*>[^0-9]*([0-9]+[,.\d]+)/gi,
        /id="euro"[^>]*>[\s\S]*?([0-9]+[,.\d]+)/i,
        /class="euro"[^>]*>[\s\S]*?([0-9]+[,.\d]+)/i,
      ]

      for (const pattern of eurHtmlPatterns) {
        const matches = html.matchAll(pattern)
        for (const match of matches) {
          const rawValue = match[1].replace(/\./g, '').replace(',', '.')
          const value = parseFloat(rawValue)
          if (!isNaN(value) && value >= 15 && value <= 200) {
            results.push({ currency: 'EUR', rate: Math.round(value * 100) / 100, source: 'BCV', fetchedAt: now })
            break
          }
        }
        if (results.some(r => r.currency === 'EUR')) break
      }
    }

    // ── Strategy C: Extract all numbers and find plausible rates ──
    if (!results.some(r => r.currency === 'USD')) {
      // Find all floating point numbers in the page
      const allNumbers = [...html.matchAll(/(\d+[,]\d{2,3})/g)].map(m => {
        const v = parseFloat(m[1].replace(',', '.'))
        return { value: v, index: m.index || 0 }
      }).filter(n => n.value >= 15 && n.value <= 200)

      // BCV rates are usually close to each other (USD and EUR differ by ~10-30%)
      // Look for pairs of numbers near each other that could be USD/EUR
      if (allNumbers.length >= 2) {
        // Sort and pick the most likely candidates
        // Typically BCV rates appear as decimal numbers like "36,50" or "39,27"
        for (const num of allNumbers) {
          if (results.some(r => r.currency === 'USD')) break
          results.push({ currency: 'USD', rate: Math.round(num.value * 100) / 100, source: 'BCV-estimated', fetchedAt: now })
        }
        for (const num of allNumbers) {
          if (results.some(r => r.currency === 'EUR')) break
          if (!results.some(r => Math.abs(r.rate - num.value) < 0.01)) {
            results.push({ currency: 'EUR', rate: Math.round(num.value * 100) / 100, source: 'BCV-estimated', fetchedAt: now })
          }
        }
      }
    }
  } catch (error) {
    console.error('[BCV Direct] Failed:', error instanceof Error ? error.message : 'Unknown error')
  }

  return results
}

/**
 * Attempt 2: Try the BCV's specific exchange rate page endpoints.
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

      // Extract numbers that look like exchange rates
      const rateMatches = [...html.matchAll(/(\d+[,]\d{2})/g)]
      for (const match of rateMatches) {
        const value = parseFloat(match[1].replace(',', '.'))
        if (value >= 15 && value <= 200) {
          const foundCurrency = results.some(r => r.currency === 'USD')
          const foundEur = results.some(r => r.currency === 'EUR')

          if (!foundCurrency) {
            results.push({ currency: 'USD', rate: Math.round(value * 100) / 100, source: 'BCV-pagina', fetchedAt: now })
          } else if (!foundEur && Math.abs(results.find(r => r.currency === 'USD')!.rate - value) > 2) {
            results.push({ currency: 'EUR', rate: Math.round(value * 100) / 100, source: 'BCV-pagina', fetchedAt: now })
          }
        }
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
 * This is a Venezuelan API that mirrors the BCV rate.
 */
async function fetchPydolarve(): Promise<BcvRate[]> {
  const results: BcvRate[] = []
  const now = new Date().toISOString()

  try {
    const response = await fetch('https://pydolarve.org/api/v1/dollar', {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
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
          results.push({
            currency: 'USD',
            rate: Math.round(parseFloat(bcvMonitor.price) * 100) / 100,
            source: 'pydolarve-BCV',
            fetchedAt: now,
          })
        }
        // Also try to find EUR
        const eurMonitor = data.monitors.find((m: { name: string; title?: string }) =>
          m.name.toLowerCase().includes('euro')
        )
        if (eurMonitor?.price) {
          results.push({
            currency: 'EUR',
            rate: Math.round(parseFloat(eurMonitor.price) * 100) / 100,
            source: 'pydolarve-BCV',
            fetchedAt: now,
          })
        }
      }
    }
  } catch (error) {
    console.error('[Pydolarve] Failed:', error instanceof Error ? error.message : 'Unknown error')
  }

  return results
}

/**
 * Main function: tries all methods in order and returns the best rates found.
 */
async function fetchBcvRates(): Promise<BcvRate[]> {
  // 1. Try direct BCV scrape
  let rates = await scrapeBcvDirect()

  // 2. If we don't have USD from direct, try BCV sub-pages
  if (!rates.some(r => r.currency === 'USD')) {
    const subRates = await scrapeBcvEndpoints()
    for (const r of subRates) {
      if (!rates.some(er => er.currency === r.currency)) {
        rates.push(r)
      }
    }
  }

  // 3. If still no rates, try pydolarve as fallback
  if (!rates.some(r => r.currency === 'USD')) {
    const fallbackRates = await fetchPydolarve()
    for (const r of fallbackRates) {
      if (!rates.some(er => er.currency === r.currency)) {
        rates.push(r)
      }
    }
  }

  // 4. Absolute last resort: static fallback
  if (!rates.some(r => r.currency === 'USD')) {
    rates.push({
      currency: 'USD',
      rate: 36.50,
      source: 'fallback-estatico',
      fetchedAt: new Date().toISOString(),
    })
  }

  // If we have USD but not EUR, estimate EUR from USD (EUR ≈ USD * 1.08 roughly)
  if (rates.some(r => r.currency === 'USD') && !rates.some(r => r.currency === 'EUR')) {
    const usdRate = rates.find(r => r.currency === 'USD')!
    rates.push({
      currency: 'EUR',
      rate: Math.round(usdRate.rate * 1.08 * 100) / 100,
      source: `${usdRate.source}-estimado`,
      fetchedAt: usdRate.fetchedAt,
    })
  }

  return rates
}

// GET /api/exchange-rates - Fetch current rates from BCV
export async function GET() {
  try {
    const rates = await fetchBcvRates()

    // Store/update rates in the database
    const usdCurrency = await db.currency.findUnique({ where: { code: 'USD' } })
    const eurCurrency = await db.currency.findUnique({ where: { code: 'EUR' } })
    const vesCurrency = await db.currency.findUnique({ where: { code: 'VES' } })

    // Helper to upsert a rate
    async function upsertRate(fromId: string, toId: string, rate: number) {
      if (!fromId || !toId) return
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const existing = await db.exchangeRate.findFirst({
        where: {
          fromCurrencyId: fromId,
          toCurrencyId: toId,
          date: { gte: today },
        },
      })

      if (existing) {
        await db.exchangeRate.update({
          where: { id: existing.id },
          data: { rate },
        })
      } else {
        await db.exchangeRate.create({
          data: {
            fromCurrencyId: fromId,
            toCurrencyId: toId,
            rate,
            date: new Date(),
          },
        })
      }
    }

    // Store USD → VES
    const usdRate = rates.find(r => r.currency === 'USD')
    if (usdRate && usdCurrency && vesCurrency) {
      await upsertRate(usdCurrency.id, vesCurrency.id, usdRate.rate)
    }

    // Store EUR → VES
    const eurRate = rates.find(r => r.currency === 'EUR')
    if (eurRate && eurCurrency && vesCurrency) {
      await upsertRate(eurCurrency.id, vesCurrency.id, eurRate.rate)
    }

    // Also update the Settings exchangeRate with the reference currency rate
    const settings = await db.settings.findFirst()
    if (settings && usdRate) {
      const refCurrency = settings.referenceCurrency || 'USD'
      const refRate = rates.find(r => r.currency === refCurrency) || usdRate
      await db.settings.update({
        where: { id: settings.id },
        data: { exchangeRate: refRate.rate },
      })
    }

    return NextResponse.json({
      rates,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Exchange Rates API] Error:', error)
    return NextResponse.json(
      { error: 'Error al obtener tasas de cambio', rates: [] },
      { status: 500 }
    )
  }
}
