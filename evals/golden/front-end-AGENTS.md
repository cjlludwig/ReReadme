# AGENTS.md

## Project

Front end for a microservices demo application. Stack: `JavaScript`, `Node.js`, `Express`, `Redis` (optional for sessions).

## Commands

```shell
npm install       # install dependencies
npm start         # start the server
npm test          # run test suite
npm run lint      # lint the code
```

## Structure

- `server.js` — entry point; serves static assets from public/ and mounts API proxies to backend services
- `public/` — static UI assets (e.g., index.html, category.html, product detail pages)
- `api/endpoints.js` — defines backend service hostnames (catalogue, carts, orders, user)
- `config.js` — session store configuration and domain suffix handling
- `package.json` — project metadata; start script and dependencies
- `Dockerfile` — container image for front-end
- `Makefile` — (if present) Node-based workflow automation
- `test/` and `test/e2e/` — unit and end-to-end tests (CasperJS in e2e)

## Architecture

```text
Frontend(Node.js/Express)
├─ public/  (static UI)
└─ api endpoints (proxy to backend services)
   ├─ catalogue
   ├─ carts
   ├─ orders
   └─ user
```

## Constraints

- **Generated files**: do not edit `dist/`, `build/`, or lock files directly
- **Secrets**: never hardcode env vars; use `process.env` / config loader pattern found in `src/config`
- **Environment**: relies on backend microservices (catalogue, carts, orders, user); run a local stack if needed (e.g., via Docker-compose)

## Testing

- **Run**: `npm test`
- **Location**: unit tests under `tests/` (mirroring `src/`), end-to-end tests under `test/e2e/`
- **Pattern**: unit tests follow `*.test.ts`; e2e tests use CasperJS

## References

- Node.js: <https://nodejs.org/>
- Express: <https://expressjs.com/>
- Docker: <https://www.docker.com/>
- CasperJS: <https://casperjs.org/>
- The repository: Weaveworks microservices demo front-end (<https://github.com/weaveworks/microservices-demo>)
- License (Apache 2.0): <https://www.apache.org/licenses/LICENSE-2.0>

## Help

- Domain/debug arguments:
  - The frontend supports a `--domain` flag to set a domain suffix for backend endpoints (e.g., `catalogue.`, `carts.`, etc.). See `server.js` and `api/endpoints.js` for parsing and application.
- Environment considerations:
  - The app expects backend microservices (catalogue, carts, orders, user) to be available at hostnames defined in `api/endpoints.js`. Bring up a local stack if needed (e.g., via `test/docker-compose.yml` or a custom setup).
- Tests:
  - Unit tests and API tests are configured via `npm test` (unit tests in `tests/`, e2e tests in `test/e2e/` with CasperJS). Ensure dependencies and environment are prepared before running.

## License

Apache License, Version 2.0. See LICENSE for details.
