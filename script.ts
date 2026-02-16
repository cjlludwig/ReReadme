#!/usr/bin/env node

// rereadme - CLI tool to automatically update README files
import { $, echo, question, fs, path, chalk, argv } from 'zx'
import OpenAI from 'openai'
import { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses'
import { fileURLToPath } from 'url'

// Get the directory where this script is located (for accessing prompts/templates)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration
$.verbose = argv.verbose || false
const GITINGEST_SIZE_LIMIT = 50000
const OPENAI_MODEL = argv.model || 'gpt-5-nano' // Allow override via --model, fallback to cheapest model by default $0.10 per 1M tokens
const INPUT_FILE = argv.input || 'README.md'
const OUTPUT_FILE = argv.output || 'README.md'

// OpenAI client - initialized only when needed
let openai: OpenAI | null = null

// Generate a random session ID once per run
function generateSessionId(): string {
  // Use a simple, readable random string (base36 timestamp + random)
  return (
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
  )
}

const SESSION_ID = generateSessionId()

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  }
  return openai
}

interface GitingestConfig {
  sizeLimit: number
  include: string[]
  exclude: string[]
  output: string
}

interface OpenAIResponse {
  content: string
  responseId: string
}

const DEFAULT_GITINGEST_CONFIGS: GitingestConfig[] = [
  {
    sizeLimit: GITINGEST_SIZE_LIMIT,
    include: ['src/', 'package.json', '*.ts'],
    exclude: ['*.snap', '*generated*'],
    output: 'gitingest-code.txt'
  },
  {
    sizeLimit: GITINGEST_SIZE_LIMIT,
    include: ['src/', 'package.json', 'README.md'],
    exclude: ['*.snap', '*generated*'],
    output: 'gitingest-agents.txt'
  },
  {
    sizeLimit: GITINGEST_SIZE_LIMIT,
    include: ['tf/', 'k8s-tf/', 'deployment_manifest.yaml', 'package.json'],
    exclude: ['.tf*'],
    output: 'gitingest-tf.txt'
  }
]

async function checkPythonEnvironment(): Promise<void> {
  try {
    const pythonPath = await $({ nothrow: true, quiet: true })`which python`
    const pipPath = await $({ nothrow: true, quiet: true })`which pip`
    
    if (pythonPath.stdout.includes('pyenv')) {
      echo(chalk.blue('🐍 Detected pyenv environment'))
      const pyenvVersion = await $({ quiet: true })`pyenv version`
      echo(chalk.dim(`   Python: ${pyenvVersion.stdout.trim()}`))
    } else {
      echo(chalk.blue('🐍 Using system Python'))
      echo(chalk.dim(`   Python: ${pythonPath.stdout.trim()}`))
    }
  } catch (error) {
    echo(chalk.yellow('⚠️  Could not detect Python environment'))
  }
}

