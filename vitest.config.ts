/**
 * Test configuration for this repository.
 *
 * Present for two reasons:
 *
 * 1. **The suite must not inherit an ancestor's config.** While this package is
 *    developed inside a DeepSeek Harness checkout, Vitest walks up, adopts the
 *    checkout's `vitest.config.ts`, and then reports "No test files found"
 *    against that repository's project globs. `pnpm-workspace.yaml` exists here
 *    for the same reason: a nested repository owns its own tool roots.
 *
 * 2. **Vite's default parser cannot read the standard TypeScript decorators the
 *    service uses** (`@Remote`). The plugin below lowers them with the TypeScript
 *    compiler before that parser sees the file. Adapted from the Harness's
 *    `vitest.shared.ts` (`standardDecoratorPlugin`, MIT, Copyright (c) 2026
 *    DeepSeek); `typescript` is already a dev dependency here.
 *
 * @module dsh-journal-calendar/vitest.config
 */

import ts from 'typescript'
import { defineConfig } from 'vitest/config'

const DECORATOR_SYNTAX = /^\s*@[A-Za-z_$][\w$]*/m

/**
 * Lower standard TypeScript decorators before Vite's default parser sees source files.
 * @returns a pre-transform Vite plugin.
 */
function standardDecorators() {
  return {
    name: 'dsh-journal-standard-decorators',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.split('?', 1)[0] ?? id
      if (!/\.[cm]?tsx?$/.test(file) || !DECORATOR_SYNTAX.test(code)) return
      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.ESNext,
          jsx: file.endsWith('x') ? ts.JsxEmit.ReactJSX : undefined,
          sourceMap: true,
        },
      })
      return {
        code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
        map: result.sourceMapText,
      }
    },
  }
}

export default defineConfig({
  plugins: [standardDecorators()],
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
  },
})
