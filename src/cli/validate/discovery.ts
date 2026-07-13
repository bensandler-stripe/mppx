import type { EndpointSpec, PathParameter } from './helpers.js'
import { fetchWithTimeout, HTTP_METHODS } from './helpers.js'

export async function fetchDiscoveryDoc(
  baseUrl: string,
): Promise<{ doc: unknown; raw: string } | { error: string }> {
  // Trailing slash makes URL treat baseUrl as a directory, so relative resolution appends rather than replaces the last segment.
  const url = new URL('openapi.json', baseUrl.replace(/\/?$/, '/')).href
  try {
    const response = await fetchWithTimeout(url, {})
    if (!response.ok) return { error: `HTTP ${response.status}` }
    const raw = await response.text()
    const doc = JSON.parse(raw)
    return { doc, raw }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      return { error: 'Request timed out after 15s' }
    if (error instanceof SyntaxError) return { error: 'Invalid JSON' }
    return { error: (error as Error).message }
  }
}

// Extracts testable endpoints from an OpenAPI doc. Prefers endpoints with
// explicit x-payment-info (the server declares them as paid). Falls back to
// endpoints that list a 402 response (weaker signal, but still worth testing).
export function extractEndpointsFromDiscovery(doc: Record<string, unknown>): EndpointSpec[] {
  const withPaymentInfo: EndpointSpec[] = []
  const with402Response: EndpointSpec[] = []
  const paths = doc.paths as Record<string, Record<string, unknown>> | undefined
  if (!paths) return []
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    const pathLevelParams = extractPathParameters(pathItem.parameters)

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) continue
      const op = operation as Record<string, unknown>

      const opParams = extractPathParameters(op.parameters)
      const merged = mergeParameters(pathLevelParams, opParams)
      const params = merged.length > 0 ? merged : undefined

      if (op['x-payment-info']) {
        const payInfo = op['x-payment-info'] as Record<string, unknown>
        withPaymentInfo.push({
          method: method.toUpperCase(),
          path: pathKey,
          amount: payInfo.amount as string | undefined,
          parameters: params,
        })
      } else {
        const responses = op.responses as Record<string, unknown> | undefined
        if (responses && '402' in responses) {
          with402Response.push({ method: method.toUpperCase(), path: pathKey, parameters: params })
        }
      }
    }
  }
  return withPaymentInfo.length > 0 ? withPaymentInfo : with402Response
}

export function extractRequestBodyFromDiscovery(
  doc: Record<string, unknown>,
  endpoint: EndpointSpec,
): string | undefined {
  const paths = doc.paths as Record<string, Record<string, unknown>> | undefined
  if (!paths) return undefined
  const pathItem = paths[endpoint.path]
  if (!pathItem) return undefined
  const op = pathItem[endpoint.method.toLowerCase()] as Record<string, unknown> | undefined
  if (!op?.requestBody) return undefined

  const rb = op.requestBody as Record<string, unknown>
  const content = rb.content as Record<string, unknown> | undefined
  const jsonContent = content?.['application/json'] as Record<string, unknown> | undefined
  if (!jsonContent) return undefined

  if (jsonContent.example) return JSON.stringify(jsonContent.example)

  const schema = jsonContent.schema as Record<string, unknown> | undefined
  if (!schema || schema.type !== 'object') return undefined

  const result = generateValueFromSchema(schema)
  if (result && typeof result === 'object' && Object.keys(result as object).length > 0) {
    return JSON.stringify(result)
  }
  return undefined
}

export function buildUrl(baseUrl: string, endpoint: EndpointSpec, query?: string[]): string {
  let path = endpoint.path
  if (endpoint.parameters) {
    path = substitutePathParams(path, endpoint.parameters)
  }
  // Strip leading slash so URL resolves relative to baseUrl's path, not root.
  const relativePath = path.startsWith('/') ? path.slice(1) : path
  let url = new URL(relativePath, baseUrl.replace(/\/?$/, '/')).href
  if (query) {
    const u = new URL(url)
    for (const q of query) {
      const [key, ...rest] = q.split('=')
      if (key) u.searchParams.set(key, rest.join('='))
    }
    url = u.href
  }
  return url
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function extractPathParameters(raw: unknown): PathParameter[] {
  if (!Array.isArray(raw)) return []
  const results: PathParameter[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const param = p as Record<string, unknown>
    if (param.in !== 'path' || typeof param.name !== 'string') continue
    results.push(
      param.schema && typeof param.schema === 'object'
        ? {
            name: param.name,
            in: 'path' as const,
            schema: param.schema as NonNullable<PathParameter['schema']>,
            example: param.example,
          }
        : { name: param.name, in: 'path' as const, example: param.example },
    )
  }
  return results
}

function mergeParameters(base: PathParameter[], override: PathParameter[]): PathParameter[] {
  const merged = [...base]
  for (const p of override) {
    const idx = merged.findIndex((m) => m.name === p.name)
    if (idx >= 0) merged[idx] = p
    else merged.push(p)
  }
  return merged
}

function substitutePathParams(path: string, params: PathParameter[]): string {
  return path.replace(/\{([^}]+)\}/g, (match, name) => {
    const param = params.find((p) => p.name === name && p.in === 'path')
    if (!param) return match
    const value = param.example ?? param.schema?.example ?? param.schema?.default
    if (value === undefined) return match
    return encodeURIComponent(String(value))
  })
}

function generateValueFromSchema(schema: Record<string, unknown>): unknown {
  if (schema.const !== undefined) return schema.const
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default

  switch (schema.type) {
    case 'string': {
      if (schema.enum && Array.isArray(schema.enum)) return schema.enum[0]
      if (schema.format === 'email') return 'test@example.com'
      if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000'
      if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com'
      return 'test'
    }
    case 'number':
    case 'integer':
      return (schema.minimum as number) ?? 1
    case 'boolean':
      return true
    case 'array':
      return []
    case 'object': {
      const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
      if (!properties) return {}
      const required = (schema.required as string[]) || []
      const obj: Record<string, unknown> = {}
      for (const key of required) {
        const prop = properties[key]
        if (prop) obj[key] = generateValueFromSchema(prop)
      }
      return obj
    }
    default:
      return null
  }
}
