/**
 * API reference shown on the in-app API Docs page.
 *
 * Written by hand from the route definitions in src/server — update it whenever a
 * route, its schema or a rate limit (src/server/middleware.ts) changes.
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface DocField {
  name: string
  type: string
  required?: boolean
  description: string
}

export interface DocResponse {
  status: number
  description: string
  example?: unknown
}

export interface DocEndpoint {
  method: HttpMethod
  path: string
  summary: string
  description?: string
  auth?: boolean // requires the admin JWT
  rateLimit?: string
  pathParams?: DocField[]
  query?: DocField[]
  body?: DocField[]
  bodyExample?: Record<string, unknown>
  responses: DocResponse[]
}

export interface DocGroup {
  name: string
  description: string
  endpoints: DocEndpoint[]
}

const license = {
  id: '3f6c1a52-9d0b-4c7e-8a41-2b7d5e9f0c13',
  license_key: 'RYASAI-9F2C41AB-07D3E6B1-C45A0F92',
  customer_name: 'Acme Corp',
  customer_email: 'it@acme.example',
  plan: 'pro',
  product: 'ryasai-chatbot',
  max_machines: 3,
  is_active: true,
  expires_at: '2027-12-31T00:00:00',
  created_at: '2026-10-06T08:15:30.123000',
}

const validateBody: DocField[] = [
  { name: 'license_key', type: 'string', required: true, description: 'The license key issued to the customer.' },
  { name: 'machine_id', type: 'string', required: true, description: 'Stable identifier of the machine running the app.' },
  { name: 'product', type: 'string', required: true, description: 'App identifier. Must equal the product the license was created for.' },
  { name: 'version', type: 'string', description: 'App version. Accepted but not stored.' },
  { name: 'hostname', type: 'string', description: 'Machine hostname, shown in the license details.' },
  { name: 'os_info', type: 'string', description: 'Operating system description, shown in the license details.' },
  { name: 'nonce', type: 'string', description: 'Client-generated random hex. Echoed back in the response to prevent replays.' },
]

const validateExample = {
  license_key: license.license_key,
  machine_id: 'a3f1c9d27b6e4058',
  product: license.product,
  version: '1.4.0',
  hostname: 'edge-box-01',
  os_info: 'Ubuntu 24.04',
  nonce: '5b8e1f0c2a9d4e73',
}

const licenseIdParam: DocField[] = [
  { name: 'license_id', type: 'string (uuid)', required: true, description: 'The license id (not the license key).' },
]

const unauthorized: DocResponse = {
  status: 401,
  description: 'Missing, invalid or expired token.',
  example: { detail: 'Authentication required' },
}

const licenseNotFound: DocResponse = {
  status: 404,
  description: 'No license with that id.',
  example: { detail: 'License not found.' },
}

const validationError: DocResponse = {
  status: 422,
  description: 'The request body or query failed validation.',
  example: { detail: 'Invalid request' },
}

const tokenResult = { access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…', token_type: 'bearer', email: 'admin@ryasai.com' }

export const apiDocs: DocGroup[] = [
  {
    name: 'License',
    description: 'Public endpoints called by client apps to validate a license and release a machine slot.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/license/validate',
        summary: 'Validate a license key',
        description:
          'Checks that the license exists, is active, belongs to the given product, has not expired and has a free machine slot. ' +
          'A machine seen for the first time is registered against the license; a known machine_id (or a new machine_id from an IP already registered on the license) reuses its slot. ' +
          'A rejected license still returns 200 — read the valid field. ' +
          'When LICENSE_SIGNING_PRIVATE_KEY is set, signature is the hex Ed25519 signature of the response without the signature field, serialized as JSON with sorted keys, no whitespace and non-ASCII escaped. Without the key the field is omitted.',
        rateLimit: '10 requests / minute per IP',
        body: validateBody,
        bodyExample: validateExample,
        responses: [
          {
            status: 200,
            description: 'License accepted.',
            example: {
              nonce: validateExample.nonce,
              valid: true,
              plan: 'pro',
              expires_at: license.expires_at,
              message: 'License valid.',
              signature: '8c1f…e40a',
            },
          },
          {
            status: 200,
            description:
              'License rejected. message is one of: "License key not found.", "License has been deactivated.", "License not valid for this product.", "License has expired." (also returns expires_at), "Machine limit reached (N). Deactivate another machine first."',
            example: { nonce: validateExample.nonce, valid: false, message: 'License has been deactivated.', signature: '51d0…9b7c' },
          },
          validationError,
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/license/deactivate',
        summary: 'Deactivate a machine',
        description:
          'Frees the slot the machine holds on the license. Takes the same body as validate; only license_key and machine_id are used, but product is still required.',
        body: validateBody,
        bodyExample: { license_key: validateExample.license_key, machine_id: validateExample.machine_id, product: validateExample.product },
        responses: [
          { status: 200, description: 'Machine deactivated.', example: { success: true, message: 'Machine deactivated.' } },
          {
            status: 200,
            description: 'Nothing was deactivated. message is "License not found." or "Machine not found or already deactivated."',
            example: { success: false, message: 'Machine not found or already deactivated.' },
          },
          validationError,
        ],
      },
    ],
  },
  {
    name: 'Auth',
    description: 'Public endpoints for the first-time admin setup and for signing in.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/admin/auth/setup-status',
        summary: 'Check whether setup is needed',
        description: 'Setup is required until the first admin account has been created.',
        responses: [
          {
            status: 200,
            description: 'Current setup state.',
            example: { setup_required: false, message: 'System configured. Please login.' },
          },
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/admin/auth/setup',
        summary: 'Create the admin account',
        description: 'Only works while no admin exists. Signs the new admin in and returns a token.',
        body: [
          { name: 'email', type: 'string', required: true, description: 'Admin email, used to sign in.' },
          { name: 'password', type: 'string', required: true, description: 'At least 8 characters.' },
          { name: 'password_confirm', type: 'string', required: true, description: 'Must equal password.' },
        ],
        bodyExample: { email: 'admin@ryasai.com', password: 'a-strong-password', password_confirm: 'a-strong-password' },
        responses: [
          { status: 200, description: 'Admin created and signed in.', example: tokenResult },
          { status: 400, description: 'The two passwords differ.', example: { detail: 'Passwords do not match.' } },
          { status: 403, description: 'An admin already exists.', example: { detail: 'Setup already completed. Use /login instead.' } },
          validationError,
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/admin/auth/login',
        summary: 'Sign in',
        description: 'Returns a JWT (HS256) valid for JWT_EXPIRE_HOURS, 24 hours by default.',
        rateLimit: '5 requests / minute per IP',
        body: [
          { name: 'email', type: 'string', required: true, description: 'Admin email.' },
          { name: 'password', type: 'string', required: true, description: 'Admin password.' },
        ],
        bodyExample: { email: 'admin@ryasai.com', password: 'a-strong-password' },
        responses: [
          { status: 200, description: 'Signed in.', example: tokenResult },
          { status: 401, description: 'Wrong email or password.', example: { detail: 'Invalid email or password' } },
          { status: 428, description: 'No admin exists yet.', example: { detail: 'Initial setup required. Use /setup endpoint first.' } },
          validationError,
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/admin/auth/verify',
        summary: 'Verify a token',
        description: 'The token is passed as a query parameter, not in the body.',
        query: [{ name: 'token', type: 'string', required: true, description: 'The JWT to check.' }],
        responses: [
          { status: 200, description: 'Token is valid.', example: { valid: true, email: 'admin@ryasai.com' } },
          { status: 200, description: 'Token is invalid or expired.', example: { valid: false, email: null } },
          validationError,
        ],
      },
    ],
  },
  {
    name: 'Admin',
    description: 'License management. Every endpoint requires the admin JWT in the Authorization header.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/admin/licenses',
        summary: 'Create a license',
        description:
          'Generates the key as PREFIX-XXXXXXXX-XXXXXXXX-XXXXXXXX, where PREFIX is the first 6 characters of the product in upper case with spaces removed.',
        auth: true,
        body: [
          { name: 'customer_name', type: 'string', required: true, description: 'Customer name.' },
          { name: 'customer_email', type: 'string', required: true, description: 'Customer contact email.' },
          { name: 'product', type: 'string', required: true, description: 'App identifier the license is for, e.g. ryasai-chatbot.' },
          { name: 'plan', type: 'string', description: 'starter, pro or enterprise. Defaults to starter.' },
          { name: 'max_machines', type: 'integer', description: 'Machines that may be active at once. Defaults to 1.' },
          { name: 'expires_at', type: 'string | null', description: 'ISO date or datetime (UTC unless it carries an offset). Omit or null for a lifetime license.' },
          { name: 'notes', type: 'string | null', description: 'Free-form internal notes.' },
        ],
        bodyExample: {
          customer_name: license.customer_name,
          customer_email: license.customer_email,
          product: license.product,
          plan: license.plan,
          max_machines: license.max_machines,
          expires_at: '2027-12-31',
          notes: 'Annual contract',
        },
        responses: [
          { status: 201, description: 'License created. expires_at is echoed back as sent.', example: { ...license, expires_at: '2027-12-31', active_machines: 0 } },
          { status: 400, description: 'expires_at could not be parsed.', example: { detail: 'Invalid expires_at. Use ISO format.' } },
          unauthorized,
          validationError,
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/admin/licenses',
        summary: 'List licenses',
        description: 'Newest first.',
        auth: true,
        query: [
          { name: 'page', type: 'number', description: 'Page number, starting at 1. Defaults to 1.' },
          { name: 'per_page', type: 'number', description: 'Licenses per page. Defaults to 50.' },
          { name: 'active_only', type: 'boolean', description: 'true to leave out revoked licenses.' },
        ],
        responses: [
          { status: 200, description: 'One page of licenses. total counts all matching licenses.', example: { total: 1, page: 1, data: [license] } },
          unauthorized,
          validationError,
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/admin/licenses/:license_id',
        summary: 'Get a license',
        description: 'Returns the license together with every machine that has activated it, including deactivated ones.',
        auth: true,
        pathParams: licenseIdParam,
        responses: [
          {
            status: 200,
            description: 'The license and its machines.',
            example: {
              ...license,
              machines: [
                {
                  id: 'b81e7c40-5a2f-4d19-9c63-0e4f7a1d2b85',
                  machine_id: validateExample.machine_id,
                  hostname: validateExample.hostname,
                  os_info: validateExample.os_info,
                  ip_address: '203.0.113.24',
                  first_seen: '2026-10-06T08:20:11.402000',
                  last_seen: '2026-10-06T09:02:47.915000',
                  is_active: true,
                },
              ],
            },
          },
          unauthorized,
          licenseNotFound,
        ],
      },
      {
        method: 'PATCH',
        path: '/api/v1/admin/licenses/:license_id',
        summary: 'Update a license',
        description: 'Only the fields you send are changed. A null value is ignored, so an expiry cannot be cleared here.',
        auth: true,
        pathParams: licenseIdParam,
        body: [
          { name: 'is_active', type: 'boolean', description: 'false revokes the license, true reactivates it.' },
          { name: 'plan', type: 'string', description: 'starter, pro or enterprise.' },
          { name: 'max_machines', type: 'integer', description: 'Machines that may be active at once.' },
          { name: 'expires_at', type: 'string', description: 'ISO date or datetime (UTC unless it carries an offset).' },
          { name: 'notes', type: 'string', description: 'Free-form internal notes.' },
        ],
        bodyExample: { plan: 'enterprise', max_machines: 10 },
        responses: [
          { status: 200, description: 'The updated license.', example: { ...license, plan: 'enterprise', max_machines: 10 } },
          { status: 400, description: 'expires_at could not be parsed.', example: { detail: 'Invalid expires_at. Use ISO format.' } },
          unauthorized,
          licenseNotFound,
          validationError,
        ],
      },
      {
        method: 'DELETE',
        path: '/api/v1/admin/licenses/:license_id',
        summary: 'Revoke a license',
        description: 'Deactivates the license; it is not deleted and can be reactivated with PATCH.',
        auth: true,
        pathParams: licenseIdParam,
        responses: [
          { status: 200, description: 'License revoked.', example: { revoked: true } },
          unauthorized,
          licenseNotFound,
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/admin/stats',
        summary: 'Get system statistics',
        description: 'total_validations_today counts from 00:00 UTC. total_machines counts active machines only.',
        auth: true,
        responses: [
          {
            status: 200,
            description: 'Current totals.',
            example: { total_licenses: 12, active_licenses: 10, total_validations_today: 184, total_machines: 27 },
          },
          unauthorized,
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/admin/validation-logs',
        summary: 'List validation logs',
        description: 'Newest first. result is one of valid, invalid, inactive, wrong_product, expired, machine_limit.',
        auth: true,
        query: [
          { name: 'limit', type: 'number', description: 'Entries to return. Defaults to 50.' },
          { name: 'offset', type: 'number', description: 'Entries to skip. Defaults to 0.' },
        ],
        responses: [
          {
            status: 200,
            description: 'Validation attempts. license_id is null when the key was not found.',
            example: [
              {
                id: 'e07a3d91-64bc-4f02-b5a8-91c2d7f3a640',
                license_id: license.id,
                license_key: license.license_key,
                machine_id: validateExample.machine_id,
                result: 'valid',
                ip_address: '203.0.113.24',
                timestamp: '2026-10-06T09:02:47.915000',
              },
            ],
          },
          unauthorized,
          validationError,
        ],
      },
    ],
  },
  {
    name: 'System',
    description: 'Service health.',
    endpoints: [
      {
        method: 'GET',
        path: '/health',
        summary: 'Health check',
        responses: [
          { status: 200, description: 'The service is up.', example: { status: 'healthy', service: 'license-manager', version: '2.0.0' } },
        ],
      },
    ],
  },
]
