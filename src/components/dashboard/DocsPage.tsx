'use client'

import { useState, type ReactNode } from 'react'

import { TokenStore } from '@/lib/api'
import { apiDocs, type DocEndpoint, type DocField, type HttpMethod } from '@/lib/apiDocs'
import { useReveal } from '@/lib/motion'
import { Icons, Spinner } from './ui'

const methodStyles: Record<HttpMethod, string> = {
  GET: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25',
  POST: 'bg-brand-50 text-brand-600 dark:text-brand-300 border-brand-200',
  PATCH: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/25',
  DELETE: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/25',
}

function statusStyle(status: number): string {
  if (status < 300) return 'text-emerald-600 dark:text-emerald-400'
  if (status < 500) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2)

const inputClass =
  'w-full px-3 py-1.5 text-xs font-mono bg-surface-1 text-ink border border-hairline rounded-md input-focus focus:outline-none focus:border-brand-400'

function LockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-medium text-ink-subtle uppercase tracking-wider mb-2">{children}</h4>
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="relative group">
      <pre className="text-xs font-mono text-ink-muted bg-surface-2 border border-hairline rounded-md p-3 pr-10 overflow-x-auto whitespace-pre">{code}</pre>
      <button type="button" onClick={copy} title="Copy" aria-label="Copy"
        className="absolute top-2 right-2 p-1 rounded-md text-ink-subtle hover:text-ink hover:bg-surface-3 transition-colors">
        {copied ? <Icons.Check /> : <Icons.Copy />}
      </button>
    </div>
  )
}

