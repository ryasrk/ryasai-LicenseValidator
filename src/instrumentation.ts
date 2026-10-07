/**
 * Runs once when the server starts. The work is in instrumentation.node.ts: it needs
 * node:http, and importing it inside this check keeps it out of the Edge build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node')
  }
}
