# Backend production-readiness changes

## Changes applied

- Updated TypeScript module resolution to `Node16`, avoiding the removed `node10` resolution mode in newer TypeScript toolchains.
- Pinned TypeScript to `5.9.3` to keep builds deterministic across installs.
- Corrected the backend start path to `dist/src/server.js` (the configured `rootDir` is the backend directory and source lives under `src/`).
- Added a `typecheck` script and enabled `noEmitOnError` so failed compilation cannot leave a seemingly deployable partial build.
- Changed MongoDB connection handling to fail startup when the database is unavailable instead of logging and continuing with an uninitialized database connection.
- Added bounded MongoDB server selection timeout, connection pool settings, and disabled automatic index creation in production.
- Aligned the default MongoDB database name with the URI (`leadflow_crm`).
- Strengthened production environment validation, including a required Meta app secret for webhook signature verification.
- Improved API error handling so unexpected errors return a generic 500 response while retaining server-side diagnostics.
- Added SIGTERM/SIGINT shutdown handling and updated the Docker build to work without a checked-in npm lockfile.

## Required deployment checks

1. Set `NODE_ENV=production`.
2. Set `MONGO_URI` to the production MongoDB Atlas connection string and `MONGO_DB_NAME` to the intended database.
3. Set a unique `JWT_SECRET` with at least 32 characters; do not use the example value.
4. Set `META_VERIFY_TOKEN` and `META_APP_SECRET` to the values from the Meta app configuration.
5. Set `FRONTEND_URL` to the exact frontend origin(s), comma-separated if there are multiple.
6. Configure Redis and AWS S3 variables if the corresponding features are enabled.
7. Deploy with root directory `backend`, build command `npm install && npm run build`, and start command `npm start`.
8. Confirm `GET /health`, login, role-based authorization, Meta webhook verification/signature validation, lead creation, S3 presigned upload, Socket.IO authentication, and follow-up reminder behavior in a staging environment.

## Validation limitation

The source archive did not include an npm lockfile or installed dependencies. Dependency installation timed out in this environment, so a complete TypeScript build and integration test run could not be confirmed here. Run `npm install`, `npm run typecheck`, and `npm run build` in CI before production deployment; do not interpret these edits as a guarantee that no production errors can occur.
