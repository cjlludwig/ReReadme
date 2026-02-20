# AGENTS.md

## Project

> express-server is a minimal Express.js API server example backed by MongoDB. Stack as inline code: `JavaScript`, `Node.js`, `Express`, `MongoDB`.

## Commands

```shell
npm install       # install dependencies
npm start         # start the application
npm run test      # run test suite (if present)
npm run lint      # lint (if configured)
```

## Structure

- `src/` — application source
- `src/server.js` — entry point, Express server
- `src/data/mongoDao.js` — MongoDB DAO helpers
- `src/data/documentDao.js` — document data access
- `src/services/documentService.js` — business logic
- `src/controllers/documentController.js` — HTTP route handlers for /api/document
- `tests/` — test suite root (if present)
- `.devcontainer/` — development container configuration for Node.js + MongoDB

## Architecture

```text
Client
  |
  v HTTP
Express server (src/server.js)
  |
  v /api/document routes (documentController)
  |-- GET /           -> placeholder/help
  |-- GET /:id        -> documentService.getDocument(id)
  |-- POST /          -> documentService.postDocument(body)
  |
  v Document Service (src/services/documentService.js)
  |-- getDocument(id)
  |-- postDocument(body)
  |
  v Document DAO (src/data/documentDao.js)
  |-- createDocument
  |-- queryDocumentById
  |
  v MongoDB (mongodb://localhost:27017, database: express-server, collection: documents)
```

## Constraints

- **Generated files**: do not edit `dist/`, `build/`, or lock files directly
- **Secrets**: never hardcode env vars; use `process.env` / config loader pattern found in `src/config`

## Help

- Graceful shutdown: the server attempts to close the HTTP server and MongoDB client on SIGTERM, but there is an undefined `debug()` reference in `src/server.js`. Consider replacing `debug(...)` with `console.debug(...)` or a proper logger to avoid runtime errors.

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## References

- Express.js: <https://expressjs.com/>
- MongoDB Node.js Driver: <https://www.mongodb.com/docs/drivers/node/>
- Node.js: <https://nodejs.org/>