function FieldTable({ fields }: { fields: DocField[] }) {
  return (
    <div className="border border-hairline rounded-md overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-surface-2 border-b border-hairline">
          <tr className="text-left text-ink-subtle text-xs font-medium uppercase tracking-wider">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {fields.map(field => (
            <tr key={field.name}>
              <td className="px-3 py-2 whitespace-nowrap align-top">
                <code className="text-xs font-mono text-ink">{field.name}</code>
                {field.required && <span className="ml-1.5 text-[10px] font-semibold text-red-500">required</span>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap align-top"><code className="text-xs font-mono text-ink-subtle">{field.type}</code></td>
              <td className="px-3 py-2 text-xs text-ink-muted">{field.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface TryResult {
  status: number
  ms: number
  body: string
}

// Request builder: fills the path and query from the inputs and sends it to this server
function TryIt({ endpoint }: { endpoint: DocEndpoint }) {
  const inputs = [...(endpoint.pathParams ?? []), ...(endpoint.query ?? [])]
  const [values, setValues] = useState<Record<string, string>>({})
  const [body, setBody] = useState(endpoint.bodyExample ? pretty(endpoint.bodyExample) : '')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<TryResult | null>(null)
  const [error, setError] = useState('')

  const value = (name: string) => (values[name] ?? '').trim()

  let path = endpoint.path
  for (const param of endpoint.pathParams ?? []) {
    path = path.replace(`:${param.name}`, encodeURIComponent(value(param.name)) || `:${param.name}`)
  }
  const search = new URLSearchParams()
  for (const param of endpoint.query ?? []) {
    if (value(param.name)) search.set(param.name, value(param.name))
  }
  const url = window.location.origin + path + (search.size ? `?${search}` : '')

  const curl = [
    `curl -X ${endpoint.method} '${url}'`,
    endpoint.auth && `  -H 'Authorization: Bearer <token>'`,
    endpoint.body && `  -H 'Content-Type: application/json'`,
    endpoint.body && `  -d '${body.replaceAll("'", "'\\''")}'`,
  ].filter(Boolean).join(' \\\n')

  const missing = inputs.find(field => field.required && !value(field.name))

  const send = async () => {
    setError('')
    setResult(null)
    if (missing) return setError(`${missing.name} is required.`)
    if (endpoint.body) {
      try {
        JSON.parse(body)
      } catch {
        return setError('Request body is not valid JSON.')
      }
    }

    const headers: Record<string, string> = {}
    const token = TokenStore.get()
    if (endpoint.auth && token) headers.Authorization = `Bearer ${token}`
    if (endpoint.body) headers['Content-Type'] = 'application/json'

    setSending(true)
    const started = performance.now()
    try {
      const response = await fetch(url, { method: endpoint.method, headers, body: endpoint.body ? body : undefined })
      const text = await response.text()
      let shown = text
      try {
        shown = pretty(JSON.parse(text))
      } catch {
        // Not JSON: show the raw text
      }
      setResult({ status: response.status, ms: Math.round(performance.now() - started), body: shown })
    } catch {
      setError('Request failed — the server could not be reached.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-surface-0 border border-hairline rounded-md p-3 sm:p-4 space-y-3">
      {inputs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {inputs.map(field => (
            <label key={field.name} className="block">
              <span className="block text-xs text-ink-muted mb-1">
                <code className="font-mono">{field.name}</code>
                {field.required && <span className="ml-1 text-red-500">*</span>}
              </span>
              <input value={values[field.name] ?? ''} placeholder={field.type}
                onChange={e => setValues({ ...values, [field.name]: e.target.value })} className={inputClass} />
            </label>
          ))}
        </div>
      )}

      {endpoint.body && (
        <label className="block">
          <span className="block text-xs text-ink-muted mb-1">Request body</span>
          <textarea value={body} onChange={e => setBody(e.target.value)} spellCheck={false}
            rows={Math.min(12, body.split('\n').length + 1)} className={`${inputClass} resize-y`} />
        </label>
      )}

      <CodeBlock code={curl} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={send} disabled={sending}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-md disabled:opacity-60">
          {sending && <Spinner size="w-3.5 h-3.5" />}
          Send request
        </button>
        <span className="text-xs text-ink-subtle">
          Runs against this server{endpoint.auth && ' with your current session token'}. Changes are real.
        </span>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <div>
          <p className="text-xs text-ink-subtle mb-1.5">
            <span className={`font-mono font-semibold ${statusStyle(result.status)}`}>{result.status}</span>
            <span className="ml-2">{result.ms} ms</span>
          </p>
          <CodeBlock code={result.body || '(empty response)'} />
        </div>
      )}
    </div>
  )
}

function EndpointCard({ endpoint }: { endpoint: DocEndpoint }) {
  const [open, setOpen] = useState(false)

  return (
    <div data-reveal className="bg-surface-1 rounded-xl border border-hairline overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors">
        <span className={`w-16 flex-shrink-0 text-center px-2 py-0.5 rounded text-[11px] font-semibold border ${methodStyles[endpoint.method]}`}>
          {endpoint.method}
        </span>
        <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
          <code className="block text-xs sm:text-sm font-mono text-ink break-all">{endpoint.path}</code>
          <span className="block text-xs text-ink-subtle sm:truncate">{endpoint.summary}</span>
        </span>
        {endpoint.auth && <span className="flex-shrink-0 text-ink-subtle" title="Requires admin token"><LockIcon /></span>}
        <svg className={`w-4 h-4 flex-shrink-0 text-ink-subtle transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 py-4 border-t border-hairline space-y-5 fade-in">
          {(endpoint.description || endpoint.auth || endpoint.rateLimit) && (
            <div className="space-y-2">
              {endpoint.description && <p className="text-sm text-ink-muted leading-relaxed">{endpoint.description}</p>}
              <div className="flex flex-wrap gap-2">
                {endpoint.auth && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-surface-2 text-ink-muted border border-hairline">
                    <LockIcon /> Bearer token
                  </span>
                )}
                {endpoint.rateLimit && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-2 text-ink-muted border border-hairline">
                    Rate limit: {endpoint.rateLimit}
                  </span>
                )}
              </div>
            </div>
          )}

          {endpoint.pathParams && (
            <div>
              <SectionTitle>Path parameters</SectionTitle>
              <FieldTable fields={endpoint.pathParams} />
            </div>
          )}

          {endpoint.query && (
            <div>
              <SectionTitle>Query parameters</SectionTitle>
              <FieldTable fields={endpoint.query} />
            </div>
          )}

          {endpoint.body && (
            <div>
              <SectionTitle>Request body (application/json)</SectionTitle>
              <FieldTable fields={endpoint.body} />
            </div>
          )}

          <div>
            <SectionTitle>Responses</SectionTitle>
            <div className="space-y-3">
              {endpoint.responses.map((response, i) => (
                <div key={i}>
                  <p className="text-xs text-ink-muted mb-1.5">
                    <span className={`font-mono font-semibold ${statusStyle(response.status)}`}>{response.status}</span>
                    <span className="ml-2">{response.description}</span>
                  </p>
                  {response.example !== undefined && <CodeBlock code={pretty(response.example)} />}
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle>Try it out</SectionTitle>
            {endpoint.noTryIt
              ? <p className="text-xs text-ink-subtle">{endpoint.noTryIt}</p>
              : <TryIt endpoint={endpoint} />}
          </div>
        </div>
      )}
    </div>
  )
}

// API Docs Page — endpoint reference with a request builder
export function DocsPage() {
  const revealRef = useReveal<HTMLDivElement>()
  const count = apiDocs.reduce((n, group) => n + group.endpoints.length, 0)

  return (
    <div ref={revealRef}>
      <div data-reveal className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">API Docs</h2>
          <p className="text-sm text-ink-subtle mt-0.5">{count} endpoints</p>
        </div>
        <code className="text-xs font-mono text-ink-subtle bg-surface-2 px-3 py-1.5 rounded-full border border-hairline">
          {window.location.origin}
        </code>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
        <div data-reveal className="bg-surface-1 rounded-xl border border-hairline p-4 sm:p-5">
          <SectionTitle>Authentication</SectionTitle>
          <p className="text-xs text-ink-muted leading-relaxed">
            Admin endpoints need the token from <code className="font-mono">/admin/auth/login</code> in an
            {' '}<code className="font-mono">Authorization: Bearer &lt;token&gt;</code> header. License and auth endpoints are public.
          </p>
        </div>
        <div data-reveal className="bg-surface-1 rounded-xl border border-hairline p-4 sm:p-5">
          <SectionTitle>Errors</SectionTitle>
          <p className="text-xs text-ink-muted leading-relaxed">
            Errors return JSON as <code className="font-mono">{'{"detail": "..."}'}</code>. A body or query that fails
            validation returns 422, an unknown route 404. A request body must be sent as
            {' '}<code className="font-mono">application/json</code>; anything else returns 415.
          </p>
        </div>
        <div data-reveal className="bg-surface-1 rounded-xl border border-hairline p-4 sm:p-5">
          <SectionTitle>Rate limits</SectionTitle>
          <p className="text-xs text-ink-muted leading-relaxed">
            60 requests per minute per IP on each path unless noted. Over the limit returns 429 with a
            {' '}<code className="font-mono">Retry-After</code> header and <code className="font-mono">retry_after</code> in the body.
          </p>
        </div>
      </div>

      {apiDocs.map(group => (
        <section key={group.name} className="mb-6 md:mb-8">
          <div data-reveal className="mb-3">
            <h3 className="text-sm font-semibold text-ink">{group.name}</h3>
            <p className="text-xs text-ink-subtle mt-0.5">{group.description}</p>
          </div>
          <div className="space-y-2">
            {group.endpoints.map(endpoint => (
              <EndpointCard key={`${endpoint.method} ${endpoint.path}`} endpoint={endpoint} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
