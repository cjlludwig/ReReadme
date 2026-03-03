#!/usr/bin/env node

// rereadme - CLI tool to automatically update README files
import { $, fs, path, argv } from 'zx'
import { fileURLToPath } from 'url'
import { runAgentWorkflow, runDiffWorkflow, type WorkflowStats } from './lib/runner.js'
import { renderSuggestions, applyPatches } from './lib/readme-utils.js'
import { validateTemplate } from './lib/validate.js'
import * as log from './lib/logger.js'
import pc from 'picocolors'

// Get the directory where this script is located (for accessing templates)
const SCRIPT_FILE = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(SCRIPT_FILE)

// Configuration — argv is typed as Record<string, unknown> by zx
const args = argv as Record<string, unknown>
$.verbose = Boolean(args.verbose)
log.setVerbose(Boolean(args.verbose))
const OPENAI_MODEL = typeof args.model === 'string' ? args.model : 'gpt-5-nano'
const OUTPUT_FILE = typeof args.output === 'string' ? args.output : 'README.md'
const GENERATE_AGENTS = Boolean(args.agents)
const AGENTS_OUTPUT_FILE = typeof args['agents-output'] === 'string' ? args['agents-output'] : 'AGENTS.md'
const SKIP_BACKUP = Boolean(args['no-backup'])
const CI_MODE = Boolean(args.ci)
const APPLY_MODE = Boolean(args.apply)
const BASE_REF = typeof args['base-ref'] === 'string' ? args['base-ref'] : 'main'
const HEAD_REF = typeof args['head-ref'] === 'string' ? args['head-ref'] : 'HEAD'
const CI_OUTPUT = typeof args['ci-output'] === 'string' ? args['ci-output'] : 'README-suggestions.md'
const CUSTOM_README_TEMPLATE = typeof args.template === 'string' ? args.template : undefined
const CUSTOM_AGENTS_TEMPLATE = typeof args['agents-template'] === 'string' ? args['agents-template'] : undefined
const STATS_OUTPUT = typeof args['stats-output'] === 'string' ? args['stats-output'] : undefined

