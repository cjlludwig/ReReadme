# Shared keyword lists, section configs, and GEval parameters used across
# eval test files and evaluate.py.

EXPRESS_README_KEYWORDS = [
    "npm i",
    "npm start",
    "http://localhost:9000",
    "Node",
    "Express",
    "MongoDB",
]

EXPRESS_AGENTS_KEYWORDS = [
    "npm i",
    "npm start",
    "Node",
    "Express",
    "MongoDB",
]

REREADME_README_KEYWORDS = [
    "npm i",
    "npm run",
    "refresh",
    "help",
    "Node",
    "Git",
    "OpenAI",
    "OPENAI_API_KEY",
    "TypeScript",
    "OpenAI Agents",
    "markdownlint",
    "rereadme",
]

REREADME_AGENTS_KEYWORDS = [
    "npm run",
    "node",
    "make",
    "eval",
    "check",
    "refresh",
    "help",
    "test",
    "OPENAI_API_KEY",
]

FRONT_END_README_KEYWORDS = [
    "npm i",
    "npm start",
    "make test",
    "make dev",
    "make server",
    "make e2e",
    "Redis",
    "Docker",
    "Prometheus",
]

FRONT_END_AGENTS_KEYWORDS = [
    "make test",
    "npm",
    "npm run",
    "make dev",
    "make server",
    "make e2e",
]

AGENTS_SECTIONS = ["## Project", "## Commands"]

# AGENTS.md sections tend to be terse (short command lists), so use a lower bar
AGENTS_MIN_CONTENT_LENGTH = 5

GEVAL_MODEL = "gpt-4o-mini"
