import { describe, expect, it } from 'vitest'
import type { Project } from '@/domain/model'
import { band, MAT2, project, record, ref, region } from '@/domain/test-builders'
import { escapeXml, exportSvg } from './svg.ts'

// A region under two bands; O (walnut) is set over U although painted first, so the export has a patch.
function sample(overrides: Partial<Project> = {}): Project {
  const o = band('O', [[0, 50], [100, 50]], { materialId: MAT2 })
  const u = band('U', [[50, 0], [50, 100]])
  const base = project([region('R', [[10, 10], [90, 10], [90, 90]]), o, u], [], [record('r', ref('O', 'O0'), ref('U', 'U0'), 'a', { x: 50, y: 50 })])
  return { ...base, ...overrides }
}

function prefixOf(svg: string): string {
  return /id="([^"-]+)-board"/.exec(svg)![1]!
}

describe('exportSvg', () => {
  it('starts with the root element sized in mm with a matching viewBox', () => {
    expect(exportSvg(sample())).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="300mm" height="450mm" viewBox="0 0 300 450">/)
  })

  it('escapes the project name in <title>', () => {
    const svg = exportSvg(sample({ name: '<b>' }))
    expect(svg).toContain('<title>&lt;b&gt;</title>')
    const odd = exportSvg(sample({ name: '"x"&y' }))
    expect(odd).not.toContain('"x"&y')
    expect(odd).toContain('&quot;x&quot;&amp;y')
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;')
  })

  it('draws regions filled with a seam stroke, bands and patches as mitred strokes', () => {
    const svg = exportSvg(sample())
    const p = prefixOf(svg)
    expect(svg).toContain('<path d="M 10 10 L 90 10 L 90 90 Z" fill="#E8D4A8" fill-rule="nonzero" stroke="#E8D4A8" stroke-width="0.1"/>')
    const bandAttrs = 'fill="none" stroke="#5C3A21" stroke-width="6" stroke-linejoin="miter" stroke-miterlimit="10" stroke-linecap="butt"'
    expect(svg).toContain(`<path d="M 0 50 L 100 50" ${bandAttrs}/>`)
    expect(svg).toContain(`<path d="M 0 50 L 100 50" ${bandAttrs} clip-path="url(#${p}-c0)"/>`)
    expect(svg).toContain(`<clipPath id="${p}-c0" clipPathUnits="userSpaceOnUse"><polygon points="`)
    // The patch is painted after U.
    expect(svg.indexOf(`clip-path="url(#${p}-c0)"`)).toBeGreaterThan(svg.indexOf('d="M 50 0 L 50 100"'))
  })

  it('prefixes every id and uses a fresh prefix per call', () => {
    const first = exportSvg(sample())
    const second = exportSvg(sample())
    const p = prefixOf(first)
    const ids = [...first.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!)
    expect(ids).toEqual([`${p}-board`, `${p}-c0`])
    expect(prefixOf(second)).not.toBe(p)
  })

  it('has no classes, styles, or external references', () => {
    const svg = exportSvg(sample())
    expect(svg).not.toContain('class=')
    expect(svg).not.toContain('style=')
    expect(svg).not.toMatch(/url\((?!#)/)
  })

  it('fills the board rect with the background material colour, or none', () => {
    const svg = exportSvg(sample())
    expect(svg).toContain(`<g clip-path="url(#${prefixOf(svg)}-board)"><rect width="300" height="450" fill="none"/>`)
    const walnut = sample({ board: { widthMm: 300, heightMm: 450, backgroundMaterialId: MAT2 } })
    expect(exportSvg(walnut)).toContain('<rect width="300" height="450" fill="#5C3A21"/>')
  })
})
