require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const { spawn } = require('child_process')
const fs   = require('fs')
const path = require('path')

const app             = express()
const PORT            = parseInt(process.env.PORT || '3001')
const APPIUM_TESTS_DIR = process.env.APPIUM_TESTS_DIR || path.join(__dirname, '..', 'appium-tests')
const API_KEY         = process.env.API_KEY || ''
const JOBS_FILE       = path.join(__dirname, 'jobs.json')
const LOGS_DIR        = path.join(__dirname, 'logs')
const COUNTER_FILE    = path.join(APPIUM_TESTS_DIR, 'config', 'counter.json')

const EU_COUNTRIES = [
    'AUT','BEL','BGR','HRV','CYP','CZE','DEU','DNK',
    'EST','FIN','FRA','GRC','HUN','IRL','ITA','LVA',
    'LTU','LUX','MLT','NLD','POL','PRT','ROU','SVK',
    'SVN','ESP','SWE',
]

function readCounter()  { try { return JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8')) } catch { return { euCountryIndex: 0 } } }
function peekEuCountry()   { const d = readCounter(); return EU_COUNTRIES[(d.euCountryIndex ?? 0) % EU_COUNTRIES.length] }
function popEuCountry()    {
    const d     = readCounter()
    const idx   = (d.euCountryIndex ?? 0) % EU_COUNTRIES.length
    const code  = EU_COUNTRIES[idx]
    d.euCountryIndex = (idx + 1) % EU_COUNTRIES.length
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(d, null, 2))
    return code
}

app.use(cors())
app.use(express.json())

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true })

// ── In-memory log buffers keyed by job id ─────────────────────────────────────
const logBuffers = {}

// ── Job persistence ───────────────────────────────────────────────────────────
function loadJobs() {
    if (!fs.existsSync(JOBS_FILE)) return []
    try { return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')) } catch { return [] }
}
function saveJobs(jobs) {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8')
}
function updateJob(id, patch) {
    const jobs = loadJobs()
    const idx  = jobs.findIndex(j => j.id === id)
    if (idx !== -1) { Object.assign(jobs[idx], patch); saveJobs(jobs) }
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
    if (!API_KEY) return next()
    if (req.headers['x-api-key'] !== API_KEY)
        return res.status(401).json({ error: 'Unauthorized' })
    next()
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function addLog(id, line) {
    if (!logBuffers[id]) logBuffers[id] = []
    logBuffers[id].push(line)
    fs.appendFileSync(path.join(LOGS_DIR, `${id}.log`), line + '\n', 'utf8')
}

function parseSummary(logs) {
    for (const line of logs) {
        const m = line.match(/PASSED:\s*(\d+)\s+FAILED:\s*(\d+)\s+SKIPPED:\s*(\d+)/i)
        if (m) return { passed: +m[1], failed: +m[2], skipped: +m[3] }
    }
    return null
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() })
})

app.get('/next-eu-country', requireAuth, (req, res) => {
    res.json({ country: peekEuCountry() })
})

app.get('/jobs', requireAuth, (req, res) => {
    res.json({ jobs: loadJobs() })
})

app.get('/jobs/:id', requireAuth, (req, res) => {
    const job = loadJobs().find(j => j.id === req.params.id)
    if (!job) return res.status(404).json({ error: 'Not found' })
    res.json({ job })
})

app.get('/jobs/:id/logs', requireAuth, (req, res) => {
    const buf = logBuffers[req.params.id]
    if (buf) return res.json({ logs: buf })
    const logFile = path.join(LOGS_DIR, `${req.params.id}.log`)
    if (fs.existsSync(logFile)) {
        const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
        return res.json({ logs: lines })
    }
    res.json({ logs: [] })
})

