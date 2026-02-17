#!/usr/bin/env node

// rereadme - CLI tool to automatically update README files
import { $, echo, question, fs, path, chalk, argv } from 'zx'
import { fileURLToPath } from 'url'
import { runAgentWorkflow } from './lib/runner.js'

// Get the directory where this script is located (for accessing templates)
const SCRIPT_FILE = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(SCRIPT_FILE)

// Configuration
$.verbose = argv.verbose || false
const OPENAI_MODEL = argv.model || 'gpt-5-nano'
const INPUT_FILE = argv.input || 'README.md'
const OUTPUT_FILE = argv.output || 'README.md'

export async function checkDependencies(): Promise<boolean> {
  echo(chalk.blue('🔍 Checking dependencies...'))

  let allGood = true

  // Check markdownlint
  try {
    const markdownlintResult = await $({ nothrow: true, quiet: true })`markdownlint --version`
    if (markdownlintResult.exitCode === 0) {
      echo(chalk.green('✅ markdownlint-cli found'))
    } else {
      echo(chalk.red('❌ markdownlint-cli not found. Install with: npm install -g markdownlint-cli OR brew install markdownlint-cli'))
      allGood = false
    }
  } catch (error) {
    echo(chalk.red('❌ markdownlint-cli not found. Install with: npm install -g markdownlint-cli OR brew install markdownlint-cli'))
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
    throw new Error(`Failed to read file: ${filePath}`)
  }
}

export async function updateReadme(content: string): Promise<void> {
  // Backup current README if it exists
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  try {
    if (await fs.pathExists(OUTPUT_FILE)) {
      const ext = path.extname(OUTPUT_FILE)
      const base = OUTPUT_FILE.slice(0, -ext.length || undefined)
      await fs.copy(OUTPUT_FILE, `${base}.backup-${timestamp}${ext}`)
      echo(chalk.dim(`📋 Backed up existing ${OUTPUT_FILE}`))
    }
  } catch (error) {
    echo(chalk.yellow(`⚠️  Could not backup ${OUTPUT_FILE}: ${error}`))
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

    if (argv.interactive) {
      const shouldContinue = await question('Dependencies OK. Start agent workflow? (y/n): ')
      if (shouldContinue.toLowerCase() !== 'y') {
        echo(chalk.yellow('Aborted.'))
        return
      }
    }

    // Read the README template
    const readmeTemplate = await readFile(path.join(SCRIPT_DIR, 'templates/README_TEMPLATE.md'))

    // Run agent workflow
    echo(chalk.blue('🤖 Running agent-based repo exploration...'))
    const readmeContent = await runAgentWorkflow({
      model: OPENAI_MODEL,
      inputFile: INPUT_FILE,
      readmeTemplate,
      verbose: argv.verbose,
    })

    // Update README (with backup)
    await updateReadme(readmeContent)

    if (argv.interactive) {
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

export async function showHelp(): Promise<void> {
  echo(`
${chalk.blue('rereadme')} - Automatically update README files with current project context

${chalk.yellow('Usage:')}
  rereadme [options]

${chalk.yellow('Options:')}
  --help          Show this help message
  --verbose       Show detailed agent output
  --interactive   Pause between steps for review
  --check         Only check dependencies, don't run workflow
  --input FILE    Read current content from specified file instead of README.md
  --output FILE   Output to specified file instead of README.md
  --model MODEL   Override the default OpenAI model (default: gpt-5-nano)

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
  if (argv.help || argv.h) {
    await showHelp()
    return
  }

  if (argv.check) {
    const depsOk = await checkDependencies()
    process.exit(depsOk ? 0 : 1)
    return
  }

  await runWorkflow()
}

// Run the main function
main().catch((error) => {
  echo(chalk.red('💥 Fatal error:'), error.message)
  process.exit(1)
})
