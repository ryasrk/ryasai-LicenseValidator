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
  noTryIt?: string // why the request builder cannot send this one
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
  slug: 'acme-corp',
  max_machines: 3,
  status: 'active',
  is_active: true,
  is_expired: false,
  expires_at: '2027-12-31T16:59:59.999000',
  created_at: '2026-10-06T08:15:30.123000',
  updated_at: '2026-10-06T08:15:30.123000',
  notes: 'Annual contract',
}

const validateBody: DocField[] = [
  { name: 'license_key', type: 'string', required: true, description: 'The license key issued to the customer. At most 64 characters.' },
  { name: 'machine_id', type: 'string', required: true, description: 'Stable identifier of the machine running the app. At most 255 characters.' },
  { name: 'product', type: 'string', description: 'App identifier. Must equal the product of the license when it has one; a license without a product accepts any app.' },
  { name: 'version', type: 'string', description: 'App version. Recorded in the log.' },
  { name: 'hostname', type: 'string', description: 'Machine hostname, shown in the license details.' },
  { name: 'os_info', type: 'string', description: 'Operating system description, shown in the license details.' },
  { name: 'nonce', type: 'string', description: 'Client-generated random hex. Echoed back in the response to prevent replays.' },
]

const validateExample = {
  license_key: license.license_key,
  machine_id: 'acme-corp:edge-box-01',
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
  description: 'Missing, invalid or expired token, or the admin account is deactivated.',
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

const adminUser = { id: '0b6c8e5e-2f4a-4a53-9a7e-51d3f0c6a2b1', email: 'admin@ryasai.com', is_active: true, created_at: '2026-10-06T08:00:00' }

const licenseFields: DocField[] = [
  { name: 'customer_name', type: 'string', required: true, description: 'Customer name.' },
  { name: 'customer_email', type: 'string', required: true, description: 'Customer contact email.' },
  { name: 'plan', type: 'string', description: 'A plan code from /admin/meta: starter, pro, enterprise or flat. Defaults to starter.' },
  { name: 'product', type: 'string', description: 'App identifier, e.g. ryasai-chatbot. Only that app can validate with the license. Omit or leave empty for a license that works with any app. Also sets the key prefix.' },
  { name: 'slug', type: 'string | null', description: 'Organisation slug in the downstream app. Renewals can address the license by it.' },
  { name: 'max_machines', type: 'integer', description: 'Machines that may be active at once, at least 1. Defaults to 1.' },
  { name: 'expires_at', type: 'string | null', description: 'ISO date or datetime (UTC unless it carries an offset). A date alone is valid through the end of that day, UTC. Omit or null for a lifetime license.' },
  { name: 'notes', type: 'string | null', description: 'Free-form internal notes.' },
]

export const apiDocs: DocGroup[] = [
  {
    name: 'License',
    description: 'Endpoints called by other apps: client apps validate a license and release a machine slot, the chat app renews.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/license/validate',
        summary: 'Validate a license key',
        description:
          'Checks that the license exists, is not revoked, is for the calling product, has not expired and has a free machine slot. ' +
          'Each machine_id has one record per license. A new machine_id coming from the IP of an active machine takes over that machine\'s slot (a recreated container); the machine it replaced is refused while its replacement keeps checking in. ' +
          'An active machine not seen for MACHINE_STALE_DAYS (30 by default) gives its slot back. ' +
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
          'Frees the slot the machine holds on the license. Holding the license key is the authorization. Takes the same body as validate; only license_key and machine_id are used.',
        body: validateBody,
        bodyExample: { license_key: validateExample.license_key, machine_id: validateExample.machine_id },
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
      {
        method: 'POST',
        path: '/api/v1/license/renew',
        summary: 'Renew a license (signed)',
        description:
          'Called by another app, not a person — see RENEWAL_TRIGGER_FROM_CHAT.md. ' +
          'The request must carry X-Timestamp (unix seconds, within 5 minutes of now) and X-Signature: the hex HMAC-SHA256, keyed with SECRET_KEY, of "<timestamp>:POST:/api/v1/license/renew:<raw body>". ' +
          'Send exactly one of license_key or slug, and exactly one of extend_days or expires_at. ' +
          'extend_days is added to the current expiry, or to now if the license has already expired. ' +
          'A reference that was already applied changes nothing and returns the earlier result with renewed: false.',
        rateLimit: '30 requests / minute per IP',
        noTryIt: 'This request has to be signed with SECRET_KEY, which the browser does not have.',
        body: [
          { name: 'reference', type: 'string', required: true, description: 'Your unique id for this renewal, e.g. the payment id. At most 100 characters. Makes retries safe.' },
          { name: 'license_key', type: 'string', description: 'The license to renew, by key.' },
          { name: 'slug', type: 'string', description: 'The license to renew, by organisation slug. Exactly one active license must have it.' },
          { name: 'extend_days', type: 'integer', description: 'Days to add, 1 to 3660.' },
          { name: 'expires_at', type: 'string', description: 'New expiry as an ISO date or datetime, in the future. A date alone is the end of that day, UTC.' },
          { name: 'source', type: 'string', description: 'Who sent it, for the renewal history. At most 50 characters.' },
        ],
        bodyExample: { reference: 'pay_8f3a2c', slug: 'acme-corp', extend_days: 30, source: 'ryasai-chatbot' },
        responses: [
          {
            status: 200,
            description: 'Renewed (renewed: true), or this reference was applied before (renewed: false).',
            example: {
              renewed: true,
              reference: 'pay_8f3a2c',
              license_key: license.license_key,
              slug: 'acme-corp',
              plan: 'pro',
              previous_expires_at: '2026-10-31T16:59:59.999000',
              expires_at: '2026-11-30T16:59:59.999000',
            },
          },
          { status: 401, description: 'Signature missing, wrong or older than 5 minutes.', example: { detail: 'Invalid request signature' } },
          { status: 404, description: 'No license with that key, or no active license with that slug.', example: { detail: 'License not found.' } },
          {
            status: 409,
            description: 'The license cannot be renewed: it is revoked, it is a lifetime license, or several active licenses share the slug.',
            example: { detail: 'License is revoked and cannot be renewed.' },
          },
          { status: 422, description: 'The body is not valid; detail says which field.', example: { detail: 'Send exactly one of extend_days or expires_at' } },
          { status: 503, description: 'SECRET_KEY has not been set on the server.', example: { detail: 'Renewal is disabled until SECRET_KEY is set.' } },
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
        summary: 'Create the first admin account',
        description: 'Only works while no admin exists, and only for the email configured as ADMIN_EMAIL. Signs the new admin in and returns a token.',
        body: [
          { name: 'email', type: 'string', required: true, description: 'Must equal ADMIN_EMAIL (case does not matter).' },
          { name: 'password', type: 'string', required: true, description: 'At least 8 characters.' },
          { name: 'password_confirm', type: 'string', required: true, description: 'Must equal password.' },
        ],
        bodyExample: { email: 'admin@ryasai.com', password: 'a-strong-password', password_confirm: 'a-strong-password' },
        responses: [
          { status: 200, description: 'Admin created and signed in.', example: tokenResult },
          { status: 400, description: 'The two passwords differ.', example: { detail: 'Passwords do not match.' } },
          {
            status: 403,
            description: 'An admin already exists, or the email is not ADMIN_EMAIL.',
            example: { detail: 'Setup already completed. Use /login instead.' },
          },
          validationError,
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/admin/auth/login',
        summary: 'Sign in',
        description: 'Returns a JWT (HS256) valid for JWT_EXPIRE_HOURS, 24 hours by default. It stops working earlier if the admin is deactivated or their password changes.',
        rateLimit: '5 requests / minute per IP',
        body: [
          { name: 'email', type: 'string', required: true, description: 'Admin email (case does not matter).' },
          { name: 'password', type: 'string', required: true, description: 'Admin password.' },
        ],
        bodyExample: { email: 'admin@ryasai.com', password: 'a-strong-password' },
        responses: [
          { status: 200, description: 'Signed in.', example: tokenResult },
          { status: 401, description: 'Wrong email or password, or the account is deactivated.', example: { detail: 'Invalid email or password' } },
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
          { status: 200, description: 'Token is invalid, expired or belongs to a deactivated admin.', example: { valid: false, email: null } },
          validationError,
        ],
      },
    ],
  },
  {
    name: 'Licenses',
    description: 'License management. Every endpoint requires the admin JWT in the Authorization header.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/admin/meta',
        summary: 'Get master data',
        description: 'The codes a plan, a license status, a machine status and a validation result can take, from the master tables.',
        auth: true,
        responses: [
          {
            status: 200,
            description: 'Master rows, in display order.',
            example: {
              plans: [{ code: 'starter', name: 'Starter', description: 'Entry plan' }],
              license_statuses: [{ code: 'active', name: 'Active', description: 'Validates until it expires', allows_validation: true }],
              machine_statuses: [{ code: 'active', name: 'Active', description: 'Holds a machine slot', occupies_slot: true }],
              validation_results: [{ code: 'valid', name: 'Valid', description: 'License accepted', is_success: true }],
            },
          },
          unauthorized,
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/admin/licenses',
        summary: 'Create a license',
        description:
          'Generates the key as PREFIX-XXXXXXXX-XXXXXXXX-XXXXXXXX, where PREFIX is the first 6 characters of the product in upper case with spaces removed, or RYASAI when no product is given.',
        auth: true,
        body: licenseFields,
        bodyExample: {
          customer_name: license.customer_name,
          customer_email: license.customer_email,
          product: license.product,
          slug: license.slug,
          plan: license.plan,
          max_machines: license.max_machines,
          expires_at: '2027-12-31',
          notes: license.notes,
        },
        responses: [
          { status: 201, description: 'License created.', example: { ...license, expires_at: '2027-12-31T23:59:59.999000', active_machines: 0 } },
          { status: 400, description: 'expires_at could not be parsed, or the plan is not in the master.', example: { detail: 'Invalid expires_at. Use ISO format.' } },
          unauthorized,
          validationError,
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/admin/licenses',
        summary: 'List licenses',
        description: 'Newest first. Each license carries active_machines, the slots in use.',
        auth: true,
        query: [
          { name: 'page', type: 'number', description: 'Page number, starting at 1. Defaults to 1.' },
          { name: 'per_page', type: 'number', description: 'Licenses per page, 1 to 200. Defaults to 50.' },
          { name: 'state', type: 'string', description: 'active (usable now), expired (not revoked but past its expiry), revoked, or not_revoked.' },
          { name: 'active_only', type: 'boolean', description: 'Older name for state=not_revoked.' },
          { name: 'plan', type: 'string', description: 'Only this plan code.' },
          { name: 'slug', type: 'string', description: 'Only licenses with exactly this slug.' },
          { name: 'search', type: 'string', description: 'Only licenses whose customer name, email, key or slug contains this text.' },
        ],
        responses: [
          { status: 200, description: 'One page of licenses. total counts all matching licenses.', example: { total: 1, page: 1, data: [{ ...license, active_machines: 1 }] } },
          unauthorized,
          validationError,
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/admin/licenses/:license_id',
        summary: 'Get a license',
        description: 'Returns the license with every machine that has activated it (one record per machine id, with its status) and its renewal history.',
        auth: true,
        pathParams: licenseIdParam,
        responses: [
          {
            status: 200,
            description: 'The license, its machines and its renewals.',
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
                  status: 'active',
                  is_active: true,
                },
              ],
              renewals: [
                {
                  id: '7d1b0c9a-3e52-4f8b-a6c4-2f90e1d5b377',
                  reference: 'pay_8f3a2c',
                  source: 'ryasai-chatbot',
                  extend_days: 30,
                  previous_expires_at: '2027-12-01T16:59:59.999000',
                  expires_at: license.expires_at,
                  created_at: '2026-10-06T09:30:00.120000',
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
        description: 'Only the fields you send are changed. Sending null for expires_at makes the license lifetime; null for slug or notes empties them.',
        auth: true,
        pathParams: licenseIdParam,
        body: [
          ...licenseFields.map((field) => ({ ...field, required: false })),
          { name: 'is_active', type: 'boolean', description: 'false revokes the license, true reactivates it.' },
          { name: 'status', type: 'string', description: 'A license status code from /admin/meta: active or revoked.' },
        ],
        bodyExample: { plan: 'enterprise', max_machines: 10 },
        responses: [
          { status: 200, description: 'The updated license.', example: { ...license, plan: 'enterprise', max_machines: 10 } },
          { status: 400, description: 'expires_at could not be parsed, or the plan or status is not in the master.', example: { detail: 'Invalid expires_at. Use ISO format.' } },
          unauthorized,
          licenseNotFound,
          validationError,
        ],
      },
      {
        method: 'DELETE',
        path: '/api/v1/admin/licenses/:license_id',
        summary: 'Revoke or delete a license',
        description:
          'Without parameters the license is revoked; it stays in the list and can be reactivated with PATCH. With permanent=true it is deleted for good, together with its machines and renewals; its validation logs are kept.',
        auth: true,
        pathParams: licenseIdParam,
        query: [{ name: 'permanent', type: 'boolean', description: 'true to delete the license instead of revoking it. Cannot be undone.' }],
        responses: [
          { status: 200, description: 'License revoked (deleted: false) or deleted (deleted: true).', example: { revoked: true, deleted: false } },
          unauthorized,
          licenseNotFound,
        ],
      },
      {
        method: 'DELETE',
        path: '/api/v1/admin/licenses/:license_id/machines/:machine_id',
        summary: 'Remove a machine',
        description: 'Frees the slot an active machine holds. The machine takes a slot again if it checks in and one is free.',
        auth: true,
        pathParams: [
          ...licenseIdParam,
          { name: 'machine_id', type: 'string (uuid)', required: true, description: 'The id of the machine record from the license details (not the client\'s machine_id).' },
        ],
        responses: [
          { status: 200, description: 'Machine deactivated.', example: { deactivated: true } },
          unauthorized,
          { status: 404, description: 'No active machine with that id on this license.', example: { detail: 'Active machine not found on this license.' } },
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/admin/stats',
        summary: 'Get system statistics',
        description: 'total_validations_today counts from 00:00 UTC. active_licenses counts licenses that are not revoked. total_machines counts machines holding a slot on such a license.',
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
        description: 'Newest first. All filters combine. Logs older than LOG_RETENTION_DAYS are deleted when that setting is above 0.',
        auth: true,
        query: [
          { name: 'limit', type: 'number', description: 'Entries to return, 1 to 500. Defaults to 50.' },
          { name: 'offset', type: 'number', description: 'Entries to skip. Defaults to 0.' },
          { name: 'search', type: 'string', description: 'Only entries whose license key, machine id or IP address contains this text.' },
          { name: 'result', type: 'string', description: 'Only this result code: valid, invalid, inactive, expired, machine_limit or wrong_product.' },
          { name: 'from', type: 'string', description: 'Only entries at or after this ISO date or datetime. A date alone is the start of that day, UTC.' },
          { name: 'to', type: 'string', description: 'Only entries at or before this ISO date or datetime. A date alone is the end of that day, UTC.' },
          { name: 'license_id', type: 'string', description: 'Only entries of this license.' },
        ],
        responses: [
          {
            status: 200,
            description: 'One page of validation attempts. total counts all matching entries. license_id is null when the key was not found or the license was deleted.',
            example: {
              total: 1,
              limit: 50,
              offset: 0,
              data: [
                {
                  id: 'e07a3d91-64bc-4f02-b5a8-91c2d7f3a640',
                  license_id: license.id,
                  license_key: license.license_key,
                  machine_id: validateExample.machine_id,
                  result: 'valid',
                  ip_address: '203.0.113.24',
                  timestamp: '2026-10-06T09:02:47.915000',
                  metadata: { product: 'ryasai-chatbot', version: '1.4.0', hostname: 'edge-box-01', os_info: 'Ubuntu 24.04' },
                },
              ],
            },
          },
          { status: 400, description: 'from or to could not be parsed.', example: { detail: 'Invalid from. Use ISO format.' } },
          unauthorized,
          validationError,
        ],
      },
    ],
  },
  {
    name: 'Admins',
    description: 'The accounts that can sign in. Every endpoint requires the admin JWT.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/admin/me',
        summary: 'Get the signed-in admin',
        auth: true,
        responses: [{ status: 200, description: 'Your account.', example: adminUser }, unauthorized],
      },
      {
        method: 'POST',
        path: '/api/v1/admin/me/password',
        summary: 'Change your password',
        description: 'Every token issued before, including the one used for this request, stops working. Sign in again with the new password.',
        auth: true,
        body: [
          { name: 'current_password', type: 'string', required: true, description: 'Your current password.' },
          { name: 'new_password', type: 'string', required: true, description: 'At least 8 characters.' },
        ],
        bodyExample: { current_password: 'a-strong-password', new_password: 'an-even-stronger-one' },
        responses: [
          { status: 200, description: 'Password changed.', example: { changed: true } },
          { status: 400, description: 'The current password is wrong.', example: { detail: 'Current password is incorrect.' } },
          unauthorized,
          validationError,
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/admin/users',
        summary: 'List admins',
        auth: true,
        responses: [{ status: 200, description: 'All admin accounts, oldest first.', example: [adminUser] }, unauthorized],
      },
      {
        method: 'POST',
        path: '/api/v1/admin/users',
        summary: 'Add an admin',
        auth: true,
        body: [
          { name: 'email', type: 'string', required: true, description: 'Email the new admin signs in with.' },
          { name: 'password', type: 'string', required: true, description: 'At least 8 characters.' },
        ],
        bodyExample: { email: 'second@ryasai.com', password: 'a-strong-password' },
        responses: [
          { status: 201, description: 'Admin created.', example: { ...adminUser, email: 'second@ryasai.com' } },
          { status: 400, description: 'Not a valid email address.', example: { detail: 'Enter a valid email address.' } },
          { status: 409, description: 'That email is already an admin.', example: { detail: 'An admin with this email already exists.' } },
          unauthorized,
          validationError,
        ],
      },
      {
        method: 'PATCH',
        path: '/api/v1/admin/users/:user_id',
        summary: 'Deactivate an admin or set their password',
        description: 'Either change signs that admin out everywhere. You cannot deactivate yourself, and one admin must stay active.',
        auth: true,
        pathParams: [{ name: 'user_id', type: 'string (uuid)', required: true, description: 'The admin id from the list.' }],
        body: [
          { name: 'is_active', type: 'boolean', description: 'false deactivates the account, true reactivates it.' },
          { name: 'password', type: 'string', description: 'New password, at least 8 characters.' },
        ],
        bodyExample: { is_active: false },
        responses: [
          { status: 200, description: 'The updated admin.', example: { ...adminUser, email: 'second@ryasai.com', is_active: false } },
          { status: 400, description: 'It is your own account, or the last active admin.', example: { detail: 'You cannot deactivate your own account.' } },
          unauthorized,
          { status: 404, description: 'No admin with that id.', example: { detail: 'Admin not found.' } },
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
