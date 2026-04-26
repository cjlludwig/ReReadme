.PHONY: lint-ts lint-ts-full lint-md lint-py lint-pkg typecheck-ts typecheck-py deps-ts deps-py test test-full check check-full fix clean-check-cache

-include local/Makefile

CHECK_LOG_DIR := .cache/check-logs

lint-ts:
	@npx eslint --cache --cache-location .cache/eslint/ --cache-strategy content --quiet

lint-ts-full:
	@npx eslint --no-cache

lint-md:
	@markdownlint '**/*.md'

lint-py:
	@cd evals && UV_CACHE_DIR=../.cache/uv uv run ruff check --quiet .

lint-pkg:
	@mkdir -p $(CHECK_LOG_DIR)
	@npx publint > $(CHECK_LOG_DIR)/publint.log 2>&1 || { cat $(CHECK_LOG_DIR)/publint.log; exit 1; }

typecheck-ts:
	@mkdir -p .cache
	@npx tsc --noEmit --incremental --tsBuildInfoFile .cache/tsconfig.tsbuildinfo --pretty false

typecheck-py:
	@cd evals && UV_CACHE_DIR=../.cache/uv uv run mypy --hide-error-context --no-error-summary .

test:
	@mkdir -p $(CHECK_LOG_DIR)
	@npm test --silent > $(CHECK_LOG_DIR)/jest.log 2>&1 || { cat $(CHECK_LOG_DIR)/jest.log; exit 1; }

deps-ts:
	@mkdir -p $(CHECK_LOG_DIR)
	@npx depcheck --ignores="depcheck,@types/fs-extra,@jest/globals,@openai/agents-core,markdownlint-cli,publint" --ignore-patterns="dist,evals" > $(CHECK_LOG_DIR)/depcheck.log 2>&1 || { cat $(CHECK_LOG_DIR)/depcheck.log; exit 1; }

deps-py:
	@mkdir -p $(CHECK_LOG_DIR)
	@cd evals && UV_CACHE_DIR=../.cache/uv uv run deptry . > ../$(CHECK_LOG_DIR)/deptry.log 2>&1 || { cat ../$(CHECK_LOG_DIR)/deptry.log; exit 1; }

pre-commit: lint-pkg lint-py typecheck-ts typecheck-py deps-ts deps-py

check: lint-ts lint-md lint-py lint-pkg typecheck-ts typecheck-py deps-ts deps-py

test-full:
	@npm run test:full

check-full: lint-ts-full lint-md lint-py lint-pkg typecheck-ts typecheck-py deps-ts deps-py

clean-check-cache:
	@rm -rf .cache/eslint .cache/jest .cache/tsconfig.tsbuildinfo .cache/check-logs .mypy_cache evals/.mypy_cache evals/.ruff_cache

fix:
	@npx eslint --fix --cache --cache-location .cache/eslint/ --cache-strategy content --quiet || true
	@markdownlint --fix '**/*.md' || true
	@cd evals && UV_CACHE_DIR=../.cache/uv uv run ruff check --fix --quiet . || true
