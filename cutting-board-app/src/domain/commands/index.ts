// SPEC §7.1: commands are pure `(project, args) → project`. Commands that can
// be refused return a CommandResult; the store shows the message.

import type { Project } from '@/domain/model'

export type CommandResult = { ok: true; project: Project } | { ok: false; message: string }

export * from './board.ts'
export * from './crossings.ts'
export * from './materials.ts'
export * from './objects.ts'
export * from './order.ts'
export * from './points.ts'
