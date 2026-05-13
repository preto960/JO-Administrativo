import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

interface BcvRate {
  currency: string
  rate: number
  source: string
  fetchedAt: string
}

/**
 * Scrape exchange rates from Banco Central de Venezuela (BCV).
 * Fetches the official page and extracts USD and EUR rates.
 */
async function fetchBcvRates(): Promise<BcvRate[]> {
  const results: BcvRate[] = []

  try {
    // BCV official exchange rate page
    const response = await fetch('https://www.bcv.org.ve/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      throw new Error(`BCV returned ${response.status}`)
    }

    const html = await response.text()

    // Extract rates from BCV HTML
    // BCV typically shows rates in elements with specific classes/ids
    // Pattern 1: Look for "dólar" / "euro" near rate values
    const ratePatterns = [
      // Try to find USD rate
      { regex: /d[ií]lar[^0-9]*(\d+[,.\d]+)/gi, currency: 'USD' },
      { regex: /USD[^0-9]*(\d+[,.\d]+)/gi, currency: 'USD' },
      { regex: /conforme[\s\S]*?(\d+[,.\d]+)/gi, currency: 'USD' },
      // Try to find EUR rate
      { regex: /euro[^0-9]*(\d+[,.\d]+)/gi, currency: 'EUR' },
      { regex: /EUR[^0-9]*(\d+[,.\d]+)/gi, currency: 'EUR' },
    ]

    const found = new Map<string, number>()

    for (const pattern of ratePatterns) {
      const matches = html.matchAll(pattern.regex)
      for (const match of matches) {
        const rawValue = match[1].replace(/\./g, '').replace(',', '.')
        const value = parseFloat(rawValue)
        // BCV rates are typically between 20 and 100 for USD, similar for EUR
        if (!isNaN(value) && value >= 15 && value <= 200 && !found.has(pattern.currency)) {
          found.set(pattern.currency, Math.round(value * 100) / 100)
          break
        }
      }
    }

    // Pattern 2: Look for any numbers near "tipo de cambio" or "tasa"
    if (!found.has('USD')) {
      const tasaRegex = /tipo\s+(?:de\s+)?cambio[^0-9]*(\d+[,.\d]+)/gi
      const tasaMatch = tasaRegex.exec(html)
      if (tasaMatch) {
        const rawValue = tasaMatch[1].replace(/\./g, '').replace(',', '.')
        const value = parseFloat(rawValue)
        if (!isNaN(value) && value >= 15 && value <= 200) {
          found.set('USD', Math.round(value * 100) / 100)
        }
      }
    }

    // Pattern 3: Look for JSON data embedded in script tags
    if (!found.has('USD') || !found.has('EUR')) {
      const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi)
      if (scriptMatch) {
        for (const script of scriptMatch) {
          // Look for JSON-like structures with rates
          const usdMatch = script.match(/(?:usd|dolar)["\s:]+(\d+\.?\d*)/i)
          const eurMatch = script.match(/(?:eur|euro)["\s:]+(\d+\.?\d*)/i)
          if (usdMatch && !found.has('USD')) {
            const v = parseFloat(usdMatch[1])
            if (!isNaN(v) && v >= 15 && v <= 200) found.set('USD', Math.round(v * 100) / 100)
          }
          if (eurMatch && !found.has('EUR')) {
            const v = parseFloat(eurMatch[1])
            if (!isNaN(v) && v >= 15 && v <= 200) found.set('EUR', Math.round(v * 100) / 100)
          }
        }
      }
    }

    const now = new Date().toISOString()

    if (found.has('USD')) {
      results.push({
        currency: 'USD',
        rate: found.get('USD')!,
        source: 'BCV',
        fetchedAt: now,
      })
    }

    if (found.has('EUR')) {
      results.push({
        currency: 'EUR',
        rate: found.get('EUR')!,
        source: 'BCV',
        fetchedAt: now,
      })
    }

    // If we couldn't scrape, use a fallback indicator
    if (results.length === 0) {
      // Try alternative endpoint or API
      try {
        const altResponse = await fetch('https://pydolarve.org/api/v1/dollar', {
          signal: AbortSignal.timeout(10000),
        })
        if (altResponse.ok) {
          const altData = await altResponse.json()
          if (altData.monitors) {
            const bcv = altData.monitors.find((m: { name: string }) =>
              m.name.toLowerCase().includes('bcv') || m.name.toLowerCase().includes('oficial')
            )
            if (bcv?.price) {
              results.push({
                currency: 'USD',
                rate: Math.round(parseFloat(bcv.price) * 100) / 100,
                source: 'pydolarve',
                fetchedAt: now,
              })
            }
          }
        }
      } catch {
        // Last resort: use a static fallback (this should rarely happen)
        results.push({
          currency: 'USD',
          rate: 36.50,
          source: 'fallback',
          fetchedAt: now,
        })
      }
    }
  } catch (error) {
    // On error, return fallback
    results.push({
      currency: 'USD',
      rate: 36.50,
      source: 'fallback',
      fetchedAt: new Date().toISOString(),
    })
  }

  return results
}

// GET /api/exchange-rates - Fetch current rates and return them
export async function GET() {
  try {
    const rates = await fetchBcvRates()

    // Also store/update rates in the database
    const usdCurrency = await db.currency.findUnique({ where: { code: 'USD' } })
    const eurCurrency = await db.currency.findUnique({ where: { code: 'EUR' } })
    const vesCurrency = await db.currency.findUnique({ where: { code: 'VES' } })

    if (usdCurrency && vesCurrency) {
      const usdRate = rates.find(r => r.currency === 'USD')
      if (usdRate) {
        // Upsert: update if exists today, create if not
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const existing = await db.exchangeRate.findFirst({
          where: {
            fromCurrencyId: usdCurrency.id,
            toCurrencyId: vesCurrency.id,
            date: { gte: today },
          },
        })

        if (existing) {
          await db.exchangeRate.update({
            where: { id: existing.id },
            data: { rate: usdRate.rate },
          })
        } else {
          await db.exchangeRate.create({
            data: {
              fromCurrencyId: usdCurrency.id,
              toCurrencyId: vesCurrency.id,
              rate: usdRate.rate,
              date: new Date(),
            },
          })
        }
      }
    }

    if (eurCurrency && vesCurrency) {
      const eurRate = rates.find(r => r.currency === 'EUR')
      if (eurRate) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const existing = await db.exchangeRate.findFirst({
          where: {
            fromCurrencyId: eurCurrency.id,
            toCurrencyId: vesCurrency.id,
            date: { gte: today },
          },
        })

        if (existing) {
          await db.exchangeRate.update({
            where: { id: existing.id },
            data: { rate: eurRate.rate },
          })
        } else {
          await db.exchangeRate.create({
            data: {
              fromCurrencyId: eurCurrency.id,
              toCurrencyId: vesCurrency.id,
              rate: eurRate.rate,
              date: new Date(),
            },
          })
        }
      }
    }

    return NextResponse.json({
      rates,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Error al obtener tasas de cambio', rates: [] },
      { status: 500 }
    )
  }
}
