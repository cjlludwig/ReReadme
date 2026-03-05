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

FRONT_END_README_KEYWORDS = [
    "npm install",
    "npm test",
    "Express",
    "Redis",
    "Docker",
    "Prometheus",
]

FRONT_END_AGENTS_KEYWORDS = [
    "npm test",
    "npm start",
    "server.js",
    "api/",
]

AGENTS_SECTIONS = ["## Project", "## Commands"]

GEVAL_MODEL = "gpt-4o-mini"
