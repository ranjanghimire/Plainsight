import jwt from "jsonwebtoken";

// IMPORTANT:
// Do NOT hardcode your secret here.
// Pass it via environment variable when running the script.
const JWT_SECRET = "alF4x+5/3nz2LMkA5L8LyiX5Giw1EA85k2aP2S4ufafL2Y7bIaamP0FBCoTMIBuF2tQCk3/stGd5M7QdW2qgUA=="

if (!JWT_SECRET) {
  console.error("Missing SUPABASE_JWT_SECRET env variable");
  process.exit(1);
}

// Use the same test user ID you put in .env.test.local
const TEST_USER_ID = process.env.VITEST_SUPABASE_USER_ID || "00000000-0000-0000-0000-000000000001";

const token = jwt.sign(
  {
    sub: TEST_USER_ID,
    role: "authenticated",
    // 1-year expiration
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  },
  JWT_SECRET,
  { algorithm: "HS256" }
);

console.log("\nYour test session token:\n");
console.log(token);
console.log("\nAdd this to VITEST_SUPABASE_SESSION_TOKEN in .env.test.local\n");