app.post('/jobs', requireAuth, (req, res) => {
    const running = loadJobs().some(j => j.status === 'running' || j.status === 'queued')
    if (running) return res.status(409).json({ error: 'A run is already in progress' })

    const { type = 'full', countries = [] } = req.body
    const id  = genId()
    const job = {
        id, type, countries,
        status:    'queued',
        startTime: new Date().toISOString(),
        endTime:   null,
        exitCode:  null,
        summary:   null,
    }
    const jobs = loadJobs()
    jobs.push(job)
    saveJobs(jobs)
    logBuffers[id] = []

    res.status(201).json({ job })
    setImmediate(() => startJob(id, type, countries))
})

app.get('/reports', requireAuth, (req, res) => {
    const dir = path.join(APPIUM_TESTS_DIR, 'reports')
    if (!fs.existsSync(dir)) return res.json({ reports: [] })
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.html'))
        .sort().reverse()
    res.json({ reports: files })
})

app.get('/reports/:filename', requireAuth, (req, res) => {
    const file = path.join(APPIUM_TESTS_DIR, 'reports', path.basename(req.params.filename))
    if (!fs.existsSync(file)) return res.status(404).send('Report not found')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.sendFile(file)
})

// ── Job runner ────────────────────────────────────────────────────────────────
function startJob(id, type, countries) {
    updateJob(id, { status: 'running' })

    // Resolve EU_ROTATE → actual rotating EU country
    if (countries.includes('EU_ROTATE')) {
        const eu = popEuCountry()
        countries = countries.map(c => c === 'EU_ROTATE' ? eu : c)
        addLog(id, `[EU] Rotating EU slot → ${eu}`)
        updateJob(id, { countries })
    }

    let cmd, args
    cmd = 'npm'
    if (type === 'mobile-only') {
        args = ['run', 'e2e:mobile-only']
    } else if (type === 'backend-only') {
        args = ['run', 'e2e:backend-only', '--',
                ...(countries.length ? [`--countries=${countries.join(',')}`] : [])]
    } else if (countries.length > 0) {
        args = ['run', 'e2e', '--', `--countries=${countries.join(',')}`]
    } else {
        args = ['run', 'e2e']
    }

    addLog(id, `[START] Job ${id} | type: ${type}${countries.length ? ' | countries: ' + countries.join(',') : ''}`)
    addLog(id, `[CMD] ${cmd} ${args.join(' ')}`)

    const child = spawn(cmd, args, {
        cwd:   APPIUM_TESTS_DIR,
        shell: true,
        env:   { ...process.env, FORCE_COLOR: '0' },
    })

    child.stdout.on('data', d =>
        d.toString().split('\n').forEach(l => l.trim() && addLog(id, l))
    )
    child.stderr.on('data', d =>
        d.toString().split('\n').forEach(l => l.trim() && addLog(id, `[ERR] ${l}`))
    )

    child.on('close', code => {
        const buf = logBuffers[id] || []
        const summary = parseSummary(buf)

        updateJob(id, {
            status:  code === 0 ? 'completed' : 'failed',
            exitCode: code,
            endTime: new Date().toISOString(),
            summary,
        })

        addLog(id, `[DONE] Exit code: ${code}`)
        console.log(`[Job ${id}] finished — exit ${code}`)
    })
}

// ── Startup: recover stuck jobs from previous crash ───────────────────────────
function recoverStuckJobs() {
    const jobs = loadJobs()
    const stuck = jobs.filter(j => j.status === 'running' || j.status === 'queued')
    if (stuck.length === 0) return
    stuck.forEach(j => {
        j.status  = 'failed'
        j.endTime = new Date().toISOString()
        j.exitCode = -1
        console.log(`[Recovery] Marked stuck job ${j.id} as failed`)
    })
    saveJobs(jobs)
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    recoverStuckJobs()
    console.log(`E2E Local Server on http://localhost:${PORT}`)
    console.log(`APPIUM_TESTS_DIR: ${APPIUM_TESTS_DIR}`)
    if (!API_KEY) console.warn('[WARN] API_KEY not set — server is open to anyone')
})
