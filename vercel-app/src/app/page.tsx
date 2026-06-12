'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job {
  id: string
  type: 'full' | 'backend-only' | 'mobile-only'
  countries: string[]
  status: 'queued' | 'running' | 'completed' | 'failed'
  startTime: string
  endTime?: string
  exitCode?: number
  summary?: { passed: number; failed: number; skipped: number }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: 'AND', name: 'Andorra' },
  { code: 'AUT', name: 'Austria' },
  { code: 'BEL', name: 'Belgium' },
  { code: 'BGR', name: 'Bulgaria' },
  { code: 'BRA', name: 'Brazil' },
  { code: 'CHE', name: 'Switzerland' },
  { code: 'CYP', name: 'Cyprus' },
  { code: 'CZE', name: 'Czech Republic' },
  { code: 'DEU', name: 'Germany' },
  { code: 'DNK', name: 'Denmark' },
  { code: 'ESP', name: 'Spain' },
  { code: 'EST', name: 'Estonia' },
  { code: 'FIN', name: 'Finland' },
  { code: 'FRA', name: 'France' },
  { code: 'GBR', name: 'United Kingdom' },
  { code: 'GRC', name: 'Greece' },
  { code: 'HRV', name: 'Croatia' },
  { code: 'HUN', name: 'Hungary' },
  { code: 'IND', name: 'India' },
  { code: 'IRL', name: 'Ireland' },
  { code: 'ISL', name: 'Iceland' },
  { code: 'ITA', name: 'Italy' },
  { code: 'LIE', name: 'Liechtenstein' },
  { code: 'LTU', name: 'Lithuania' },
  { code: 'LUX', name: 'Luxembourg' },
  { code: 'LVA', name: 'Latvia' },
  { code: 'MDA', name: 'Moldova' },
  { code: 'MEX', name: 'Mexico' },
  { code: 'MKD', name: 'North Macedonia' },
  { code: 'MLT', name: 'Malta' },
  { code: 'MNE', name: 'Montenegro' },
  { code: 'NLD', name: 'Netherlands' },
  { code: 'NOR', name: 'Norway' },
  { code: 'POL', name: 'Poland' },
  { code: 'PRT', name: 'Portugal' },
  { code: 'ROU', name: 'Romania' },
  { code: 'SRB', name: 'Serbia' },
  { code: 'SVK', name: 'Slovakia' },
  { code: 'SVN', name: 'Slovenia' },
  { code: 'SWE', name: 'Sweden' },
  { code: 'USA', name: 'United States' },
]

const STATUS_BADGE: Record<string, string> = {
  queued:    'bg-yellow-400/10 text-yellow-300 border-yellow-400/30',
  running:   'bg-blue-400/10 text-blue-300 border-blue-400/30',
  completed: 'bg-green-400/10 text-green-300 border-green-400/30',
  failed:    'bg-red-400/10 text-red-300 border-red-400/30',
}

