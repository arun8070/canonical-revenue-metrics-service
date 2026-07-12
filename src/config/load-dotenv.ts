// Side-effect-only module: load `.env` into process.env.
//
// Import this as the FIRST import in every entrypoint. ES modules evaluate
// imports (depth-first, in source order) before any other top-level code, so a
// plain `process.loadEnvFile()` placed in an entrypoint body runs too late —
// modules like logging/logger.ts read env at import time. Importing this first
// guarantees the file is loaded before anything reads process.env.
try {
  process.loadEnvFile();
} catch {
  // No .env file (e.g. production, where the platform injects env vars).
}
