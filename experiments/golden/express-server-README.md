# express-server

## Description

A minimal Express.js server with a small Document API backed by MongoDB. Designed for local development and easy experimentation with a lightweight data layer. The project exposes REST endpoints under /api/document to create and retrieve documents.

## Getting Started

### Dependencies

- Node.js and npm
- MongoDB (running on localhost:27017, as used by the code)
- Optional: Docker and Visual Studio Code Dev Containers if you want to provision a workspace with MongoDB, Node, and npm via a Dev Container

### Installation

1) Install dependencies

- npm install

1) Ensure MongoDB is running locally

- MongoDB should be reachable at mongodb://localhost:27017

1) Start the server

- npm run start
- The server listens on <http://localhost:9000>

1) Development in a Dev Container (optional)

- Open this project in VS Code and use Reopen in Container to provision the workspace with MongoDB and Node/NPM.

### Usage

- Start the server
  - npm run start
  - URL: <http://localhost:9000/>

- Common API interactions
  - Create a document
    - curl -X POST -H "Content-Type: application/json" -d '{"_id":"doc1","title":"Sample"}' <http://localhost:9000/api/document>
  - Retrieve a document by ID
    - curl <http://localhost:9000/api/document/doc1>
  - Health/Root
    - curl <http://localhost:9000/>

- Tests
  - This repository does not include a test suite. If you add tests, follow your usual npm test workflow.

## Architecture and Diagrams

- Overview
  - Client -> Express server (src/server.js) on port 9000
  - API router mounted at /api/document (src/controllers/documentController.js)
  - Service layer (src/services/documentService.js) orchestrates business logic
  - Data layer
    - src/data/documentDao.js provides createDocument and queryDocumentById
    - src/data/mongoDao.js manages MongoDB connection, collection access, and closeDbClient
  - MongoDB is accessed via the documents collection in database express-server

- Simple ASCII diagram
  - Client
      -> HTTP to <http://localhost:9000>
  - Server (Express)
      -> /api/document
          -> documentController.js
              -> documentService.js
                  -> documentDao.js
                      -> mongoDao.js (MongoClient, getDocumentsCollection, closeDbClient)
  - Database: MongoDB (mongodb://localhost:27017)

- Main exports (external-facing)
  - Mongo DAO: closeDbClient, getDocumentsCollection (src/data/mongoDao.js)
  - Document DAO: createDocument, queryDocumentById (src/data/documentDao.js)
  - Services: getDocument, postDocument (src/services/documentService.js)
  - Controller Router: router (src/controllers/documentController.js) exported for mounting in Express

## References

- Express.js: <https://expressjs.com/>
- Node.js: <https://nodejs.org/>
- MongoDB Node.js Driver: <https://www.npmjs.com/package/mongodb>
- Project repository: <https://github.com/cjlludwig/express-server>

## Help

- MongoDBConnection
  - Ensure MongoDB is running locally on port 27017 and accessible from the Node process.
- Dev Container
  - If using a VS Code Dev Container, ensure Docker daemon is running and you have the Dev Containers extension installed.
- Common issues
  - If the API calls return unexpected results, confirm the request payload structure matches what the service expects and that the MongoDB collection is reachable.
  - The server logs indicate port 9000 and basic startup/shutdown messages; check console output for connection errors to MongoDB.
