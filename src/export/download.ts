// Browser downloads: generated text, the project file and the SVG export.
// The project/SVG helpers moved here from ProjectMenu so the top bar, the
// project menu and the keyboard dispatcher share them. DOM code; only the
// filename rule is unit-tested.

import type { Project } from '@/domain/model'
import { exportSvg } from './svg.ts'

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Replaces characters a filesystem might reject with `_`; an empty name falls back to "project". */
export function sanitizeFilenamePart(name: string): string {
  const sanitized = name.replace(/[^A-Za-z0-9 _-]/g, '_')
  return sanitized === '' ? 'project' : sanitized
}

export function downloadProject(p: Project): void {
  downloadText(`${sanitizeFilenamePart(p.name)}.cbpd.json`, JSON.stringify(p, null, 2), 'application/json')
}

export function downloadExportSvg(p: Project): void {
  downloadText(`${sanitizeFilenamePart(p.name)}.svg`, exportSvg(p), 'image/svg+xml')
}