async function checkGitRepo(): Promise<boolean> {
  try {
    const result = await $({ nothrow: true, quiet: true })`git rev-parse --git-dir`
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function checkDependencies(): Promise<boolean> {
  const errors: string[] = []

  try {
    const result = await $({ nothrow: true, quiet: true })`markdownlint --version`
    if (result.exitCode === 0) {
      log.detail('markdownlint-cli found')
    } else {
      errors.push(`markdownlint-cli not found\n${pc.dim('  Fix: npm install')}`)
    }
  } catch {
    errors.push(`markdownlint-cli not found\n${pc.dim('  Fix: npm install')}`)
  }

  if (!process.env.OPENAI_API_KEY) {
    errors.push(`OPENAI_API_KEY not set\n${pc.dim('  Fix: export OPENAI_API_KEY=sk-...')}`)
  } else {
    log.detail('OpenAI API key found')
  }

  if (!await checkGitRepo()) {
    errors.push(`Not a git repository\n${pc.dim('  Fix: run git init or navigate to a git repo')}`)
  } else {
    log.detail('git repository found')
  }

  for (const msg of errors) { log.error(msg) }
  return errors.length === 0
}

export async function checkCiDependencies(): Promise<boolean> {
  const errors: string[] = []

  if (!process.env.OPENAI_API_KEY) {
    errors.push(`OPENAI_API_KEY not set\n${pc.dim('  Fix: export OPENAI_API_KEY=sk-...')}`)
  } else {
    log.detail('OpenAI API key found')
  }

  let gitAvailable = false
  try {
    const result = await $({ nothrow: true, quiet: true })`git --version`
    if (result.exitCode === 0) {
      log.detail('git found')
      gitAvailable = true
    } else {
      errors.push(`git not found\n${pc.dim('  Fix: install git')}`)
    }
  } catch {
    errors.push(`git not found\n${pc.dim('  Fix: install git')}`)
  }

  if (gitAvailable && !await checkGitRepo()) {
    errors.push(`Not a git repository\n${pc.dim('  Fix: run git init or navigate to a git repo')}`)
  } else if (gitAvailable) {
    log.detail('git repository found')
  }

  for (const msg of errors) { log.error(msg) }
  return errors.length === 0
}

export async function runCiWorkflow(): Promise<void> {
  const startTime = Date.now()
  try {
    log.intro('rereadme --ci')
    log.detail(`Analyzing diff: ${BASE_REF}...${HEAD_REF}`)

    log.step('Checking dependencies')
    if (!await checkCiDependencies()) { throw new Error('Missing required dependencies') }

    const spinner = log.createSpinner()
    spinner.start(`Analyzing diff ${BASE_REF}...${HEAD_REF}`)
    log.setSpinner(spinner)
    let result: Awaited<ReturnType<typeof runDiffWorkflow>>
    try {
      result = await runDiffWorkflow({
        model: OPENAI_MODEL,
        inputFile: 'README.md',
        baseRef: BASE_REF,
        headRef: HEAD_REF,
        verbose: Boolean(args.verbose),
      })
      log.setSpinner(null)
      spinner.stop('Diff analysis complete')
    } catch (e) {
      log.setSpinner(null)
      spinner.stop('Diff analysis failed')
      throw e
    }

    if (!result.significant) {
      log.detail(`Signal level: ${result.analysis.signalLevel}`)
      log.detail(`Reason: ${result.analysis.significanceReason}`)
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      if (result.noExcerptsFound) {
        log.outro(`Done in ${elapsed}s — no README sections matched, no output written`)
      } else {
        log.outro(`Done in ${elapsed}s — no output written`)
      }
      return
    }

    // Write suggestions file
    log.step(`Writing ${CI_OUTPUT}`)
    const currentReadme = await fs.pathExists('README.md')
      ? String(await fs.readFile('README.md', 'utf-8'))
      : ''
    const updatedReadme = currentReadme ? applyPatches(currentReadme, result.suggestions!) : undefined
    await fs.writeFile(CI_OUTPUT, renderSuggestions(result.suggestions!, updatedReadme).trim() + '\n')
    log.detail(`${CI_OUTPUT} written`)

    if (APPLY_MODE && updatedReadme) {
      log.step('Applying patches to README.md')
      if (!SKIP_BACKUP && await fs.pathExists('README.md')) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        await fs.copy('README.md', `README.backup-${timestamp}.md`)
      }
      await fs.writeFile('README.md', updatedReadme.trim() + '\n')
      log.detail(`README.md updated with ${result.suggestions!.changes.length} change(s)`)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    log.outro(`Done in ${elapsed}s — review ${CI_OUTPUT}`)

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error(errorMessage)
    process.exit(1)
  }
}

export async function runApplyWorkflow(): Promise<void> {
  const startTime = Date.now()
  try {
    log.intro('rereadme --apply')

    if (!await fs.pathExists(CI_OUTPUT)) {
      log.error(`No suggestions file found: ${CI_OUTPUT}\n  Run 'rereadme --ci' first`)
      process.exit(1)
    }

    const suggestionsContent = String(await fs.readFile(CI_OUTPUT, 'utf-8'))
    const match = suggestionsContent.match(/``````markdown\n([\s\S]*?)\n``````/)
    if (!match) {
      log.error(`Could not extract updated README from ${CI_OUTPUT}`)
      process.exit(1)
    }
    const updatedReadme = match[1]

    log.step('Writing README.md')
    if (!SKIP_BACKUP && await fs.pathExists('README.md')) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      await fs.copy('README.md', `README.backup-${timestamp}.md`)
    }
    await fs.writeFile('README.md', updatedReadme.trim() + '\n')

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    log.outro(`Done in ${elapsed}s — README.md updated`)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error(errorMessage)
    process.exit(1)
  }
}

async function readFile(filePath: string): Promise<string> {
  try {
    if (await fs.pathExists(filePath)) {
        return await fs.readFile(filePath, 'utf-8')
    }
    throw new Error(`File does not exist: ${filePath}`)
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}`, { cause: error })
  }
}

export async function updateReadme(content: string): Promise<void> {
  // Backup current README if it exists
  if (!SKIP_BACKUP) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    try {
      if (await fs.pathExists(OUTPUT_FILE)) {
        const ext = path.extname(OUTPUT_FILE)
        const base = OUTPUT_FILE.slice(0, -ext.length || undefined)
        const backupPath = `${base}.backup-${timestamp}${ext}`
        await fs.copy(OUTPUT_FILE, backupPath)
        log.detail(`Backed up ${OUTPUT_FILE} to ${backupPath}`)
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      log.warn(`Could not backup ${OUTPUT_FILE}: ${msg}`)
    }
  }

  // Write new README
  await fs.writeFile(OUTPUT_FILE, content.trim() + '\n')
  log.detail(`${OUTPUT_FILE} written`)
}

export async function formatReadme(): Promise<void> {
  log.detail(`Formatting ${OUTPUT_FILE} with markdownlint`)
  const fixResult = await $({ nothrow: true })`markdownlint --fix --disable MD013 -- ${OUTPUT_FILE}`
  if (fixResult.exitCode === 0) {
    log.detail(`${OUTPUT_FILE} formatted`)
  } else {
    log.warn(`Some markdown issues in ${OUTPUT_FILE} may need manual fixing`)
    if (fixResult.stderr) { log.detail(fixResult.stderr.trim()) }
    if (fixResult.stdout) { log.detail(fixResult.stdout.trim()) }
  }
}

export async function runWorkflow(): Promise<void> {
  const startTime = Date.now()
  try {
    log.intro('rereadme')

    // Secondary metadata — verbose only
    if (OUTPUT_FILE !== 'README.md') { log.detail(`Output: ${OUTPUT_FILE}`) }
    if (OPENAI_MODEL !== 'gpt-5-nano') { log.detail(`Model: ${OPENAI_MODEL}`) }

    // Dependencies
    log.step('Checking dependencies')
    if (!await checkDependencies()) { throw new Error('Missing required dependencies') }

    if (args.interactive) {
      const ok = await log.confirm({ message: 'Dependencies OK. Start agent workflow?' })
      if (log.isCancel(ok) || ok === false) {
        log.outro('Aborted.')
        return
      }
    }

    if (CUSTOM_AGENTS_TEMPLATE && !GENERATE_AGENTS) {
      log.warn('--agents-template has no effect without --agents')
    }

    const readmeTemplate = CUSTOM_README_TEMPLATE
      ? await validateTemplate(CUSTOM_README_TEMPLATE, 'README template')
      : await readFile(path.join(SCRIPT_DIR, 'templates/README_TEMPLATE.md'))

    const agentsTemplate = GENERATE_AGENTS
      ? CUSTOM_AGENTS_TEMPLATE
        ? await validateTemplate(CUSTOM_AGENTS_TEMPLATE, 'Agents template')
        : await readFile(path.join(SCRIPT_DIR, 'templates/AGENTS_TEMPLATE.md'))
      : undefined

    // Spinner for the only long-running async step
    const spinner = log.createSpinner()
    spinner.start('Running agent workflow')
    log.setSpinner(spinner)
    let readmeContent: string
    let agentsContent: string | undefined
    let workflowStats: WorkflowStats | undefined
    try {
      const result = await runAgentWorkflow({
        model: OPENAI_MODEL,
        readmeTemplate, agentsTemplate, verbose: Boolean(args.verbose),
      })
      readmeContent = result.readme
      agentsContent = result.agents
      workflowStats = result.stats
      log.setSpinner(null)
      spinner.stop('Agent workflow complete')
    } catch (e) {
      log.setSpinner(null)
      spinner.stop('Agent workflow failed')
      throw e
    }

    // Write stats JSON if requested
    if (STATS_OUTPUT && workflowStats !== undefined) {
      await fs.writeFile(STATS_OUTPUT, JSON.stringify(workflowStats, null, 2) + '\n')
      log.detail(`Stats written to ${STATS_OUTPUT}`)
    }

    // Write README
    log.step(`Writing ${OUTPUT_FILE}`)
    await updateReadme(readmeContent)

    // Write AGENTS.md if requested
    if (agentsContent !== undefined) {
      if (!SKIP_BACKUP) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        try {
          if (await fs.pathExists(AGENTS_OUTPUT_FILE)) {
            const ext = path.extname(AGENTS_OUTPUT_FILE)
            const base = AGENTS_OUTPUT_FILE.slice(0, -ext.length || undefined)
            const backupPath = `${base}.backup-${timestamp}${ext}`
            await fs.copy(AGENTS_OUTPUT_FILE, backupPath)
            log.detail(`Backed up ${AGENTS_OUTPUT_FILE} to ${backupPath}`)
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error)
          log.warn(`Could not backup ${AGENTS_OUTPUT_FILE}: ${msg}`)
        }
      }
      log.step(`Writing ${AGENTS_OUTPUT_FILE}`)
      await fs.writeFile(AGENTS_OUTPUT_FILE, agentsContent.trim() + '\n')
      log.detail(`${AGENTS_OUTPUT_FILE} written`)
      const agentsFix = await $({ nothrow: true })`markdownlint --fix --disable MD013 -- ${AGENTS_OUTPUT_FILE}`
      if (agentsFix.exitCode !== 0) {
        log.warn(`Some markdown issues in ${AGENTS_OUTPUT_FILE} may need manual fixing`)
      }
    }

    if (args.interactive) {
      const shouldFormat = await log.confirm({ message: 'README written. Format with markdownlint?' })
      if (log.isCancel(shouldFormat) || shouldFormat === false) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        log.outro(`Done in ${elapsed}s`)
        return
      }
    }

    await formatReadme()

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    log.outro(`Done in ${elapsed}s`)

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error(errorMessage)
    process.exit(1)
  }
}

export function showHelp(): void {
  console.log(`
${pc.blue('rereadme')} - Automatically update README files with current project context

${pc.yellow('Usage:')}
  rereadme [options]

${pc.yellow('Options:')}
  --help                    Show this help message
  --verbose                 Show detailed agent output
  --interactive             Pause between steps for review
  --check                   Only check dependencies, don't run workflow
  --output FILE             Output to specified file instead of README.md
  --model MODEL             Override the default OpenAI model (default: gpt-5-nano)
  --no-backup               Skip creating backup files before overwriting
  --agents                  Also generate AGENTS.md (reuses Researcher output from Step 1)
  --agents-output FILE      Output AGENTS.md to specified file (default: AGENTS.md)
  --template FILE           Use a custom README template instead of the built-in one
  --agents-template FILE    Use a custom AGENTS.md template (requires --agents)
  --ci                      Run lightweight diff-focused CI mode (safe for every PR)
  --base-ref REF            Base ref for CI diff (default: main)
  --head-ref REF            Head ref for CI diff (default: HEAD)
  --ci-output FILE          Output suggestions to specified file (default: README-suggestions.md)
  --apply                   Apply suggestions to README.md; with --ci, also applies after analysis

${pc.yellow('Environment Variables:')}
  OPENAI_API_KEY  Required - Your OpenAI API key

${pc.yellow('How it works:')}
  Uses a multi-agent architecture powered by the OpenAI Agents SDK.
  Agents explore the repo via filesystem tools, extract technical details,
  and generate an accurate README — no Python dependencies required.

  In --ci mode, a DiffAnalyzer agent reads the git diff and determines whether
  changes are significant enough to document. If so, a ReadmePatcher agent
  generates surgical suggestions in README-suggestions.md instead of rewriting.

${pc.yellow('Examples:')}
  rereadme                                    # Run full workflow
  rereadme --interactive                      # Run with manual step approval
  rereadme --verbose                          # Show detailed output
  rereadme --check                            # Check dependencies only
  rereadme --model gpt-4o                     # Use a different OpenAI model
  rereadme --output README-v2.md              # Output to custom filename
  rereadme --output README-v2.md     # Output to custom filename
  rereadme --template MY_TEMPLATE.md                # Use a custom README template
  rereadme --ci                               # CI mode: analyze diff against main
  rereadme --ci --base-ref origin/main        # CI mode with explicit base ref
  rereadme --ci --verbose                     # CI mode with agent trace output
  rereadme --ci --apply                       # CI mode: analyze diff and apply patches in-place
  rereadme --apply                            # Apply existing README-suggestions.md to README.md
  rereadme --apply --ci-output custom.md      # Apply from a custom suggestions file
`)
}

async function main(): Promise<void> {
  if (args.help || args.h) {
    showHelp()
    return
  }

  if (args.check) {
    log.step('Checking dependencies')
    const depsOk = CI_MODE ? await checkCiDependencies() : await checkDependencies()
    process.exit(depsOk ? 0 : 1)
    return
  }

  if (CI_MODE) {
    await runCiWorkflow()
    return
  }

  if (APPLY_MODE) {
    await runApplyWorkflow()
    return
  }

  await runWorkflow()
}

// Run the main function
main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error)
  log.error(`Fatal error: ${msg}`)
  process.exit(1)
})
