# microservices-demo-front-end

## Description

Front-end application for the Weaveworks microservices-demo project. A Node.js/Express server serves the static UI from `public` and coordinates calls to the underlying microservices (catalogue, carts, orders, and user) via REST endpoints. It also exposes Prometheus metrics at `/metrics`.

## Getting Started

### Dependencies

- Node.js (the project is built and tested with Node.js in CI; locally you can run with Node via Docker or locally with a supported Node.js version)
- Docker (recommended for local/dev/test workflows)
- Docker Compose (optional, for running the full test/dev stack with Docker)
- Make (optional, used by provided Makefile tasks)

Optional:
- Redis (optional) for Redis-backed sessions if `SESSION_REDIS` is set

In development, a Docker-based test stack is provided to bring up the backend services as defined in `test/docker-compose.yml`.

### Environment Variables

- `PORT` — Server listen port (default: 8079)
- `SESSION_REDIS` — optional; if set, uses Redis-backed sessions (hosted at `session-db`)

Optional domain configuration:
- You can set a specific domain for cookies and routing by passing the domain on startup, e.g. `node server.js --domain=example.local`.

Development mode customer override (security risk):
- In development, you can override the customer ID by supplying `?custId=...` in the query string. This is intended for testing and should not be used in production.

Examples:
```bash
export PORT=8079                 # optional — default is 8079
export SESSION_REDIS=redis://localhost  # optional — enable Redis-backed sessions

# Run with a specific domain for backend routing
node server.js --domain=example.com
```

### Installation

1. Install dependencies
```shell
npm install
```

2. Start the server
```shell
npm start
```

3. (Optional) Build and run via Docker/Make targets
```shell
make test-image
make server
```

4. (Optional) Bring up the local backend stack for end-to-end testing
```shell
make compose
```

## Usage

### Start

Start the server (Node)
```shell
export PORT=8079  # optional
npm start
```

Start the server (Docker)
```shell
make server
# Runs the front-end in a Docker container and maps port 8080
```

UI interaction
```shell
export BASE_URL=http://localhost:8079
curl -sSf $BASE_URL/ | head
```

HTTP API (proxy endpoints)

Primary route definitions proxy to backend services:
- Catalogue: `GET $BASE_URL/catalogue`
- Tags: `GET $BASE_URL/tags`

Cart-related endpoints rely on session management (cookies):
```shell
export BASE_URL=http://localhost:8079

# Catalogue data (example)
curl -sSf $BASE_URL/catalogue | head

# Tags
curl -sSf $BASE_URL/tags | head

# Cart (requires a login/session)
# The front-end uses cookies; in development you can override customerID with ?custId=...
curl -sSf --cookie "<cookie_here>" $BASE_URL/cart | head
```

Metrics
```shell
curl -sSf $BASE_URL/metrics | head
```

Note: The front-end proxies requests to the corresponding microservices, so the actual data comes from those services.

## Architecture

```mermaid
graph TD
  Browser[Browser / UI] -->|HTTP| FrontEnd[front-end (Node/Express)]
  FrontEnd -->|HTTP| Catalogue[catalogue service]
  FrontEnd -->|HTTP| Carts[carts service]
  FrontEnd -->|HTTP| Orders[orders service]
  FrontEnd -->|HTTP| User[user service]
  FrontEnd -->|/metrics| Prometheus[Prometheus scraper]
  FrontEnd -->|sessions (optional)| Redis[(Redis: session-db)]
```

## References

- [Express](https://expressjs.com/)
- [prom-client (Prometheus client for Node.js)](https://github.com/siimon/prom-client)
- [Docker](https://www.docker.com/)
- [microservices-demo](https://github.com/microservices-demo/microservices-demo)

## Help

- Backend services must be reachable: the front-end expects backend service DNS names like `http://catalogue`, `http://carts`, `http://orders`, `http://user`. If it runs outside the same Docker/Kubernetes network, requests will fail.
- Redis sessions require `session-db`: setting `SESSION_REDIS` enables Redis-backed sessions with host `session-db`. Ensure that host is resolvable/reachable from the container/network.
- Dev-mode customer override (security risk): in `development` mode, `custId` can be overridden via `?custId=...` query parameter.

- The front-end serves static assets from `public/` and proxies API calls to the backend microservices, so a running backend stack is required for full functionality.

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
