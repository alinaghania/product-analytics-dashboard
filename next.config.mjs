import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

// Pin the project root so Next doesn't infer it from a stray lockfile in a parent directory.
const projectRoot = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server (.next/standalone) for the Cloud Run Docker image.
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
}

export default nextConfig