async function checkDependencies(): Promise<boolean> {
  echo(chalk.blue('🔍 Checking dependencies...'))
  
  // Show Python environment info
  await checkPythonEnvironment()
  
  let allGood = true
  
  // Check gitingest
  try {
    const gitingestResult = await $({ nothrow: true, quiet: true })`gitingest --help`
    if (gitingestResult.exitCode === 0) {
      echo(chalk.green('✅ gitingest found'))
    } else {
      echo(chalk.red('❌ gitingest not found. Install with: pip install gitingest'))
      allGood = false
    }
  } catch (error) {
    echo(chalk.red('❌ gitingest not found. Install with: pip install gitingest'))
    allGood = false
  }
  
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

async function debugGitingest(): Promise<void> {
  echo(chalk.blue('🔍 Testing gitingest configurations...'))
  
  for (const [index, config] of DEFAULT_GITINGEST_CONFIGS.entries()) {
    echo(chalk.yellow(`\n📋 Testing config ${index + 1}: ${config.output}`))
    echo(chalk.dim(`   Include: ${config.include.join(', ')}`))
    echo(chalk.dim(`   Exclude: ${config.exclude.join(', ')}`))
    echo(chalk.dim(`   Size limit: ${config.sizeLimit}`))
    
    // Build the exact command that will be run
    const cmd = ['gitingest', '-s', String(config.sizeLimit)]
    
    for (const pattern of config.include) {
      cmd.push('-i', pattern)
    }
    
    for (const pattern of config.exclude) {
      cmd.push('-e', pattern)
    }
    
    cmd.push('-o', config.output, '.')
    
    echo(chalk.dim(`   Command: ${cmd.join(' ')}`))
    
    // Run it
    const result = await runGitingest(config)
    echo(result ? chalk.green('   ✅ Success') : chalk.red('   ❌ Failed'))
  }
}

async function runGitingest(config: GitingestConfig): Promise<boolean> {
  echo(chalk.yellow(`📝 Running gitingest for ${config.output}...`))
  
  try {
    // Build command parts
    const cmd = ['gitingest', '-s', String(config.sizeLimit)]
    
    // Add include patterns
    for (const pattern of config.include) {
      cmd.push('-i', pattern)
    }
    
    // Add exclude patterns  
    for (const pattern of config.exclude) {
      cmd.push('-e', pattern)
    }
    
    // Add output and source
    cmd.push('-o', config.output, '.')
    
    // Debug: show the exact command being run
    if (argv.verbose || process.env.DEBUG_MODE) {
      echo(chalk.dim(`   Executing: ${cmd.join(' ')}`))
    }
    
    const result = await $({ nothrow: true })`${cmd}`
    
    if (result.exitCode === 0) {
      echo(chalk.green(`✅ Generated ${config.output}`))
      
      // Check if file actually exists and has content
      try {
        const stats = await fs.stat(config.output)
        echo(chalk.dim(`   File size: ${stats.size} bytes`))
        
        if (stats.size === 0) {
          echo(chalk.yellow(`⚠️  Warning: ${config.output} is empty`))
        }
      } catch (statError) {
        echo(chalk.yellow(`⚠️  Warning: Could not stat ${config.output}`))
      }
      
      return true
    } else {
      echo(chalk.red(`❌ Failed to generate ${config.output} (exit code: ${result.exitCode})`))
      if (result.stderr) {
        echo(chalk.red(`   Error: ${result.stderr}`))
      }
      if (result.stdout) {
        echo(chalk.dim(`   Output: ${result.stdout}`))
      }
      return false
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    echo(chalk.red(`❌ Error running gitingest: ${errorMessage}`))
    return false
  }
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

async function readGitingestOutput(outputPath: string): Promise<string> {
  try {
    if (await fs.pathExists(outputPath)) {
      return await readFile(outputPath)
    }
    return ''
  } catch (error) {
    echo(chalk.yellow(`⚠️  Could not read ${outputPath}: ${error}`))
    return ''
  }
}

async function callOpenAI(systemPrompt: string, userContent: string, context: string = '', previousId: string = ''): Promise<OpenAIResponse> {
  let combinedInput = userContent;
  
  if (context) {
    combinedInput += `'\n\n'Context:\n${context}\n`
  }
  
  try {
    const response = await getOpenAIClient().responses.create({
      model: OPENAI_MODEL,
      user: SESSION_ID, // Use the randomized session ID for all OpenAI calls
      instructions: systemPrompt,
      input: combinedInput,
      ...(previousId && {previous_response_id: previousId})
    } as ResponseCreateParamsNonStreaming)
    
    // Debug logging when DEBUG_MODE is enabled
    if (process.env.DEBUG_MODE) {
      echo(chalk.blue(`🤖 Response Debug Info:`))
      echo(chalk.dim(`   ID: ${response.id}`))
      if (previousId) {
        echo(chalk.dim(`   Prev ID: ${previousId}`))
      }
      echo(chalk.dim(`   Session ID: ${SESSION_ID}`))
      echo(chalk.dim(`   Model: ${response.model}`))
      echo(chalk.dim(`   Status: ${response.status || 'completed'}`))
      echo(chalk.dim(`   Created: ${new Date(response.created_at * 1000).toISOString()}`))
      
      if (response.usage) {
        echo(chalk.dim(`   Usage: ${JSON.stringify(response.usage)}`))
      }
      
      if (response.temperature !== null) {
        echo(chalk.dim(`   Temperature: ${response.temperature}`))
      }
      
      if (response.error) {
        echo(chalk.red(`   Error: ${response.error.message || 'Unknown error'}`))
      }
      
      if (response.incomplete_details) {
        echo(chalk.yellow(`   Incomplete: ${response.incomplete_details.reason}`))
      }
    }
    
    return {
      content: response.output_text || '',
      responseId: response.id
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`OpenAI API call failed: ${errorMessage}`)
  }
}

async function processPromptStep(step: number, promptFile: string, context: string = '', previousId: string = ''): Promise<OpenAIResponse> {
  echo(chalk.blue(`🤖 Processing step ${step}: ${promptFile}`))
  
  const promptPath = path.join(__dirname, 'prompts', promptFile)
  const systemPrompt = await readFile(promptPath);
  const template = await readFile(path.join(__dirname, 'templates/README_TEMPLATE.md'));
  // const systemPrompt = `README Format:\n\n${template}\n\n---\n${rawPrompt}`
  
  // Read current README content from input file
  let currentReadme = ''
  try {
    currentReadme = await readFile(INPUT_FILE)
  } catch (error) {
    // If input file doesn't exist, start with empty content
    currentReadme = ''
    echo(chalk.yellow(`⚠️  Input file ${INPUT_FILE} not found, starting with empty content`))
  }
  
  // Place static content early for cache
  const userContent = `README Format:\n\n${template}\n\n---\nCurrent ${INPUT_FILE} content:\n\n${currentReadme}`
  
  const result = await callOpenAI(systemPrompt, userContent, context, previousId)
  
  if (!result.content) {
    throw new Error(`No response from OpenAI for step ${step}`)
  }
  
  return result
}

async function updateReadme(content: string): Promise<void> {
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

async function formatReadme(): Promise<void> {
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

async function runWorkflow(): Promise<void> {
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
    
    // Generate gitingest context files
    echo(chalk.blue('📊 Generating context with gitingest...'))
    
    for (const config of DEFAULT_GITINGEST_CONFIGS) {
      await runGitingest(config)
    }
    
    // Process prompts in sequence - conditionally include step 2 based on --confluence flag
    const prompts = [
      { step: 1, file: '1_prep_readme.txt', context: '' }
    ]
    
    // Add step 2 only if --confluence flag is provided
    if (argv.confluence) {
      echo(chalk.blue('🔗 Including Confluence MCP server step'))
      prompts.push({ step: 2, file: '2_external_sources.txt', context: '' })
    }
    
    // Always include step 3
    prompts.push({ 
      step: argv.confluence ? 3 : 2, 
      file: '3_gitingest_readme.txt', 
      context: await readGitingestOutput('gitingest-code.txt') 
    })
    
    let previousResponseId = ''
    
    for (const prompt of prompts) {
      try {
        const result = await processPromptStep(prompt.step, prompt.file, prompt.context, previousResponseId)
        await updateReadme(result.content)
        
        // Update previousResponseId for next iteration
        previousResponseId = result.responseId
        
        if (process.env.DEBUG_MODE) {
          echo(chalk.dim(`   Response ID for step ${prompt.step}: ${result.responseId}`))
        }
        
        if (argv.interactive) {
          const shouldContinue = await question('Continue to next step? (y/n): ')
          if (shouldContinue.toLowerCase() !== 'y') {
            break
          }
        }
        
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        echo(chalk.red(`❌ Failed at step ${prompt.step}: ${errorMessage}`))
        if (!argv.continue) {
          throw error
        }
      }
    }
    
    // Format the final README
    await formatReadme()
    
    // Cleanup gitingest files unless requested to keep
    if (!argv.keepContext) {
      for (const config of DEFAULT_GITINGEST_CONFIGS) {
        await fs.remove(config.output).catch(() => {})
      }
      echo(chalk.dim('🧹 Cleaned up gitingest context files'))
    }
    
    echo(chalk.green('🎉 README refresh completed successfully!'))
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    echo(chalk.red('❌ Workflow failed:'), errorMessage)
    process.exit(1)
  }
}

async function showHelp(): Promise<void> {
  echo(`
${chalk.blue('rereadme')} - Automatically update README files with current project context

${chalk.yellow('Usage:')}
  rereadme [options]

${chalk.yellow('Options:')}
  --help          Show this help message
  --verbose       Show detailed command output
  --interactive   Pause between each step for review
  --continue      Continue on errors instead of stopping
  --keep-context  Keep gitingest output files after completion
  --check         Only check dependencies, don't run workflow
  --confluence    Include step 2 (external sources) using Confluence MCP server
  --input FILE    Read current content from specified file instead of README.md
  --output FILE   Output to specified file instead of README.md
  --model MODEL   Override the default OpenAI model (default: gpt-4.1-nano)

${chalk.yellow('Environment Variables:')}
  OPENAI_API_KEY  Required - Your OpenAI API key
  DEBUG_MODE      Optional - Enable detailed API response logging

${chalk.yellow('AI Model:')}
  Uses gpt-4.1-nano (cost-effective: $0.10 per 1M input tokens, $0.40 per 1M output tokens)

${chalk.yellow('Examples:')}
  rereadme                           # Run basic workflow (steps 1 & 2)
  rereadme --confluence              # Run with Confluence MCP server (steps 1, 2 & 3)
  rereadme --interactive             # Run with manual step approval
  rereadme --verbose                 # Show detailed output
  rereadme --check                   # Check dependencies only
  rereadme --model gpt-4o            # Use a different OpenAI model
  rereadme --output README-v2.md     # Output to custom filename
  rereadme --input some_doc.md --output test_doc.md  # Read from one file, write to another

${chalk.yellow('For pyenv users:')}
  Make sure pyenv shims are first in your PATH:
  export PATH="$HOME/.pyenv/shims:$PATH"
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
  
  if (argv['debug-gitingest']) {
    await debugGitingest()
    return
  }
  
  await runWorkflow()
}

// Run the main function
main().catch((error) => {
  echo(chalk.red('💥 Fatal error:'), error.message)
  process.exit(1)
})