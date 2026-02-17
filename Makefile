.PHONY: lint-ts lint-md lint-py typecheck-ts typecheck-py test check fix

lint-ts:
	@if npx eslint --version >/dev/null 2>&1 && ([ -f eslint.config.* ] || [ -f .eslintrc* ]); then \
		echo "==> ESLint"; \
		npx eslint '**/*.ts' --ignore-pattern dist/; \
	else \
		echo "==> lint-ts: skipped (eslint not configured)"; \
	fi

lint-md:
	@echo "==> markdownlint"
	markdownlint '**/*.md' --ignore node_modules --ignore experiments/datasets --ignore experiments/results --ignore templates

lint-py:
	@echo "==> Ruff"
	cd experiments && uv run ruff check .

typecheck-ts:
	@echo "==> tsc --noEmit"
	npx tsc --noEmit

typecheck-py:
	@echo "==> mypy"
	cd experiments && uv run mypy .

test:
	@echo "==> npm test"
	npm test

check: lint-ts lint-md lint-py typecheck-ts typecheck-py test
	@echo "==> All checks passed"

fix:
	@echo "==> markdownlint --fix"
	markdownlint --fix '**/*.md' --ignore node_modules --ignore experiments/datasets --ignore experiments/results --ignore templates || true
	@echo "==> ruff --fix"
	cd experiments && uv run ruff check --fix . || true
	@echo "==> Fixes applied"
