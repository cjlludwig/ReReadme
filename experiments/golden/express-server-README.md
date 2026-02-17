# express-server

## Description

Minimal Express.js server with a Document API backed by MongoDB. Designed for local development and experimentation with a lightweight data layer.

## Getting Started

### Dependencies

- Node.js
- MongoDB running on `localhost:27017`
- Docker + VS Code Dev Containers extension (optional)

### Installation

1. Install dependencies

   ```shell
   npm install
   ```

2. Start MongoDB locally
   - Ensure reachable at `mongodb://localhost:27017`

3. Start the server

   ```shell
   npm run start
   ```

   Server runs on `http://localhost:9000`

**Dev Container (optional)**: Open in VS Code and select "Reopen in Container"

## Usage

```shell
npm run start # Start server on http://localhost:9000

# Health check
curl http://localhost:9000/

# Create document
curl -X POST -H "Content-Type: application/json" \
  -d '{"_id":"doc1","title":"Sample"}' \
  http://localhost:9000/api/document

# Get document by ID
curl http://localhost:9000/api/document/doc1
```

## Architecture

```text
Client
  └─> Express (port 9000)
      └─> /api/document router
          └─> documentController
              └─> documentService
                  └─> documentDao
                      └─> mongoDao (MongoClient)
                          └─> MongoDB (localhost:27017)
                              └─> express-server.documents
```

**Layer exports:**

- `mongoDao`: `closeDbClient`, `getDocumentsCollection`
- `documentDao`: `createDocument`, `queryDocumentById`
- `documentService`: `getDocument`, `postDocument`
- `documentController`: Express router

## References

- [Express.js](https://expressjs.com/)
- [MongoDB Node.js Driver](https://www.npmjs.com/package/mongodb)
- [VS Code Dev Container](https://code.visualstudio.com/docs/devcontainers/containers)

## Help

- **MongoDB connection**: Confirm MongoDB is running on port 27017 and accessible
- **Dev Container**: Requires running Docker daemon and Dev Containers extension
- **API errors**: Verify request payload structure and MongoDB connectivity; check console for connection errors
