.PHONY: lint-ts lint-md lint-py typecheck-ts typecheck-py deps-ts deps-py test check fix

lint-ts:
	@echo "==> ESLint"
	npx eslint

lint-md:
	@echo "==> markdownlint"
	npx markdownlint '**/*.md'

lint-py:
	@echo "==> Ruff"
	cd evals && uv run ruff check .

typecheck-ts:
	@echo "==> tsc --noEmit"
	npx tsc --noEmit

typecheck-py:
	@echo "==> mypy"
	cd evals && uv run mypy .

test:
	@echo "==> npm test"
	npm test

deps-ts:
	@echo "==> depcheck"
	npx depcheck --ignores="depcheck,@types/fs-extra,@jest/globals,@openai/agents-core,markdownlint-cli" --ignore-patterns="dist,evals"

deps-py:
	@echo "==> deptry"
	cd evals && uv run deptry .

pre-commit: lint-py typecheck-ts typecheck-py deps-ts deps-py
	@echo "==> All checks passed"

check: lint-ts lint-md lint-py typecheck-ts typecheck-py deps-ts deps-py
	@echo "==> All checks passed"

fix:
	@echo "==> eslint --fix"
	npx eslint --fix || true
	@echo "==> markdownlint --fix"
	npx markdownlint --fix '**/*.md' || true
	@echo "==> ruff --fix"
	cd evals && uv run ruff check --fix . || true
	@echo "==> Fixes applied"
