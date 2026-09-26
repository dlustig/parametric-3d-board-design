// Shell spec §13: one inspector section — a 12 px weight-600 title over its
// fields. Points, Segments, Crossings and Overrides collapse: a
// `<details open>` whose `<summary>` is the title. The collapsed state is
// the browser's and is not persisted.

import type { JSX, ReactNode } from 'react'

export function Section({ title, collapsible, children }: { title: string; collapsible?: boolean; children: ReactNode }): JSX.Element {
  if (collapsible === true) {
    return (
      <details className="section" open>
        <summary className="section-title">{title}</summary>
        {children}
      </details>
    )
  }
  return (
    <section className="section">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  )
}