const STATUS_DOT: Record<string, string> = {
  queued:    'bg-yellow-400',
  running:   'bg-blue-400 animate-pulse',
  completed: 'bg-green-400',
  failed:    'bg-red-400',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function duration(start: string, end?: string) {
  const ms   = new Date(end ?? Date.now()).getTime() - new Date(start).getTime()
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

function lineColor(line: string) {
  if (/\[FAIL|Error|ERROR|Traceback/.test(line)) return 'text-red-400'
  if (/\[PASS|\[OK\]/.test(line)) return 'text-green-400'
  if (/\[Step|={4,}|#{4,}/.test(line)) return 'text-blue-300'
  if (/\[WARN|SKIP/.test(line)) return 'text-yellow-300'
  return 'text-gray-300'
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [jobs,         setJobs]         = useState<Job[]>([])
  const [selectedJob,  setSelectedJob]  = useState<string | null>(null)
  const [logs,         setLogs]         = useState<string[]>([])
  const [reports,      setReports]      = useState<string[]>([])
  const [runType,       setRunType]       = useState<'full' | 'backend-only' | 'mobile-only'>('full')
  const [selCountry,    setSelCountry]    = useState<string>('')
  const [nextEuCountry, setNextEuCountry] = useState<string>('')
  const [triggering,    setTriggering]    = useState(false)

  const logsContainerRef  = useRef<HTMLDivElement>(null)
  const logPollRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const userScrolledUpRef = useRef(false)

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/proxy/health', { cache: 'no-store' })
      setServerStatus(r.ok ? 'online' : 'offline')
    } catch { setServerStatus('offline') }
  }, [])

  const fetchJobs = useCallback(async () => {
    try {
      const r = await fetch('/api/proxy/jobs', { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); setJobs(d.jobs ?? []) }
    } catch {}
  }, [])

  const fetchLogs = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/proxy/jobs/${id}/logs`, { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); setLogs(d.logs ?? []) }
    } catch {}
  }, [])

  const fetchReports = useCallback(async () => {
    try {
      const r = await fetch('/api/proxy/reports', { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); setReports(d.reports ?? []) }
    } catch {}
  }, [])

  const fetchNextEuCountry = useCallback(async () => {
    try {
      const r = await fetch('/api/proxy/next-eu-country', { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); setNextEuCountry(d.country ?? '') }
    } catch {}
  }, [])

  // ── Polling ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    checkHealth()
    fetchJobs()
    fetchReports()
    fetchNextEuCountry()
    const h = setInterval(checkHealth, 30_000)
    const j = setInterval(fetchJobs,   2_000)
    const r = setInterval(fetchReports, 30_000)
    return () => { clearInterval(h); clearInterval(j); clearInterval(r) }
  }, [checkHealth, fetchJobs, fetchReports, fetchNextEuCountry])

  // Poll logs for the selected job while it's active
  useEffect(() => {
    if (logPollRef.current) clearInterval(logPollRef.current)
    if (!selectedJob) return
    fetchLogs(selectedJob)
    const active = jobs.find(j => j.id === selectedJob)
    if (active?.status === 'running' || active?.status === 'queued') {
      logPollRef.current = setInterval(() => fetchLogs(selectedJob), 2_000)
    }
    return () => { if (logPollRef.current) clearInterval(logPollRef.current) }
  }, [selectedJob, jobs, fetchLogs])

  // Auto-select running job
  useEffect(() => {
    if (selectedJob) return
    const active = jobs.find(j => j.status === 'running' || j.status === 'queued')
    if (active) setSelectedJob(active.id)
  }, [jobs, selectedJob])

  // Auto-scroll: only when user hasn't manually scrolled up
  useEffect(() => {
    if (userScrolledUpRef.current) return
    const el = logsContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const triggerRun = async () => {
    if (serverStatus !== 'online' || triggering) return
    setTriggering(true)
    try {
      const body: Record<string, unknown> = { type: runType }
      if (selCountry) body.countries = [selCountry]
      const r = await fetch('/api/proxy/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (r.ok) {
        setSelectedJob(d.job.id)
        setLogs([])
        await fetchJobs()
        fetchNextEuCountry()
      } else {
        alert(d.error || 'Failed to start run')
      }
    } finally {
      setTriggering(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const activeJobObj = jobs.find(j => j.id === selectedJob)

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-gray-800 px-6 py-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center">
              <span className="text-gray-950 font-bold text-xs">S</span>
            </div>
            <span className="font-semibold text-base">Speed E2E Dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              serverStatus === 'online'  ? 'bg-green-400' :
              serverStatus === 'offline' ? 'bg-red-400'   : 'bg-yellow-400 animate-pulse'
            }`} />
            <span className="text-sm text-gray-400">
              {serverStatus === 'online'  ? 'Local server connected' :
               serverStatus === 'offline' ? 'Local server offline'   : 'Connecting...'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-6 py-6 space-y-5 flex-1">

        {/* ── Trigger Panel ────────────────────────────────────────────────── */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
            Trigger Run
          </h2>

          <div className="flex flex-wrap gap-5 items-start">
            {/* Run type toggle */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Run type</p>
              <div className="flex gap-2">
                {(['full', 'backend-only', 'mobile-only'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setRunType(t)}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      runType === t
                        ? 'bg-white text-gray-950'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    {t === 'full' ? 'Full E2E' : t === 'backend-only' ? 'Backend Only' : 'Mobile Only'}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick-select: default 5 */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Quick select</p>
              <div className="flex gap-1.5 flex-wrap">
                {(['USA','MEX','BRA','GBR'] as const).map(code => (
                  <button
                    key={code}
                    onClick={() => setSelCountry(code)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selCountry === code
                        ? 'bg-white text-gray-950'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    {code}
                  </button>
                ))}
                <button
                  onClick={() => setSelCountry('EU_ROTATE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selCountry === 'EU_ROTATE'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-800 text-blue-400 hover:bg-gray-700'
                  }`}
                  title={nextEuCountry ? `Next EU: ${nextEuCountry}` : 'EU rotating'}
                >
                  EU ↻{nextEuCountry ? ` (${nextEuCountry})` : ''}
                </button>
              </div>
            </div>

            {/* Country dropdown */}
            <div>
              <p className="text-xs text-gray-500 mb-2">
                Or pick any country
              </p>
              <select
                value={selCountry}
                onChange={e => setSelCountry(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5
                           focus:outline-none focus:border-gray-500 min-w-52"
              >
                <option value="">All default countries</option>
                <option value="EU_ROTATE">EU — rotating{nextEuCountry ? ` (next: ${nextEuCountry})` : ''}</option>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                ))}
              </select>
            </div>

            {/* Run button */}
            <div className="flex flex-col justify-end">
              <button
                onClick={triggerRun}
                disabled={serverStatus !== 'online' || triggering}
                className="px-6 py-2 bg-white text-gray-950 rounded-lg font-semibold text-sm
                           disabled:opacity-30 hover:bg-gray-100 active:scale-95 transition-all"
              >
                {triggering ? 'Starting…' : '▶ Run'}
              </button>
            </div>
          </div>

          {serverStatus === 'offline' && (
            <p className="mt-3 text-sm text-red-400 flex items-center gap-2">
              <span>⚠</span>
              <span>
                Start the local server first:{' '}
                <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">
                  cd local-server && node server.js
                </code>
              </span>
            </p>
          )}
        </section>

        {/* ── History + Logs (side by side) ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Job History — 2 cols */}
          <section className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-gray-800">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                Run History
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
              {jobs.length === 0 ? (
                <div className="py-10 text-center text-gray-600 text-sm">No runs yet</div>
              ) : (
                jobs.slice(0, 20).map(job => (
                  <button
                    key={job.id}
                    onClick={() => { setSelectedJob(job.id); setLogs([]) }}
                    className={`w-full px-5 py-3 text-left transition-colors hover:bg-gray-800/40 ${
                      selectedJob === job.id ? 'bg-gray-800/40 border-l-2 border-white' : 'border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[job.status] ?? 'bg-gray-500'}`} />
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_BADGE[job.status] ?? ''}`}>
                          {job.status}
                        </span>
                        <span className="text-sm text-gray-200">
                          {job.type === 'full' ? 'Full E2E' : job.type === 'backend-only' ? 'Backend Only' : 'Mobile Only'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {duration(job.startTime, job.endTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {new Date(job.startTime).toLocaleString()}
                      </span>
                      {job.summary && (
                        <span className="text-xs space-x-1">
                          <span className="text-green-400">{job.summary.passed} ✓</span>
                          <span className="text-red-400">{job.summary.failed} ✗</span>
                          <span className="text-yellow-400">{job.summary.skipped} —</span>
                        </span>
                      )}
                    </div>
                    {job.countries?.length > 0 && (
                      <p className="text-xs text-gray-600 mt-0.5">{job.countries.join(', ')}</p>
                    )}
                  </button>
                ))
              )}
            </div>
          </section>

          {/* Logs — 3 cols */}
          <section className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                Logs
              </h2>
              <div className="flex items-center gap-3">
                {activeJobObj && (
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_BADGE[activeJobObj.status] ?? ''}`}>
                    {activeJobObj.status}
                  </span>
                )}
                {selectedJob && (
                  <span className="text-xs font-mono text-gray-600">{selectedJob}</span>
                )}
              </div>
            </div>
            <div ref={logsContainerRef} onScroll={() => { const el = logsContainerRef.current; if (el) userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 60 }} className="overflow-y-auto h-[55vh] p-4 font-mono text-xs space-y-px">
              {!selectedJob ? (
                <div className="py-12 text-center text-gray-600">Select a run from history</div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-gray-600">
                  {activeJobObj?.status === 'running' || activeJobObj?.status === 'queued'
                    ? 'Waiting for logs…'
                    : 'No logs available for this run'}
                </div>
              ) : (
                logs.map((line, i) => (
                  <div key={i} className={`leading-5 whitespace-pre-wrap break-all ${lineColor(line)}`}>
                    {line || ' '}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* ── Reports ─────────────────────────────────────────────────────── */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Reports
            </h2>
          </div>
          {reports.length === 0 ? (
            <div className="py-8 text-center text-gray-600 text-sm">No reports yet</div>
          ) : (
            <div className="divide-y divide-gray-800/60">
              {reports.map(name => {
                const date = name.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
                return (
                  <div key={name} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-200 font-mono">{name}</span>
                      {date && <span className="ml-3 text-xs text-gray-500">{date}</span>}
                    </div>
                    <a
                      href={`/api/proxy/reports/${name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Open Report →
                    </a>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
