# Shared keyword lists, section configs, and GEval parameters used across
# eval test files and evaluate.py.

EXPRESS_README_KEYWORDS = [
    "npm install",
    "npm start",
    "http://localhost:9000",
    "Node.js",
    "Express.js",
    "MongoDB",
]

EXPRESS_AGENTS_KEYWORDS = [
    "npm install",
    "npm start",
    "Node.js",
    "Express.js",
    "MongoDB",
]

REREADME_README_KEYWORDS = [
    "npm install",
    "npm run dev",
    "OPENAI_API_KEY",
    "TypeScript",
    "OpenAI Agents SDK",
    "markdownlint",
    "git clone https://github.com/connorludwig/rereadme.git",
    "rereadme",
    "rereadme --check",
]

REREADME_AGENTS_KEYWORDS = [
    "npm run dev",
    "npm test",
    "OPENAI_API_KEY",
    "TypeScript",
    "script.ts",
]

AGENTS_SECTIONS = ["## Project", "## Commands"]

README_GEVAL_CRITERIA = (
    "Evaluate semantic similarity between the generated README and the golden README. "
    "Consider section structure alignment, technical accuracy of descriptions, "
    "and content completeness. Minor wording and structure differences should be tolerated."
)

AGENTS_GEVAL_CRITERIA = (
    "Evaluate semantic similarity between the generated AGENTS.md and the golden AGENTS.md. "
    "Focus on: presence of required sections (Project, Commands), accuracy of commands, "
    "correctness of file structure, and appropriate constraints. "
    "Minor wording differences should be tolerated."
)

GEVAL_THRESHOLD = 0.70
GEVAL_MODEL = "gpt-5-mini"
