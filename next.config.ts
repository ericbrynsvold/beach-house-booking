import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Ensure .env.local is on process.env before Middleware is bundled (Edge).
// Without this, SESSION_SECRET can be missing in middleware while Route Handlers still see it,
// which looks like "I'm on the site but every API says Unauthorized".
loadEnvConfig(process.cwd());

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
