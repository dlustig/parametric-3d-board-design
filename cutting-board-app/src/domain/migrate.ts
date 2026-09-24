import type { Project } from './model.ts'
import { projectSchema } from './schema.ts'
import type { ValidationError } from './validate.ts'
import { validateProject } from './validate.ts'

export type ImportResult = { ok: true; project: Project } | { ok: false; error: ValidationError }

type MigrateResult = { ok: true; value: unknown } | { ok: false; error: ValidationError }

/** Upgrades a parsed document to the current `schemaVersion` (1), or reports why it can't. */
function migrate(parsed: unknown): MigrateResult {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: { path: '', message: 'expected a JSON object' } }
  }
  const version = (parsed as { schemaVersion?: unknown }).schemaVersion
  if (version === 1) {
    return { ok: true, value: parsed }
  }
  return {
    ok: false,
    error: { path: 'schemaVersion', message: `unsupported schemaVersion ${String(version)}` },
  }
}

/** Parses, migrates, schema-validates, then invariant-validates a project document. */
export function importProject(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: { path: '', message: 'not valid JSON' } }
  }

  const migrated = migrate(parsed)
  if (!migrated.ok) return migrated

  const parseResult = projectSchema.safeParse(migrated.value)
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0]
    return {
      ok: false,
      error: {
        path: issue !== undefined ? issue.path.join('.') : '',
        message: issue !== undefined ? issue.message : 'invalid project',
      },
    }
  }

  const invalid = validateProject(parseResult.data)
  if (invalid !== null) return { ok: false, error: invalid }

  return { ok: true, project: parseResult.data }
}
