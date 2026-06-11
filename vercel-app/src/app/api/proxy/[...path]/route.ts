import { NextRequest, NextResponse } from 'next/server'

const LOCAL_SERVER_URL = process.env.LOCAL_SERVER_URL || 'http://localhost:3001'
const API_KEY          = process.env.LOCAL_SERVER_API_KEY || ''

function buildHeaders(): HeadersInit {
  const h: Record<string, string> = {}
  if (API_KEY) h['x-api-key'] = API_KEY
  return h
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const p   = params.path.join('/')
  const url = `${LOCAL_SERVER_URL}/${p}${req.nextUrl.search}`

  try {
    const res = await fetch(url, { headers: buildHeaders(), cache: 'no-store' })
    const ct  = res.headers.get('content-type') || ''

    if (ct.includes('text/html')) {
      const html = await res.text()
      return new NextResponse(html, {
        status: res.status,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Local server unreachable' }, { status: 503 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const p   = params.path.join('/')
  const url = `${LOCAL_SERVER_URL}/${p}`

  try {
    const body    = await req.json()
    const headers = { ...buildHeaders(), 'Content-Type': 'application/json' }
    const res     = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    const data    = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Local server unreachable' }, { status: 503 })
  }
}
