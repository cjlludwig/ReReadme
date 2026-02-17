.PHONY: lint-ts lint-md lint-py typecheck-ts typecheck-py test check fix

lint-ts:
	@echo "==> ESLint"
	npx eslint

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
	@echo "==> eslint --fix"
	npx eslint --fix || true
	@echo "==> markdownlint --fix"
	markdownlint --fix '**/*.md' --ignore node_modules --ignore experiments/datasets --ignore experiments/results --ignore templates || true
	@echo "==> ruff --fix"
	cd experiments && uv run ruff check --fix . || true
	@echo "==> Fixes applied"
