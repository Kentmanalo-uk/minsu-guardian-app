// Production entry for hosting that runs a single Node.js app (e.g. Hostinger web hosting).
// 1. Prepares the database (tables, first admin, optional sample data).
// 2. Starts the six module services on free internal ports (shared hosting may already use 4001–4006).
// 3. On $PORT, serves the built React app (dist/) and forwards /api/<module>/... to each service,
//    the same routing Nginx does in the Docker setup.
// Usage: npm run build && npm start
import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 3000)

const SERVICES = [
  { name: 'auth', prefix: '/api/auth/', entry: 'modules/m1-auth/services/auth-service/src/index.js' },
  { name: 'student', prefix: '/api/students/', entry: 'modules/m2-incidents/services/student-service/src/index.js' },
  { name: 'incident', prefix: '/api/incidents/', entry: 'modules/m2-incidents/services/incident-service/src/index.js' },
  { name: 'case', prefix: '/api/cases/', entry: 'modules/m3-cases/services/case-service/src/index.js' },
  { name: 'report', prefix: '/api/reports/', entry: 'modules/m5-reports/services/report-service/src/index.js' },
  { name: 'analytics', prefix: '/api/analytics/', entry: 'modules/m4-dashboard/services/analytics-service/src/index.js' },
]

// Ask the OS for a port nobody is using
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer().once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

for (const s of SERVICES) s.port = await freePort()
const url = (name) => `http://127.0.0.1:${SERVICES.find(s => s.name === name).port}`

// The services find each other on localhost
const serviceEnv = {
  ...process.env,
  AUTH_SERVICE_URL: url('auth'),
  STUDENT_SERVICE_URL: url('student'),
  CASE_SERVICE_URL: url('case'),
}

const children = new Set()
function run(entry, env) {
  const child = spawn(process.execPath, [path.join(ROOT, entry)], { cwd: ROOT, env, stdio: 'inherit' })
  children.add(child)
  child.on('exit', () => children.delete(child))
  return child
}

// Stop the services together with this process, so a restart never leaves them holding ports
let stopping = false
function shutdown() {
  stopping = true
  for (const child of children) child.kill()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('exit', () => { for (const child of children) child.kill() })

// Restart a service if it crashes, waiting a little longer each time
function startService(service, delay = 1000) {
  const child = run(service.entry, { ...serviceEnv, PORT: String(service.port) })
  const started = Date.now()
  child.on('exit', (code) => {
    if (stopping) return
    const next = Date.now() - started > 60_000 ? 1000 : Math.min(delay * 2, 30_000)
    console.error(`[server] ${service.name} service exited (${code}); restarting in ${next / 1000}s`)
    setTimeout(() => startService(service, next), next)
  })
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(DIST, path.normalize(urlPath))
  if (!file.startsWith(DIST)) { res.writeHead(400); return res.end() }
  // React Router: unknown paths load the app
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')

  const ext = path.extname(file)
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    // Vite puts a content hash in asset names, so those can be cached for good
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  fs.createReadStream(file).pipe(res)
}

function proxy(req, res, service) {
  const upstream = http.request({
    host: '127.0.0.1',
    port: service.port,
    method: req.method,
    path: '/' + req.url.slice(service.prefix.length),
    headers: req.headers,
  }, (up) => {
    res.writeHead(up.statusCode, up.headers)
    up.pipe(res)
  })
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'The service is starting or unavailable. Try again in a moment.' }))
  })
  req.pipe(upstream)
}

// 1. Database
await new Promise((resolve) => {
  run('database/setup.js', process.env).on('exit', (code) => {
    if (code !== 0) console.error('[server] Database setup failed; check the DB_* settings. Starting anyway.')
    resolve()
  })
})

// 2. Services
SERVICES.forEach(s => startService(s))

// 3. Website + API routing
if (!fs.existsSync(path.join(DIST, 'index.html'))) console.error('[server] dist/ is missing: run `npm run build` first.')

http.createServer((req, res) => {
  const service = SERVICES.find(s => req.url.startsWith(s.prefix))
  if (service) return proxy(req, res, service)
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(404); return res.end() }
  serveStatic(req, res)
}).listen(PORT, () => console.log(`[server] MinSU Guardian listening on :${PORT}`))
