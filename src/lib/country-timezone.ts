/**
 * Country → IANA Timezone + Locale mapping.
 * Used by app-time.ts to derive the correct timezone from the selected country.
 */

export interface CountryTz {
  timezone: string   // IANA timezone identifier
  locale: string     // BCP 47 locale for date/number formatting
}

// ISO 3166-1 alpha-2 → timezone + locale
const COUNTRY_TZ_MAP: Record<string, CountryTz> = {
  VE: { timezone: 'America/Caracas',       locale: 'es-VE' },
  CO: { timezone: 'America/Bogota',        locale: 'es-CO' },
  MX: { timezone: 'America/Mexico_City',   locale: 'es-MX' },
  AR: { timezone: 'America/Argentina/Buenos_Aires', locale: 'es-AR' },
  PE: { timezone: 'America/Lima',          locale: 'es-PE' },
  CL: { timezone: 'America/Santiago',      locale: 'es-CL' },
  EC: { timezone: 'America/Guayaquil',     locale: 'es-EC' },
  PA: { timezone: 'America/Panama',        locale: 'es-PA' },
  DO: { timezone: 'America/Santo_Domingo', locale: 'es-DO' },
  GT: { timezone: 'America/Guatemala',     locale: 'es-GT' },
  HN: { timezone: 'America/Tegucigalpa',   locale: 'es-HN' },
  NI: { timezone: 'America/Managua',       locale: 'es-NI' },
  SV: { timezone: 'America/El_Salvador',   locale: 'es-SV' },
  CR: { timezone: 'America/Costa_Rica',    locale: 'es-CR' },
  CU: { timezone: 'America/Havana',        locale: 'es-CU' },
  UY: { timezone: 'America/Montevideo',    locale: 'es-UY' },
  PY: { timezone: 'America/Asuncion',      locale: 'es-PY' },
  BO: { timezone: 'America/La_Paz',        locale: 'es-BO' },
  BR: { timezone: 'America/Sao_Paulo',     locale: 'pt-BR' },
  US: { timezone: 'America/New_York',      locale: 'en-US' },
  CA: { timezone: 'America/Toronto',       locale: 'en-CA' },
  ES: { timezone: 'Europe/Madrid',         locale: 'es-ES' },
  DE: { timezone: 'Europe/Berlin',         locale: 'de-DE' },
  FR: { timezone: 'Europe/Paris',          locale: 'fr-FR' },
  IT: { timezone: 'Europe/Rome',           locale: 'it-IT' },
  GB: { timezone: 'Europe/London',         locale: 'en-GB' },
  CH: { timezone: 'Europe/Zurich',         locale: 'de-CH' },
  TR: { timezone: 'Europe/Istanbul',       locale: 'tr-TR' },
  JP: { timezone: 'Asia/Tokyo',            locale: 'ja-JP' },
  CN: { timezone: 'Asia/Shanghai',         locale: 'zh-CN' },
  IN: { timezone: 'Asia/Kolkata',          locale: 'en-IN' },
  AU: { timezone: 'Australia/Sydney',      locale: 'en-AU' },
}

const DEFAULT_TZ: CountryTz = { timezone: 'America/Caracas', locale: 'es-VE' }

/** Get timezone and locale for a country code */
export function getCountryTz(countryCode: string): CountryTz {
  return COUNTRY_TZ_MAP[countryCode.toUpperCase()] || DEFAULT_TZ
}

/** Get just the IANA timezone for a country code */
export function getTimezone(countryCode: string): string {
  return getCountryTz(countryCode).timezone
}

/** Get just the locale for a country code */
export function getLocale(countryCode: string): string {
  return getCountryTz(countryCode).locale
}