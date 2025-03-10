# CLAUDE.md - PlayWLLM Server Guidelines

## Build & Development Commands
- `npm run start:auth` - Start auth service
- `npm run start:business` - Start business service
- `npm run start:inference` - Start inference service
- `npm run dev` - Start both business and inference services concurrently

## Test Commands
- `npm test` - Run all tests
- `npm run test:watch` - Watch mode with verbose output
- `npx jest path/to/test-file.test.js` - Run a single test file
- `npx jest -t "test name pattern"` - Run tests matching pattern

## Code Style Guidelines
- **Modules**: CommonJS (`require`/`module.exports`)
- **Imports**: Third-party packages first, then internal modules
- **Error Handling**: Use `AppError` class with proper HTTP status codes
- **Naming**: Functions/variables: camelCase, Classes: PascalCase, Files: kebab-case
- **Structure**: Domain-driven design with each domain containing api.js, event.js, request.js, schema.js, service.js
- **Validation**: Use Joi for request validation schemas
- **Testing**: Jest with describe/it blocks, proper mocks and setup/teardown
- **Documentation**: JSDoc-style comments, contextual error logging

Always follow existing patterns in similar files when adding new code.