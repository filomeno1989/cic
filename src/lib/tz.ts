// ============================================================
// Fuso horário de Moçambique (Africa/Maputo, UTC+2, sem DST).
// O servidor (ex: Vercel) corre em UTC - sem estas funções,
// "hoje" começaria às 02:00 da manhã de Maputo e a folha mensal
// cortaria os dias no sítio errado.
// ============================================================

export const MZ_OFFSET_MS = 2 * 60 * 60 * 1000 // UTC+2

/** Desloca um instante para o relógio de parede de Maputo. */
function toMzWall(date: Date): Date {
  return new Date(date.getTime() + MZ_OFFSET_MS)
}

/** Desloca um "relógio de parede" de Maputo de volta para instante real (UTC). */
function fromMzWall(date: Date): Date {
  return new Date(date.getTime() - MZ_OFFSET_MS)
}

/** Início do dia N (0 = hoje, -1 = ontem...) às 00:00 de Maputo, como instante real. */
export function startOfDayMZ(dayOffset = 0): Date {
  const wall = toMzWall(new Date())
  wall.setUTCHours(0, 0, 0, 0)
  wall.setUTCDate(wall.getUTCDate() + dayOffset)
  return fromMzWall(wall)
}

/** "Hoje" às 00:00 de Maputo (atalho legível). */
export function startOfTodayMZ(): Date {
  return startOfDayMZ(0)
}

/** Intervalo do mês (1-12) em Maputo: [início, fim) como instantes reais. */
export function monthRangeMZ(year: number, month1to12: number): { start: Date; end: Date } {
  const start = fromMzWall(new Date(Date.UTC(year, month1to12 - 1, 1)))
  const end = fromMzWall(new Date(Date.UTC(year, month1to12, 1)))
  return { start, end }
}

// ---------- v2.6 (D9): também no CLIENTE ----------
// Ficheiro puro (sem imports de servidor) - pode ser usado em componentes
// "use client". O aparelho da loja pode ter o relógio/fuso errado; com as
// funções abaixo, "hoje" e "este mês" são SEMPRE o relógio de Maputo.

/** Relógio de parede de Maputo: use os getters UTC (getUTCFullYear, etc.). */
export function wallClockMZ(now = new Date()): Date {
  return new Date(now.getTime() + MZ_OFFSET_MS)
}

/** Instante real das 00:00 de Maputo no dia indicado (Y, M 0-11, D). */
export function mzMidnight(y: number, m0to11: number, d: number): Date {
  return new Date(Date.UTC(y, m0to11, d) - MZ_OFFSET_MS)
}

/** Instante real das 23:59:59.999 de Maputo no dia indicado. */
export function mzEndOfDay(y: number, m0to11: number, d: number): Date {
  return new Date(Date.UTC(y, m0to11, d + 1) - MZ_OFFSET_MS - 1)
}

/** Mês atual (YYYY-MM) no relógio de Maputo - nunca erra entre 00:00 e
 *  01:59 da manhã do dia 1 (antes usava toISOString = UTC). */
export function currentMonthMZ(now = new Date()): string {
  return wallClockMZ(now).toISOString().slice(0, 7)
}

/** Data de hoje no relógio de Maputo, em partes (ano, mês 1-12, dia). */
export function todayPartsMZ(now = new Date()): { y: number; m: number; d: number } {
  const w = wallClockMZ(now)
  return { y: w.getUTCFullYear(), m: w.getUTCMonth() + 1, d: w.getUTCDate() }
}
