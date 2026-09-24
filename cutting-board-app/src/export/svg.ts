// SPEC §10: standalone SVG export — serialises `buildScene(project,
// EXPORT_CLIP_EXTEND_MM)` with no classes, CSS, or external references.

import type { Project } from '@/domain/model'
import type { SceneElement } from '@/geometry/scene'
import { buildScene, formatNumber, pathD } from '@/geometry/scene'
import { EXPORT_CLIP_EXTEND_MM, REGION_SEAM_MM } from '@/geometry/tolerance'

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** A fresh id prefix, so several exported SVGs can be inlined in one document. */
function newPrefix(): string {
  return `cb${crypto.randomUUID().slice(0, 8)}`
}

function bandAttrs(color: string, width: number): string {
  return `fill="none" stroke="${escapeXml(color)}" stroke-width="${formatNumber(width)}" stroke-linejoin="miter" stroke-miterlimit="10" stroke-linecap="butt"`
}

export function exportSvg(p: Project): string {
  const scene = buildScene(p, EXPORT_CLIP_EXTEND_MM)
  const prefix = newPrefix()
  const colors = new Map(p.materials.map((m) => [m.id, m.color]))
  const colorOf = (materialId: string): string => colors.get(materialId)!
  const w = formatNumber(p.board.widthMm)
  const h = formatNumber(p.board.heightMm)
  const background = p.board.backgroundMaterialId === null ? 'none' : colorOf(p.board.backgroundMaterialId)

  const clipPaths: string[] = []
  const draw = (el: SceneElement): string => {
    if (el.kind === 'region') {
      const c = escapeXml(colorOf(el.occurrence.materialId))
      return `<path d="${pathD(el.occurrence.worldPoints, true)}" fill="${c}" fill-rule="nonzero" stroke="${c}" stroke-width="${formatNumber(REGION_SEAM_MM)}"/>`
    }
    if (el.kind === 'band') {
      const o = el.occurrence
      return `<path d="${pathD(o.worldPoints, o.closed)}" ${bandAttrs(colorOf(o.materialId), o.worldWidth)}/>`
    }
    const id = `${prefix}-c${clipPaths.length}`
    const points = el.clip.map((pt) => `${formatNumber(pt.x)},${formatNumber(pt.y)}`).join(' ')
    clipPaths.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><polygon points="${points}"/></clipPath>`)
    return `<path d="${pathD(el.segment, false)}" ${bandAttrs(colorOf(el.over.materialId), el.over.worldWidth)} clip-path="url(#${id})"/>`
  }
  const body = scene.elements.map(draw).join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`,
    `<title>${escapeXml(p.name)}</title>`,
    `<defs><clipPath id="${prefix}-board"><rect width="${w}" height="${h}"/></clipPath>${clipPaths.join('')}</defs>`,
    `<g clip-path="url(#${prefix}-board)"><rect width="${w}" height="${h}" fill="${escapeXml(background)}"/>${body}</g>`,
    '</svg>',
    '',
  ].join('\n')
}
