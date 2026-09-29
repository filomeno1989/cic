import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"
import { buildBackupPayload, LIMITE_JSON } from "@/lib/backup-payload"
import { MZ_OFFSET_MS } from "@/lib/tz"

/*
 * BACKUP AUTOMÁTICO DIÁRIO (v3.0, M2 da varredura de melhorias)
 * ------------------------------------------------------------
 * M2 pedia "backup agendado". Em vez de cron externo (que exigiria
 * chaves na Vercel), o sistema faz o snapshot sozinho: 1x por dia
 * (a 1ª sessão de gerente do dia dispara; o servidor deduplica),
 * guardado na PRÓPRIA base de dados - protege contra erros lógicos
 * (restauro mau, eliminação acidental). Mantém os ÚLTIMOS 7.
 *
 * GET            → lista dos snapshots (sem o JSON)
 * GET ?id=...    → devolve o JSON do snapshot (formato idêntico ao
 *                  export manual - serve para restaurar)
 * POST           → cria o snapshot de HOJE se ainda não existir
 *
 * Formato: exactamente o mesmo do export manual (meta.app CIC-backup,
 * version 2) - restaura com o fluxo normal de "Restaurar backup".
 */

const MANTER = 7

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode ver os backups automáticos")

    const id = new URL(req.url).searchParams.get("id")
    if (id) {
      const snap = await db.backupAuto.findUnique({ where: { id } })
      if (!snap) return NextResponse.json({ error: "Snapshot não encontrado" }, { status: 404 })
      // Devolve o JSON puro (igual ao export manual)
      return new NextResponse(snap.json, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="backup-automatico-${snap.data}.json"`,
        },
      })
    }

    const snaps = await db.backupAuto.findMany({
      orderBy: { data: "desc" },
      take: MANTER,
      select: { id: true, data: true, tamanho: true, comFotos: true, criadoEm: true },
    })
    return NextResponse.json({ snaps })
  } catch {
    return NextResponse.json({ error: "Erro ao listar backups automáticos" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode criar backups automáticos")

    // dia de Maputo (YYYY-MM-DD) - o mesmo critério da folha/relatórios (D9)
    const agora = new Date()
    const data = new Date(agora.getTime() + MZ_OFFSET_MS).toISOString().slice(0, 10)

    const existente = await db.backupAuto.findUnique({ where: { data } })
    if (existente) {
      return NextResponse.json({
        ok: true,
        jaExiste: true,
        snapshot: { id: existente.id, data: existente.data, tamanho: existente.tamanho, comFotos: existente.comFotos, criadoEm: existente.criadoEm },
      })
    }

    // Tenta COM fotos; se passar do limite, guarda SEM fotos (como o export manual)
    let { json } = await buildBackupPayload(false)
    let comFotos = true
    if (json.length > LIMITE_JSON) {
      json = (await buildBackupPayload(true)).json
      comFotos = false
    }

    const snap = await db.backupAuto.create({
      data: { data, json, tamanho: json.length, comFotos },
    })

    // Rotação: mantém apenas os últimos 7 dias
    const todos = await db.backupAuto.findMany({ orderBy: { data: "desc" } })
    const velhos = todos.slice(MANTER)
    if (velhos.length > 0) {
      await db.backupAuto.deleteMany({ where: { id: { in: velhos.map((s) => s.id) } } })
    }

    return NextResponse.json({
      ok: true,
      jaExiste: false,
      snapshot: { id: snap.id, data: snap.data, tamanho: snap.tamanho, comFotos: snap.comFotos, criadoEm: snap.criadoEm },
    })
  } catch {
    return NextResponse.json({ error: "Erro ao criar o backup automático" }, { status: 500 })
  }
}
