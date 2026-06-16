#!/usr/bin/env node

// CLI wrapper: run the compiled rereadme entry point.
// script.js self-executes (calls main()) and reads CLI args from process.argv,
// so importing it runs the CLI with the same arguments.
await import('../dist/script.js');
