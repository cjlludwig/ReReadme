#!/usr/bin/env node

// rereadme - CLI tool to automatically update README files
import { $, echo, question, fs, path, chalk, argv } from 'zx'
import { fileURLToPath } from 'url'
import { runAgentWorkflow } from './lib/runner.js'

// Get the directory where this script is located (for accessing templates)
const SCRIPT_FILE = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(SCRIPT_FILE)

// Configuration — argv is typed as Record<string, unknown> by zx
const args = argv as Record<string, unknown>
$.verbose = Boolean(args.verbose)
const OPENAI_MODEL = typeof args.model === 'string' ? args.model : 'gpt-5-nano'
const INPUT_FILE = typeof args.input === 'string' ? args.input : 'README.md'
const OUTPUT_FILE = typeof args.output === 'string' ? args.output : 'README.md'
const GENERATE_AGENTS = Boolean(args.agents)
const AGENTS_OUTPUT_FILE = typeof args['agents-output'] === 'string' ? args['agents-output'] : 'AGENTS.md'
const SKIP_BACKUP = Boolean(args['no-backup'])

export async function checkDependencies(): Promise<boolean> {
  echo(chalk.blue('🔍 Checking dependencies...'))

  let allGood = true

  // Check markdownlint
  try {
    const markdownlintResult = await $({ nothrow: true, quiet: true })`markdownlint --version`
    if (markdownlintResult.exitCode === 0) {
      echo(chalk.green('✅ markdownlint-cli found'))
    } else {
      echo(chalk.red('❌ markdownlint-cli not found. Run: npm install'))
      allGood = false
    }
  } catch {
    echo(chalk.red('❌ markdownlint-cli not found. Run: npm install'))
    allGood = false
  }

  // Check OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    echo(chalk.red('❌ OPENAI_API_KEY environment variable not set'))
    allGood = false
  } else {
    echo(chalk.green('✅ OpenAI API key found'))
  }

  return allGood
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
        await fs.copy(OUTPUT_FILE, `${base}.backup-${timestamp}${ext}`)
        echo(chalk.dim(`📋 Backed up existing ${OUTPUT_FILE}`))
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      echo(chalk.yellow(`⚠️  Could not backup ${OUTPUT_FILE}: ${msg}`))
    }
  }

  // Write new README
  await fs.writeFile(OUTPUT_FILE, content.trim() + '\n')
  echo(chalk.green(`✅ ${OUTPUT_FILE} updated`))
}

export async function formatReadme(): Promise<void> {
  echo(chalk.blue(`📐 Formatting ${OUTPUT_FILE} with markdownlint...`))

  // First try to auto-fix what we can
  const fixResult = await $({ nothrow: true })`markdownlint --fix ${OUTPUT_FILE}`

  if (fixResult.exitCode === 0) {
    echo(chalk.green(`✅ ${OUTPUT_FILE} formatted successfully`))
  } else {
    // If there are issues that can't be auto-fixed, show them as warnings
    echo(chalk.yellow('⚠️  Some markdown issues found:'))
    if (fixResult.stderr) {
      echo(chalk.dim(fixResult.stderr))
    }
    if (fixResult.stdout) {
      echo(chalk.dim(fixResult.stdout))
    }
    echo(chalk.yellow('💡 Some issues may need manual fixing'))
  }
}

