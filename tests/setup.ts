// Vitest global setup: load .env so integration tests can reach the database.
// Unit tests don't need it; integration tests self-skip when DATABASE_URL is
// absent (see *.integration.test.ts).
import '../src/config/load-dotenv.js';
