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