export async function runWorkflow(): Promise<void> {
  try {
    echo(chalk.blue('🚀 Starting README refresh workflow'))

    // Show input/output file configuration
    if (INPUT_FILE !== 'README.md' || OUTPUT_FILE !== 'README.md') {
      echo(chalk.blue(`📄 Input file: ${INPUT_FILE}`))
      echo(chalk.blue(`📝 Output file: ${OUTPUT_FILE}`))
    }

    // Check dependencies
    if (!await checkDependencies()) {
      throw new Error('Missing required dependencies')
    }

    if (args.interactive) {
      const shouldContinue = await question('Dependencies OK. Start agent workflow? (y/n): ')
      if (shouldContinue.toLowerCase() !== 'y') {
        echo(chalk.yellow('Aborted.'))
        return
      }
    }

    // Read the README template (and optionally the AGENTS template)
    const readmeTemplate = await readFile(path.join(SCRIPT_DIR, 'templates/README_TEMPLATE.md'))
    const agentsTemplate = GENERATE_AGENTS
      ? await readFile(path.join(SCRIPT_DIR, 'templates/AGENTS_TEMPLATE.md'))
      : undefined

    // Run agent workflow
    echo(chalk.blue('🤖 Running agent-based repo exploration...'))
    const { readme: readmeContent, agents: agentsContent } = await runAgentWorkflow({
      model: OPENAI_MODEL,
      inputFile: INPUT_FILE,
      readmeTemplate,
      agentsTemplate,
      verbose: Boolean(args.verbose),
    })

    // Update README (with backup)
    await updateReadme(readmeContent)

    // Write AGENTS.md if requested
    if (agentsContent !== undefined) {
      if (!SKIP_BACKUP) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        try {
          if (await fs.pathExists(AGENTS_OUTPUT_FILE)) {
            const ext = path.extname(AGENTS_OUTPUT_FILE)
            const base = AGENTS_OUTPUT_FILE.slice(0, -ext.length || undefined)
            await fs.copy(AGENTS_OUTPUT_FILE, `${base}.backup-${timestamp}${ext}`)
            echo(chalk.dim(`📋 Backed up existing ${AGENTS_OUTPUT_FILE}`))
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error)
          echo(chalk.yellow(`⚠️  Could not backup ${AGENTS_OUTPUT_FILE}: ${msg}`))
        }
      }
      await fs.writeFile(AGENTS_OUTPUT_FILE, agentsContent.trim() + '\n')
      echo(chalk.green(`✅ ${AGENTS_OUTPUT_FILE} updated`))

      echo(chalk.blue(`📐 Formatting ${AGENTS_OUTPUT_FILE} with markdownlint...`))
      const agentsFix = await $({ nothrow: true })`markdownlint --fix ${AGENTS_OUTPUT_FILE}`
      if (agentsFix.exitCode === 0) {
        echo(chalk.green(`✅ ${AGENTS_OUTPUT_FILE} formatted successfully`))
      } else {
        echo(chalk.yellow('⚠️  Some markdown issues found in AGENTS.md (may need manual fixing)'))
      }
    }

    if (args.interactive) {
      const shouldFormat = await question('README updated. Format with markdownlint? (y/n): ')
      if (shouldFormat.toLowerCase() !== 'y') {
        echo(chalk.green('🎉 README refresh completed (skipped formatting)'))
        return
      }
    }

    // Format the final README
    await formatReadme()

    echo(chalk.green('🎉 README refresh completed successfully!'))

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    echo(chalk.red('❌ Workflow failed:'), errorMessage)
    process.exit(1)
  }
}

export function showHelp(): void {
  echo(`
${chalk.blue('rereadme')} - Automatically update README files with current project context

${chalk.yellow('Usage:')}
  rereadme [options]

${chalk.yellow('Options:')}
  --help                    Show this help message
  --verbose                 Show detailed agent output
  --interactive             Pause between steps for review
  --check                   Only check dependencies, don't run workflow
  --input FILE              Read current content from specified file instead of README.md
  --output FILE             Output to specified file instead of README.md
  --model MODEL             Override the default OpenAI model (default: gpt-5-nano)
  --no-backup               Skip creating backup files before overwriting
  --agents                  Also generate AGENTS.md (reuses Researcher output from Step 1)
  --agents-output FILE      Output AGENTS.md to specified file (default: AGENTS.md)

${chalk.yellow('Environment Variables:')}
  OPENAI_API_KEY  Required - Your OpenAI API key

${chalk.yellow('How it works:')}
  Uses a multi-agent architecture powered by the OpenAI Agents SDK.
  Agents explore the repo via filesystem tools, extract technical details,
  and generate an accurate README — no Python dependencies required.

${chalk.yellow('Examples:')}
  rereadme                           # Run full workflow
  rereadme --interactive             # Run with manual step approval
  rereadme --verbose                 # Show detailed output
  rereadme --check                   # Check dependencies only
  rereadme --model gpt-4o            # Use a different OpenAI model
  rereadme --output README-v2.md     # Output to custom filename
  rereadme --input some_doc.md --output test_doc.md  # Read from one file, write to another
`)
}

async function main(): Promise<void> {
  if (args.help || args.h) {
    showHelp()
    return
  }

  if (args.check) {
    const depsOk = await checkDependencies()
    process.exit(depsOk ? 0 : 1)
    return
  }

  await runWorkflow()
}

// Run the main function
main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error)
  echo(chalk.red('💥 Fatal error:'), msg)
  process.exit(1)
})
