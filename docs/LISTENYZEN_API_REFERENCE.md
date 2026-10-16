# Listenyzen API endpoint reference

Source-derived examples for all 111 mounted API operations and two health endpoints. Inspected on 2026-10-15. These are illustrative examples, not captured live responses. IDs must be replaced with records visible to your account. Provider codes, tokens, URLs, and signatures are placeholders.

Entity objects are compact projections: audit fields, virtuals and optional fields are omitted for readability. Envelopes, status codes and special response types follow the implementation. Optional fields, populated references and lean reads can change the returned entity fields. Read the linked source location for the complete handler.

## Before using the examples

Set `BASE_URL` to the backend origin (no `/api/v1` suffix). Log in first; curl stores and reuses cookies with `-b cookies.txt -c cookies.txt`. Browser clients use credentials. Login and refresh set HttpOnly cookies and do not return JWTs in JSON. Authenticated routes also accept an existing Bearer access token. Never commit cookies or provider credentials.

```sh
export BASE_URL='http://localhost:5000'
```

Use the port configured for your backend; 5000 above is only an example. The documentation site is a separate application.

## Shared behavior

- Mongo parameters are ObjectId strings; provider page, phone and template IDs are separate identities.
- JSON request schemas generally reject extra fields. Multipart booleans remain strings unless a handler explicitly parses them.
- Offset lists accept page/limit. Inbox cursor lists reject page and custom sort; reuse nextCursor without decoding it. Settings history uses a numeric version cursor.
- Brand visibility and tenant scope may produce 404 for a record that exists elsewhere. Company suspension, role restrictions and assignment policy are separate gates.
- Date ranges use inclusive Asia/Dhaka days. Supply both from and to, or neither; overview defaults to the last 30 days and caps ranges at one year.
- Standard errors use `{ "success": false, "status": "error", "message": "Brand not found" }`. Validation can include errors; nonproduction may include comingFrom. Login credential failures can return only `{ "message": "..." }`; auth rate limiting uses `{ "success": false, "message": "Too many attempts, please try again later." }` with 429.
- Shared failures include 400 invalid input, 401 missing/expired authentication, 403 denied action and 404 missing/invisible record. Provider/network failures can become server errors. Per-route errors below are handler-local examples, not an exhaustive list of service failures.
- No example is executed by this documentation. Mutating curl commands perform real writes if you run them.

## POST /api/v1/auth/register-company

**Source:** `server/src/auth/api.ts:46`

**Access:** No JWT middleware on this route.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/auth/register-company" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"companyName":"Example Company","name":"Amina Rahman","email":"amina@example.com","password":"ExamplePassword1!"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Company registered successfully",
  "data": {
    "user": {
      "_id": "670000000000000000000002",
      "name": "Amina Rahman",
      "email": "amina@example.com",
      "role": "company_owner",
      "companyId": "670000000000000000000001"
    }
  }
}
```

- Read the route-specific authentication requirement below.
- Sets access_token and refresh_token HttpOnly cookies. Tokens are not returned in JSON.

### Validation declarations

Body · `registerCompanySchema` · `server/src/auth/validation.ts`

```typescript
const registerCompanySchema = z.strictObject({
  companyName: z.string().min(1, 'Company name is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email format').min(1, 'Email is required'),
  password: passwordPolicy,
});
```


## POST /api/v1/auth/login

**Source:** `server/src/auth/api.ts:73`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension).

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/auth/login" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"email":"amina@example.com","password":"ExamplePassword1!"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "User logged in successfully",
  "data": {
    "user": {
      "_id": "670000000000000000000002",
      "name": "Amina Rahman",
      "email": "amina@example.com",
      "role": "company_admin",
      "companyId": "670000000000000000000001"
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Sets access_token and refresh_token HttpOnly cookies. Tokens are not returned in JSON.

### Validation declarations

Body · `loginSchema` · `server/src/auth/validation.ts`

```typescript
const loginSchema = z.strictObject({
  email: z.email('Invalid email format').min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});
```


## POST /api/v1/auth/logout

**Source:** `server/src/auth/api.ts:106`

**Access:** No JWT middleware on this route.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/auth/logout" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "User logged out successfully",
  "data": {}
}
```

- Read the route-specific authentication requirement below.
- Refresh reads refresh_token from cookies; logout clears cookies and does not require a JWT.

## POST /api/v1/auth/refresh

**Source:** `server/src/auth/api.ts:116`

**Access:** No JWT middleware on this route.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/auth/refresh" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Tokens refreshed successfully",
  "data": {}
}
```

- Read the route-specific authentication requirement below.
- Refresh reads refresh_token from cookies; logout clears cookies and does not require a JWT.

Handler-local error examples:

- HTTP 400: Refresh token is required

## GET /api/v1/brands

**Source:** `server/src/modules/brand/api.ts:54`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands?limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000004",
      "name": "Example Brand",
      "email": "support@example.com",
      "companyId": "670000000000000000000001",
      "status": "active",
      "departmentIds": [],
      "queryManagerIds": []
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false,
    "startIndex": 1,
    "endIndex": 1
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Single-item final-page example. Offset pagination uses page and limit; this example requests the first page.

### Validation declarations

Query · `listBrandsSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const listBrandsSchema = listQuerySchema.extend({
  status: z.enum(BRAND_STATUS).optional(),
});
```


## POST /api/v1/brands

**Source:** `server/src/modules/brand/api.ts:69`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/brands" \
  -b cookies.txt -c cookies.txt \
  -F "name=Example Brand" \
  -F "email=support@example.com" \
  -F "logo=@./photo.png"
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Brand created successfully",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- File field: logo. Let curl/browser set the multipart boundary. Brand creation requires a logo.
- For a super_admin creating a tenant resource, also supply companyId where the schema permits it. Tenant callers use their own company; role assignment is additionally restricted.

Handler-local error examples:

- HTTP 400: companyId is required
- HTTP 400: Logo is required

### Validation declarations

Body · `createBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const createBrandSchema = z.strictObject({
  name: z.string().min(1, NAME_REQUIRED),
  email: z.email('Invalid email'),
  status: z.enum(BRAND_STATUS).optional(),
```


## GET /api/v1/brands/:id

**Source:** `server/src/modules/brand/api.ts:110`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

## GET /api/v1/brands/:id/departments

**Source:** `server/src/modules/brand/api.ts:127`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/departments" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000003",
      "name": "Customer Care",
      "companyId": "670000000000000000000001",
      "status": "active"
    }
  ]
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```


## PUT /api/v1/brands/:id/departments

**Source:** `server/src/modules/brand/api.ts:149`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X PUT "${BASE_URL}/api/v1/brands/670000000000000000000004/departments" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"departmentIds":["670000000000000000000003"]}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Departments assigned successfully",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [
      "670000000000000000000003"
    ],
    "queryManagerIds": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

Handler-local error examples:

- HTTP 400: One or more departments do not belong to this company

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

Body · `assignDepartmentsSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const assignDepartmentsSchema = z.strictObject({
  departmentIds: z.array(idSchema),
});
```


## GET /api/v1/brands/:id/query-managers

**Source:** `server/src/modules/brand/api.ts:186`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/query-managers?limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000002",
      "name": "Amina Rahman",
      "email": "amina@example.com",
      "role": "query_manager",
      "companyId": "670000000000000000000001"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false,
    "startIndex": 1,
    "endIndex": 1
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Single-item final-page example. Offset pagination uses page and limit; this example requests the first page.

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

Query · `listQueryManagersSchema` · `server/src/modules/query-manager/validation.ts`

```typescript
export const listQueryManagersSchema = listQuerySchema.extend({
  departmentId: idSchema.optional(),
});
```


## PUT /api/v1/brands/:id/query-managers

**Source:** `server/src/modules/brand/api.ts:208`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X PUT "${BASE_URL}/api/v1/brands/670000000000000000000004/query-managers" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"queryManagerIds":["670000000000000000000002"]}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Query managers assigned successfully",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": [
      "670000000000000000000002"
    ]
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

Handler-local error examples:

- HTTP 400: One or more query managers do not belong to this company

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

Body · `assignQueryManagersSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const assignQueryManagersSchema = z.strictObject({
  queryManagerIds: z.array(idSchema),
});
```


## PATCH /api/v1/brands/:id

**Source:** `server/src/modules/brand/api.ts:269`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/brands/670000000000000000000004" \
  -b cookies.txt -c cookies.txt \
  -F "name=Example Brand Updated" \
  -F "logo=@./photo.png"
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Brand updated successfully",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand Updated",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- File field: logo. Let curl/browser set the multipart boundary.

Handler-local error examples:

- HTTP 400: Invalid request body

### Validation declarations

Body · `updateBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const updateBrandSchema = z.strictObject({
  name: z.string().min(1, NAME_REQUIRED).optional(),
  email: z.email('Invalid email').optional(),
  status: z.enum(BRAND_STATUS).optional(),
});
```


## DELETE /api/v1/brands/:id

**Source:** `server/src/modules/brand/api.ts:324`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/brands/670000000000000000000004" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Brand deleted successfully",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```


## POST /api/v1/brands/:id/facebook/connect

**Source:** `server/src/modules/brand/meta-channels.ts:123`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/brands/670000000000000000000004/facebook/connect" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"pageId":"123456789","pageName":"Example Page","userAccessToken":"<META_USER_ACCESS_TOKEN>"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Facebook page connected successfully",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": [],
    "facebook": {
      "pageId": "123456789",
      "pageName": "Example Page",
      "connected": true
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- The success message can instead report a webhook subscription warning.

Handler-local error examples:

- HTTP 400: Facebook integration is not configured on the server
- HTTP 400: This Facebook page is already connected to another brand

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

Body · `connectFacebookSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const connectFacebookSchema = z.strictObject({
  pageId: z.string().min(1, 'pageId is required'),
  pageName: z.string().min(1, 'pageName is required'),
  userAccessToken: z.string().min(1, 'userAccessToken is required'),
});
```


## DELETE /api/v1/brands/:id/facebook

**Source:** `server/src/modules/brand/meta-channels.ts:203`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/brands/670000000000000000000004/facebook" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Facebook page disconnected",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```


## POST /api/v1/brands/:id/instagram/connect

**Source:** `server/src/modules/brand/meta-channels.ts:225`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/brands/670000000000000000000004/instagram/connect" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Instagram connected successfully",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": [],
    "instagram": {
      "accountId": "123456789",
      "username": "examplebrand",
      "connected": true
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Uses the already connected Facebook page; no JSON body is required.

Handler-local error examples:

- HTTP 400: Connect a Facebook page before connecting Instagram
- HTTP 400: No Instagram Business account is linked to this Facebook page

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```


## DELETE /api/v1/brands/:id/instagram

**Source:** `server/src/modules/brand/meta-channels.ts:292`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/brands/670000000000000000000004/instagram" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Instagram disconnected",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```


## GET /api/v1/brands/:id/instagram/login-url

**Source:** `server/src/modules/brand/meta-channels.ts:316`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/instagram/login-url" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Instagram login URL generated",
  "data": {
    "url": "https://www.instagram.com/oauth/authorize?client_id=EXAMPLE&state=SIGNED_STATE"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

Handler-local error examples:

- HTTP 400: Instagram Login is not configured on the server

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```


## GET /api/v1/brands/instagram/oauth/callback

**Source:** `server/src/modules/brand/meta-channels.ts:348`

**Access:** Signed state from the login-url flow; no JWT required.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/instagram/oauth/callback?code=AUTHORIZATION_CODE&state=SIGNED_STATE"
```

### Example response — HTTP 302

```text
Location: https://client.example.com/dashboard/brands?instagram=connected&brand=670000000000000000000004
```

- Read the route-specific authentication requirement below.
- Failure also redirects (instagram=error). Location uses configured CLIENT_URL. Do not expect the JSON envelope.

## GET /api/v1/brands/:id/tags

**Source:** `server/src/modules/brand/tags/api.ts:89`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/tags" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000009",
      "id": "670000000000000000000009",
      "name": "Support",
      "archived": false
    }
  ]
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `brandIdParamsSchema` · `server/src/modules/brand/tags/validation.ts`

```typescript
export const brandIdParamsSchema = z.object({
  id: idSchema,
});
```

Query · `listTagsSchema` · `server/src/modules/brand/tags/validation.ts`

```typescript
export const listTagsSchema = z.object({
  includeArchived: z.enum(['true', 'false']).optional(),
  search: z.string().trim().min(1).max(80).optional(),
});
```


## POST /api/v1/brands/:id/tags

**Source:** `server/src/modules/brand/tags/api.ts:114`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/brands/670000000000000000000004/tags" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"Support"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Tag added successfully",
  "data": {
    "created": {
      "_id": "670000000000000000000009",
      "name": "Support",
      "id": "670000000000000000000009",
      "archived": false
    },
    "tags": [
      {
        "_id": "670000000000000000000009",
        "name": "Support",
        "id": "670000000000000000000009",
        "archived": false
      }
    ]
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `brandIdParamsSchema` · `server/src/modules/brand/tags/validation.ts`

```typescript
export const brandIdParamsSchema = z.object({
  id: idSchema,
});
```

Body · `createTagSchema` · `server/src/modules/brand/tags/validation.ts`

```typescript
export const createTagSchema = z.strictObject({
  name: z.string().trim().min(1, 'Tag name is required').max(80, 'Tag name is too long'),
});
```


## PATCH /api/v1/brands/:id/tags/:tagId

**Source:** `server/src/modules/brand/tags/api.ts:141`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/brands/670000000000000000000004/tags/670000000000000000000009" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"Customer Support"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Tag renamed",
  "data": [
    {
      "_id": "670000000000000000000009",
      "name": "Customer Support",
      "id": "670000000000000000000009",
      "archived": false
    }
  ]
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `tagParamsSchema` · `server/src/modules/brand/tags/validation.ts`

```typescript
export const tagParamsSchema = z.object({
  id: idSchema,
  tagId: idSchema,
});
```

Body · `renameTagSchema` · `server/src/modules/brand/tags/validation.ts`

```typescript
export const renameTagSchema = createTagSchema;
```


## PATCH /api/v1/brands/:id/tags/:tagId/archive

**Source:** `server/src/modules/brand/tags/api.ts:166`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/brands/670000000000000000000004/tags/670000000000000000000009/archive" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"archived":true}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Tag archived",
  "data": [
    {
      "_id": "670000000000000000000009",
      "name": "Support",
      "id": "670000000000000000000009",
      "archived": true
    }
  ]
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `tagParamsSchema` · `server/src/modules/brand/tags/validation.ts`

```typescript
export const tagParamsSchema = z.object({
  id: idSchema,
  tagId: idSchema,
});
```

Body · `archiveTagSchema` · `server/src/modules/brand/tags/validation.ts`

```typescript
export const archiveTagSchema = z.strictObject({
  archived: z.boolean(),
});
```


## GET /api/v1/brands/:id/whatsapp/templates

**Source:** `server/src/modules/brand/whatsapp-templates.ts:128`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/whatsapp/templates" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Templates fetched",
  "data": {
    "templates": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```


## POST /api/v1/brands/:id/whatsapp/templates

**Source:** `server/src/modules/brand/whatsapp-templates.ts:148`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/brands/670000000000000000000004/whatsapp/templates" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"order_update","language":"en_US","category":"UTILITY","parameterFormat":"POSITIONAL","bodyText":"Your order {{1}} has shipped.","examples":{"1":"ORD-100"},"buttons":[]}'
```

### Example response — HTTP 201

```json
{
  "success": true,
  "message": "Template submitted for approval",
  "data": {
    "id": "123456789",
    "status": "PENDING",
    "category": "UTILITY"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Meta can reclassify the category; response message reports that branch.

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

Body · `whatsAppTemplateDraftSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const whatsAppTemplateDraftSchema = z.strictObject({
  name: z
    .string()
    .min(1, NAME_REQUIRED)
    .max(WA_LIMITS.name)
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only'),
  language: z
    .string()
    .min(2, 'Language is required')
    .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, 'Use a code like en or en_US'),
  category: z.enum(WA_DRAFT_CATEGORIES),
  parameterFormat: z.enum(['POSITIONAL', 'NAMED']),
  headerText: z.string().max(WA_LIMITS.headerText).optional(),
  bodyText: z.string().min(1, 'Message body is required').max(WA_LIMITS.bodyText),
  footerText: z.string().max(WA_LIMITS.footerText).optional(),
  buttons: z.array(whatsAppButtonSchema).max(WA_BUTTON_LIMITS.total).default([]),
  examples: z.record(z.string(), z.string()).default({}),
});
```


## POST /api/v1/brands/:id/whatsapp/templates/:templateId

**Source:** `server/src/modules/brand/whatsapp-templates.ts:191`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/brands/670000000000000000000004/whatsapp/templates/123456789" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"order_update","language":"en_US","category":"UTILITY","parameterFormat":"POSITIONAL","bodyText":"Your order {{1}} has shipped.","examples":{"1":"ORD-100"},"buttons":[]}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Template updated and sent back to WhatsApp for review",
  "data": {
    "id": "123456789"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `whatsAppTemplateParamsSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const whatsAppTemplateParamsSchema = z.object({
  id: idSchema,
  templateId: z.string().regex(/^\d+$/, 'Invalid template id'),
});
```

Body · `whatsAppTemplateDraftSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const whatsAppTemplateDraftSchema = z.strictObject({
  name: z
    .string()
    .min(1, NAME_REQUIRED)
    .max(WA_LIMITS.name)
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only'),
  language: z
    .string()
    .min(2, 'Language is required')
    .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, 'Use a code like en or en_US'),
  category: z.enum(WA_DRAFT_CATEGORIES),
  parameterFormat: z.enum(['POSITIONAL', 'NAMED']),
  headerText: z.string().max(WA_LIMITS.headerText).optional(),
  bodyText: z.string().min(1, 'Message body is required').max(WA_LIMITS.bodyText),
  footerText: z.string().max(WA_LIMITS.footerText).optional(),
  buttons: z.array(whatsAppButtonSchema).max(WA_BUTTON_LIMITS.total).default([]),
  examples: z.record(z.string(), z.string()).default({}),
});
```


## DELETE /api/v1/brands/:id/whatsapp/templates/:templateId

**Source:** `server/src/modules/brand/whatsapp-templates.ts:238`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/brands/670000000000000000000004/whatsapp/templates/123456789" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Template deleted",
  "data": {
    "id": "123456789"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `whatsAppTemplateParamsSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const whatsAppTemplateParamsSchema = z.object({
  id: idSchema,
  templateId: z.string().regex(/^\d+$/, 'Invalid template id'),
});
```


## POST /api/v1/brands/:id/whatsapp/connect

**Source:** `server/src/modules/brand/whatsapp.ts:128`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/brands/670000000000000000000004/whatsapp/connect" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"code":"<EMBEDDED_SIGNUP_CODE>","wabaId":"123456789","phoneNumberId":"987654321"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "WhatsApp connected successfully",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": [],
    "whatsapp": {
      "wabaId": "123456789",
      "phoneNumberId": "987654321",
      "connected": true,
      "registered": true
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Example is the fully connected branch. Registration or subscription may remain pending with HTTP 200; inspect channel flags and message.

Handler-local error examples:

- HTTP 400: WhatsApp integration is not configured on the server

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

Body · `connectWhatsAppSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const connectWhatsAppSchema = z.strictObject({
  code: z.string().min(1, 'code is required'),
  wabaId: z.string().min(1, 'wabaId is required'),
  phoneNumberId: z.string().min(1, 'phoneNumberId is required'),
});
```


## POST /api/v1/brands/:id/whatsapp/connect-manual

**Source:** `server/src/modules/brand/whatsapp.ts:205`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/brands/670000000000000000000004/whatsapp/connect-manual" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"wabaId":"123456789","phoneNumberId":"987654321","accessToken":"<META_ACCESS_TOKEN>"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "WhatsApp connected (development bypass)",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": [],
    "whatsapp": {
      "wabaId": "123456789",
      "phoneNumberId": "987654321",
      "connected": true,
      "registered": true
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Example is the fully connected branch. Registration or subscription may remain pending with HTTP 200; inspect channel flags and message.

Handler-local error examples:

- HTTP 404: Not found

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

Body · `manualConnectWhatsAppSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const manualConnectWhatsAppSchema = z.strictObject({
  wabaId: z.string().min(1, 'wabaId is required'),
  phoneNumberId: z.string().min(1, 'phoneNumberId is required'),
  accessToken: z.string().min(1, 'accessToken is required'),
});
```


## POST /api/v1/brands/:id/whatsapp/register

**Source:** `server/src/modules/brand/whatsapp.ts:284`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/brands/670000000000000000000004/whatsapp/register" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "WhatsApp number registered and ready to send",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": [],
    "whatsapp": {
      "wabaId": "123456789",
      "phoneNumberId": "987654321",
      "connected": true,
      "registered": true
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Example is the fully connected branch. Registration or subscription may remain pending with HTTP 200; inspect channel flags and message.

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```


## DELETE /api/v1/brands/:id/whatsapp

**Source:** `server/src/modules/brand/whatsapp.ts:352`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/brands/670000000000000000000004/whatsapp" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "WhatsApp disconnected",
  "data": {
    "_id": "670000000000000000000004",
    "name": "Example Brand",
    "email": "support@example.com",
    "companyId": "670000000000000000000001",
    "status": "active",
    "departmentIds": [],
    "queryManagerIds": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `deleteBrandSchema` · `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```


## GET /api/v1/comments

**Source:** `server/src/modules/comment/api.ts:142`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/comments?brandId=670000000000000000000004&limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "id": "670000000000000000000008",
      "author": "Customer",
      "authorAvatarUrl": null,
      "isAgentReply": false,
      "text": "Can you help?",
      "at": "2026-10-15T09:00:00.000Z",
      "sentiment": "NEUTRAL",
      "topicTags": [],
      "tags": [],
      "assignee": null,
      "reactions": 0,
      "attachmentUrl": null,
      "attachmentType": null,
      "isHidden": false,
      "likedByPage": false,
      "status": "pending",
      "resolutionSummary": null,
      "replies": [],
      "post": {
        "id": "page_post_id",
        "platform": "facebook",
        "pageId": "123456789",
        "platformPostId": "page_post_id",
        "permalinkUrl": null,
        "publishedAt": "2026-10-15T09:00:00.000Z"
      }
    }
  ],
  "pagination": {
    "limit": 20,
    "hasNext": false
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Single-item final-page example. Continue with nextCursor when hasNext is true; the token is omitted on the final page.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.

Handler-local error examples:

- HTTP 404: Brand not found

### Validation declarations

Query · `listCommentsSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const listCommentsSchema = cursorPaginationQuerySchema.extend({
  brandId: idSchema,
  platform: z.enum(COMMENT_PLATFORMS).optional(),
  status: z.enum(COMMENT_STATUSES).optional(),
  sentiment: z.enum(COMMENT_SENTIMENTS).optional(),
  mine: z.enum(['true', 'false']).optional(),
  postId: z.string().trim().min(1).optional(),
```


## GET /api/v1/comments/posts

**Source:** `server/src/modules/comment/api.ts:185`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/comments/posts?brandId=670000000000000000000004&platform=facebook" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "posts": [],
    "after": null
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.

Handler-local error examples:

- HTTP 404: Brand not found

### Validation declarations

Query · `commentPostsSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const commentPostsSchema = z.object({
  brandId: idSchema,
  platform: z.enum(COMMENT_PLATFORMS),
  after: z.string().trim().min(1).optional(),
});
```


## GET /api/v1/comments/:id

**Source:** `server/src/modules/comment/api.ts:226`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/comments/670000000000000000000008" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "id": "670000000000000000000008",
    "author": "Customer",
    "authorAvatarUrl": null,
    "isAgentReply": false,
    "text": "Can you help?",
    "at": "2026-10-15T09:00:00.000Z",
    "sentiment": "NEUTRAL",
    "topicTags": [],
    "tags": [],
    "assignee": null,
    "reactions": 0,
    "attachmentUrl": null,
    "attachmentType": null,
    "isHidden": false,
    "likedByPage": false,
    "status": "pending",
    "resolutionSummary": null,
    "replies": [],
    "post": {
      "id": "page_post_id",
      "platform": "facebook",
      "pageId": "123456789",
      "platformPostId": "page_post_id",
      "permalinkUrl": null,
      "publishedAt": "2026-10-15T09:00:00.000Z"
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.

### Validation declarations

Params · `commentIdSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```


## POST /api/v1/comments/:id/replies

**Source:** `server/src/modules/comment/api.ts:248`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/comments/670000000000000000000008/replies" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"text":"Thank you for contacting us."}'
```

### Example response — HTTP 201

```json
{
  "success": true,
  "message": "Reply posted",
  "data": {
    "_id": "670000000000000000000008",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "commentId": "page_comment_id",
    "platformPostId": "page_post_id",
    "text": "Thank you for contacting us.",
    "status": "pending",
    "sentiment": "NEUTRAL",
    "tags": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.

Handler-local error examples:

- HTTP 400: This comment can no longer be replied to

### Validation declarations

Params · `commentIdSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

Body · `replyCommentSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const replyCommentSchema = z.strictObject({
  text: z.string().trim().min(1, 'Reply text is required').max(8000, 'Reply is too long'),
});
```


## PATCH /api/v1/comments/:id

**Source:** `server/src/modules/comment/api.ts:298`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/comments/670000000000000000000008" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"status":"resolved"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Comment updated",
  "data": {
    "_id": "670000000000000000000008",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "commentId": "page_comment_id",
    "platformPostId": "page_post_id",
    "text": "Thank you for contacting us.",
    "status": "resolved",
    "sentiment": "NEUTRAL",
    "tags": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.

### Validation declarations

Params · `commentIdSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

Body · `updateCommentSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const updateCommentSchema = z
  .strictObject({
    status: z.enum(COMMENT_STATUSES).optional(),
    sentiment: z.enum(COMMENT_SENTIMENTS).optional(),
  })
  .refine(v => v.status !== undefined || v.sentiment !== undefined, {
    message: 'Provide a status or sentiment to update',
  });
```


## PUT /api/v1/comments/:id/tags

**Source:** `server/src/modules/comment/api.ts:327`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X PUT "${BASE_URL}/api/v1/comments/670000000000000000000008/tags" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"tagIds":[]}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Comment tags updated",
  "data": {
    "_id": "670000000000000000000008",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "commentId": "page_comment_id",
    "platformPostId": "page_post_id",
    "text": "Thank you for contacting us.",
    "status": "pending",
    "sentiment": "NEUTRAL",
    "tags": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.

### Validation declarations

Params · `commentIdSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

Body · `setCommentTagsSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const setCommentTagsSchema = z.strictObject({
  tagIds: z
    .array(idSchema)
    .max(MAX_TAGS_PER_RECORD, `A record can carry at most ${MAX_TAGS_PER_RECORD} tags`),
});
```


## PATCH /api/v1/comments/:id/assignment

**Source:** `server/src/modules/comment/api.ts:353`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/comments/670000000000000000000008/assignment" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"assigneeType":"department","assigneeId":"670000000000000000000003"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Comment assigned",
  "data": {
    "_id": "670000000000000000000008",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "commentId": "page_comment_id",
    "platformPostId": "page_post_id",
    "text": "Thank you for contacting us.",
    "status": "pending",
    "sentiment": "NEUTRAL",
    "tags": [],
    "assignee": {
      "kind": "department",
      "id": "670000000000000000000003",
      "name": "Customer Care"
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment changes have a separate company-policy gate; assigned-only mode restricts agent reassignment.
- Use {"assigneeType":null} to clear; response message becomes Comment unassigned.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.

### Validation declarations

Params · `commentIdSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

Body · `assignCommentSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const assignCommentSchema = z
  .strictObject({
    assigneeType: z.enum(ASSIGNEE_TYPES).nullable(),
    assigneeId: idSchema.optional(),
  })
  .refine(v => v.assigneeType === null || v.assigneeId !== undefined, {
    message: 'assigneeId is required unless clearing the assignment (assigneeType: null)',
  });
```


## PATCH /api/v1/comments/:id/wrap-up

**Source:** `server/src/modules/comment/api.ts:402`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/comments/670000000000000000000008/wrap-up" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"status":"resolved","sentiment":"POSITIVE","resolutionSummary":"Issue resolved.","tagIds":[]}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Comment wrapped up",
  "data": {
    "_id": "670000000000000000000008",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "commentId": "page_comment_id",
    "platformPostId": "page_post_id",
    "text": "Thank you for contacting us.",
    "status": "resolved",
    "sentiment": "NEUTRAL",
    "tags": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.

### Validation declarations

Params · `commentIdSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

Body · `wrapUpCommentSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const wrapUpCommentSchema = z.strictObject({
  status: z.enum(['unresolved', 'resolved', 'hold']),
  sentiment: z.enum(COMMENT_SENTIMENTS),
  resolutionSummary: z.string().trim().max(8000, 'Resolution summary is too long').optional(),
```


## POST /api/v1/comments/:id/hide

**Source:** `server/src/modules/comment/api.ts:431`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/comments/670000000000000000000008/hide" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"hidden":true}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Comment hidden",
  "data": {
    "_id": "670000000000000000000008",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "commentId": "page_comment_id",
    "platformPostId": "page_post_id",
    "text": "Thank you for contacting us.",
    "status": "pending",
    "sentiment": "NEUTRAL",
    "tags": [],
    "isHidden": true
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.

Handler-local error examples:

- HTTP 400: This comment can no longer be moderated

### Validation declarations

Params · `commentIdSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

Body · `hideCommentSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const hideCommentSchema = z.strictObject({
  hidden: z.boolean(),
});
```


## POST /api/v1/comments/:id/like

**Source:** `server/src/modules/comment/api.ts:458`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/comments/670000000000000000000008/like" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"liked":true}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Comment liked",
  "data": {
    "_id": "670000000000000000000008",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "commentId": "page_comment_id",
    "platformPostId": "page_post_id",
    "text": "Thank you for contacting us.",
    "status": "pending",
    "sentiment": "NEUTRAL",
    "tags": [],
    "likedByPage": true
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.
- Like/unlike supports Facebook only.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.

Handler-local error examples:

- HTTP 400: This comment can no longer be liked
- HTTP 400: Liking comments is only supported on Facebook

### Validation declarations

Params · `commentIdSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

Body · `likeCommentSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const likeCommentSchema = z.strictObject({
  liked: z.boolean(),
});
```


## DELETE /api/v1/comments/:id

**Source:** `server/src/modules/comment/api.ts:485`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/comments/670000000000000000000008" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Comment deleted",
  "data": {}
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.

### Validation declarations

Params · `commentIdSchema` · `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```


## GET /api/v1/companies/me

**Source:** `server/src/modules/company/api.ts:93`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension).

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/companies/me" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000001",
    "name": "Example Company",
    "status": "active",
    "ownerId": "670000000000000000000002"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

## GET /api/v1/companies/me/settings

**Source:** `server/src/modules/company/api.ts:109`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension).

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/companies/me/settings" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "onlyAssignedCanAct": false
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

## PATCH /api/v1/companies/me/settings

**Source:** `server/src/modules/company/api.ts:128`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/companies/me/settings" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"onlyAssignedCanAct":true}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Settings updated successfully",
  "data": {
    "onlyAssignedCanAct": true
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Body · `updateCompanySettingsSchema` · `server/src/modules/company/validation.ts`

```typescript
export const updateCompanySettingsSchema = z.strictObject({
  onlyAssignedCanAct: z.boolean(),
});
```


## GET /api/v1/companies

**Source:** `server/src/modules/company/api.ts:156`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/companies?limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000001",
      "name": "Example Company",
      "status": "active",
      "ownerId": "670000000000000000000002"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false,
    "startIndex": 1,
    "endIndex": 1
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Single-item final-page example. Offset pagination uses page and limit; this example requests the first page.

### Validation declarations

Query · `listCompaniesSchema` · `server/src/modules/company/validation.ts`

```typescript
export const listCompaniesSchema = listQuerySchema.extend({
  status: z.enum(COMPANY_STATUS).optional(),
});
```


## POST /api/v1/companies

**Source:** `server/src/modules/company/api.ts:172`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/companies" \
  -b cookies.txt -c cookies.txt \
  -F "name=Example Company" \
  -F "ownerName=Amina Rahman" \
  -F "ownerEmail=amina@example.com" \
  -F "ownerPassword=ExamplePassword1!" \
  -F "logo=@./photo.png"
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Company created successfully",
  "data": {
    "_id": "670000000000000000000001",
    "name": "Example Company",
    "status": "active",
    "ownerId": "670000000000000000000002"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- File field: logo. Let curl/browser set the multipart boundary.
- For a super_admin creating a tenant resource, also supply companyId where the schema permits it. Tenant callers use their own company; role assignment is additionally restricted.

### Validation declarations

Body · `createCompanySchema` · `server/src/modules/company/validation.ts`

```typescript
export const createCompanySchema = z.strictObject({
  name: z.string().min(1, 'Name is required'),
  status: z.enum(COMPANY_STATUS).optional(),
  ownerName: z.string().min(1, 'Owner name is required'),
  ownerEmail: z.email('Invalid email format'),
  ownerPassword: z.string().min(8, 'Password must be at least 8 characters'),
});
```


## GET /api/v1/companies/:id

**Source:** `server/src/modules/company/api.ts:204`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/companies/670000000000000000000001" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000001",
    "name": "Example Company",
    "status": "active",
    "ownerId": "670000000000000000000002"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

## PATCH /api/v1/companies/:id

**Source:** `server/src/modules/company/api.ts:223`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/companies/670000000000000000000001" \
  -b cookies.txt -c cookies.txt \
  -F "name=Example Company Updated" \
  -F "logo=@./photo.png"
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Company updated successfully",
  "data": {
    "_id": "670000000000000000000001",
    "name": "Example Company Updated",
    "status": "active",
    "ownerId": "670000000000000000000002"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- File field: logo. Let curl/browser set the multipart boundary.

Handler-local error examples:

- HTTP 400: Invalid request body

### Validation declarations

Body · `updateCompanySchema` · `server/src/modules/company/validation.ts`

```typescript
export const updateCompanySchema = z.strictObject({
  name: z.string().min(1, 'Name is required').optional(),
  status: z.enum(COMPANY_STATUS).optional(),
  ownerName: z.string().min(1, 'Owner name is required').optional(),
  ownerEmail: z.email('Invalid email format').optional(),
  ownerPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
});
```


## DELETE /api/v1/companies/:id

**Source:** `server/src/modules/company/api.ts:260`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/companies/670000000000000000000001" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Company deleted successfully",
  "data": {
    "_id": "670000000000000000000001",
    "name": "Example Company",
    "status": "active",
    "ownerId": "670000000000000000000002"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `deleteCompanySchema` · `server/src/modules/company/validation.ts`

```typescript
export const deleteCompanySchema = z.object({
  id: idSchema,
});
```


## GET /api/v1/conversations

**Source:** `server/src/modules/conversation/api.ts:328`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/conversations?brandId=670000000000000000000004&limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000005",
      "brandId": "670000000000000000000004",
      "companyId": "670000000000000000000001",
      "platform": "facebook",
      "pageId": "123456789",
      "participantId": "customer-platform-id",
      "participantName": "Customer",
      "lastMessageText": "Hello",
      "lastMessageAt": "2026-10-15T09:00:00.000Z",
      "lastMessageDirection": "incoming",
      "unreadCount": 1,
      "status": "pending",
      "sentiment": "NEUTRAL"
    }
  ],
  "pagination": {
    "limit": 20,
    "hasNext": false
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Single-item final-page example. Continue with nextCursor when hasNext is true; the token is omitted on the final page.

Handler-local error examples:

- HTTP 404: Brand not found

### Validation declarations

Query · `listConversationsSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const listConversationsSchema = cursorListQuerySchema.extend({
  brandId: idSchema,
  platform: z.enum(CHANNEL_PLATFORMS).optional(),
  status: z.enum(SESSION_STATUSES).optional(),
  sentiment: z.enum(SESSION_SENTIMENTS).optional(),
  mine: z.enum(['true', 'false']).optional(),
  tagIds: z
    .string()
    .trim()
    .optional()
    .transform(v => (v ? v.split(',').filter(Boolean) : undefined))
    .pipe(z.array(idSchema).max(MAX_TAGS_PER_RECORD).optional()),
});
```


## GET /api/v1/conversations/:id/messages

**Source:** `server/src/modules/conversation/api.ts:362`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/conversations/670000000000000000000005/messages" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000007",
      "conversationId": "670000000000000000000005",
      "sessionId": "670000000000000000000006",
      "mid": "provider-message-id",
      "direction": "outgoing",
      "text": "How can we help?",
      "sentAt": "2026-10-15T09:00:00.000Z"
    }
  ]
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `conversationIdSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```


## GET /api/v1/conversations/:id/sessions

**Source:** `server/src/modules/conversation/api.ts:385`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/conversations/670000000000000000000005/sessions?limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "session": {
        "_id": "670000000000000000000006",
        "conversationId": "670000000000000000000005",
        "brandId": "670000000000000000000004",
        "companyId": "670000000000000000000001",
        "platform": "facebook",
        "status": "pending",
        "sentiment": "NEUTRAL",
        "sequence": 1,
        "startedAt": "2026-10-15T09:00:00.000Z",
        "lastActivityAt": "2026-10-15T09:00:00.000Z",
        "tags": [],
        "messageCount": 1
      },
      "messages": [
        {
          "_id": "670000000000000000000007",
          "conversationId": "670000000000000000000005",
          "sessionId": "670000000000000000000006",
          "mid": "provider-message-id",
          "direction": "outgoing",
          "text": "How can we help?",
          "sentAt": "2026-10-15T09:00:00.000Z"
        }
      ],
      "notes": []
    }
  ],
  "pagination": {
    "limit": 20,
    "hasNext": false
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Single-item final-page example. Continue with nextCursor when hasNext is true; the token is omitted on the final page.
- Nonempty data items are {session, messages, notes} groups, not bare sessions.

### Validation declarations

Params · `conversationIdSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

Query · `conversationSessionsQuerySchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const conversationSessionsQuerySchema = cursorPaginationQuerySchema;
```


## GET /api/v1/conversations/:id/stats

**Source:** `server/src/modules/conversation/api.ts:409`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/conversations/670000000000000000000005/stats" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "totalSessions": 1,
    "firstSessionAt": "2026-10-15T09:00:00.000Z"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `conversationIdSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```


## GET /api/v1/conversations/:id/customer

**Source:** `server/src/modules/conversation/api.ts:431`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/conversations/670000000000000000000005/customer" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "mobile": "+8801700000000",
    "email": "customer@example.com"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- data can be null when no CRM customer record exists yet.

### Validation declarations

Params · `conversationIdSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```


## PATCH /api/v1/conversations/:id/customer

**Source:** `server/src/modules/conversation/api.ts:454`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/conversations/670000000000000000000005/customer" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"mobile":"+8801700000000","email":"customer@example.com"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Customer updated",
  "data": {
    "mobile": "+8801700000000",
    "email": "customer@example.com"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.

Handler-local error examples:

- HTTP 400: No customer fields to update

### Validation declarations

Params · `conversationIdSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

Body · `updateCustomerSchema` · `server/src/modules/customer/validation.ts`

```typescript
export const updateCustomerSchema = z.strictObject({
  mobile: z.string().trim().max(32, 'Mobile number is too long').optional(),
  email: z.union([z.literal(''), z.email('Invalid email format')]).optional(),
  address: z.string().trim().max(500, 'Address is too long').optional(),
  gender: z.enum(CUSTOMER_GENDERS).optional(),
});
```


## POST /api/v1/conversations/:id/messages

**Source:** `server/src/modules/conversation/api.ts:482`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/conversations/670000000000000000000005/messages" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"text":"How can we help?"}'
```

### Example response — HTTP 201

```json
{
  "success": true,
  "message": "Reply sent",
  "data": {
    "_id": "670000000000000000000007",
    "conversationId": "670000000000000000000005",
    "sessionId": "670000000000000000000006",
    "mid": "provider-message-id",
    "direction": "outgoing",
    "text": "How can we help?",
    "sentAt": "2026-10-15T09:00:00.000Z"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.
- Calls the provider before local persistence; an error does not prove the provider did not accept the send. Inspect state before retrying.

### Validation declarations

Params · `conversationIdSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

Body · `sendMessageSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const sendMessageSchema = z.strictObject({
  text: z.string().trim().min(1, 'Message text is required').max(2000, 'Message is too long'),
});
```


## POST /api/v1/conversations/:id/attachments

**Source:** `server/src/modules/conversation/api.ts:520`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/conversations/670000000000000000000005/attachments" \
  -b cookies.txt -c cookies.txt \
  -F "text=See the attached image." \
  -F "files=@./photo.png"
```

### Example response — HTTP 201

```json
{
  "success": true,
  "message": "Attachment sent",
  "data": [
    {
      "_id": "670000000000000000000007",
      "conversationId": "670000000000000000000005",
      "sessionId": "670000000000000000000006",
      "mid": "provider-message-id",
      "direction": "outgoing",
      "text": "See the attached image.",
      "sentAt": "2026-10-15T09:00:00.000Z"
    },
    {
      "_id": "670000000000000000000020",
      "conversationId": "670000000000000000000005",
      "sessionId": "670000000000000000000006",
      "mid": "provider-attachment-id",
      "direction": "outgoing",
      "text": "",
      "sentAt": "2026-10-15T09:00:00.000Z",
      "attachments": [
        {
          "type": "image",
          "url": "https://media.example.com/photo.png",
          "storageKey": "photo.png",
          "name": "photo.png"
        }
      ]
    }
  ]
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.
- Calls the provider before local persistence; an error does not prove the provider did not accept the send. Inspect state before retrying.
- File field: files. Let curl/browser set the multipart boundary.

Handler-local error examples:

- HTTP 400: No files uploaded
- HTTP 400: Message is too long

### Validation declarations

Params · `conversationIdSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```


## POST /api/v1/conversations/:id/messages/:messageId/reaction

**Source:** `server/src/modules/conversation/api.ts:591`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/conversations/670000000000000000000005/messages/670000000000000000000007/reaction" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"emoji":"👍"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Reaction sent",
  "data": {
    "_id": "670000000000000000000007",
    "conversationId": "670000000000000000000005",
    "sessionId": "670000000000000000000006",
    "mid": "provider-message-id",
    "direction": "outgoing",
    "text": "How can we help?",
    "sentAt": "2026-10-15T09:00:00.000Z"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Provider support is channel-specific; messageId is the Mongo message ID, not the provider mid.

### Validation declarations

Params · `messageReactionParamsSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const messageReactionParamsSchema = z.object({
  id: idSchema,
  messageId: idSchema,
});
```

Body · `reactToMessageSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const reactToMessageSchema = z.strictObject({
  emoji: z.string().trim().min(1, 'An emoji is required').max(16, 'Not a valid emoji'),
});
```


## DELETE /api/v1/conversations/:id/messages/:messageId/reaction

**Source:** `server/src/modules/conversation/api.ts:605`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/conversations/670000000000000000000005/messages/670000000000000000000007/reaction" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Reaction removed",
  "data": {
    "_id": "670000000000000000000007",
    "conversationId": "670000000000000000000005",
    "sessionId": "670000000000000000000006",
    "mid": "provider-message-id",
    "direction": "outgoing",
    "text": "How can we help?",
    "sentAt": "2026-10-15T09:00:00.000Z"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Provider support is channel-specific; messageId is the Mongo message ID, not the provider mid.

### Validation declarations

Params · `messageReactionParamsSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const messageReactionParamsSchema = z.object({
  id: idSchema,
  messageId: idSchema,
});
```


## POST /api/v1/conversations/:id/messages/:messageId/media

**Source:** `server/src/modules/conversation/media.ts:131`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/conversations/670000000000000000000005/messages/670000000000000000000007/media" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Media fetched",
  "data": {
    "_id": "670000000000000000000007",
    "conversationId": "670000000000000000000005",
    "sessionId": "670000000000000000000006",
    "mid": "provider-message-id",
    "direction": "outgoing",
    "text": "How can we help?",
    "sentAt": "2026-10-15T09:00:00.000Z",
    "attachments": [
      {
        "type": "image",
        "url": "https://media.example.com/photo.png",
        "storageKey": "photo.png",
        "status": "ready"
      }
    ]
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- May return Media already available without fetching. Fetchable WhatsApp media IDs expire after seven days.

Handler-local error examples:

- HTTP 404: Message not found
- HTTP 400: This brand no longer has a connected WhatsApp number

### Validation declarations

Params · `messageReactionParamsSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const messageReactionParamsSchema = z.object({
  id: idSchema,
  messageId: idSchema,
});
```


## GET /api/v1/conversations/:id/whatsapp/templates

**Source:** `server/src/modules/conversation/whatsapp-templates.ts:214`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/conversations/670000000000000000000005/whatsapp/templates" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Templates fetched",
  "data": {
    "templates": [],
    "unsupportedCount": 0
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.

### Validation declarations

Params · `conversationIdSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```


## POST /api/v1/conversations/:id/whatsapp/templates

**Source:** `server/src/modules/conversation/whatsapp-templates.ts:256`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/conversations/670000000000000000000005/whatsapp/templates" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"order_update","language":"en_US","values":{"1":"ORD-100"}}'
```

### Example response — HTTP 201

```json
{
  "success": true,
  "message": "Template sent",
  "data": {
    "_id": "670000000000000000000007",
    "conversationId": "670000000000000000000005",
    "sessionId": "670000000000000000000006",
    "mid": "provider-message-id",
    "direction": "outgoing",
    "text": "Your order ORD-100 has shipped.",
    "sentAt": "2026-10-15T09:00:00.000Z",
    "template": {
      "name": "order_update",
      "language": "en_US",
      "category": "UTILITY"
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.
- Calls the provider before local persistence; an error does not prove the provider did not accept the send. Inspect state before retrying.

Handler-local error examples:

- HTTP 400: That template is no longer available. Reopen the template picker to see the current list.
- HTTP 400: That template cannot be sent from here — it needs an image or file attachment, or it has been paused for quality.

### Validation declarations

Params · `conversationIdSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

Body · `sendTemplateSchema` · `server/src/modules/conversation/validation.ts`

```typescript
export const sendTemplateSchema = z.strictObject({
  name: z.string().trim().min(1, 'A template name is required'),
  language: z.string().trim().min(1, 'A template language is required'),
  values: z
    .record(z.string(), z.string().trim().min(1, 'Every field needs a value').max(1024, 'Too long'))
    .default({}),
});
```


## GET /api/v1/departments

**Source:** `server/src/modules/department/api.ts:28`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/departments?limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000003",
      "name": "Customer Care",
      "companyId": "670000000000000000000001",
      "status": "active"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false,
    "startIndex": 1,
    "endIndex": 1
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Single-item final-page example. Offset pagination uses page and limit; this example requests the first page.

### Validation declarations

Query · `listDepartmentsSchema` · `server/src/modules/department/validation.ts`

```typescript
export const listDepartmentsSchema = listQuerySchema.extend({
  status: z.enum(DEPARTMENT_STATUS).optional(),
});
```


## POST /api/v1/departments

**Source:** `server/src/modules/department/api.ts:43`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/departments" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"Customer Care"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Department created successfully",
  "data": {
    "_id": "670000000000000000000003",
    "name": "Customer Care",
    "companyId": "670000000000000000000001",
    "status": "active"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- For a super_admin creating a tenant resource, also supply companyId where the schema permits it. Tenant callers use their own company; role assignment is additionally restricted.

Handler-local error examples:

- HTTP 400: companyId is required

### Validation declarations

Body · `createDepartmentSchema` · `server/src/modules/department/validation.ts`

```typescript
export const createDepartmentSchema = z.strictObject({
  name: z.string().min(1, 'Name is required'),
  status: z.enum(DEPARTMENT_STATUS).optional(),
```


## GET /api/v1/departments/:id

**Source:** `server/src/modules/department/api.ts:65`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/departments/670000000000000000000003" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000003",
    "name": "Customer Care",
    "companyId": "670000000000000000000001",
    "status": "active"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

## PATCH /api/v1/departments/:id

**Source:** `server/src/modules/department/api.ts:82`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/departments/670000000000000000000003" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"Customer Support"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Department updated successfully",
  "data": {
    "_id": "670000000000000000000003",
    "name": "Customer Support",
    "companyId": "670000000000000000000001",
    "status": "active"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

Handler-local error examples:

- HTTP 400: Invalid request body

### Validation declarations

Body · `updateDepartmentSchema` · `server/src/modules/department/validation.ts`

```typescript
export const updateDepartmentSchema = z.strictObject({
  name: z.string().min(1, 'Name is required').optional(),
  status: z.enum(DEPARTMENT_STATUS).optional(),
});
```


## DELETE /api/v1/departments/:id

**Source:** `server/src/modules/department/api.ts:108`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/departments/670000000000000000000003" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Department deleted successfully",
  "data": {
    "_id": "670000000000000000000003",
    "name": "Customer Care",
    "companyId": "670000000000000000000001",
    "status": "active"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `deleteDepartmentSchema` · `server/src/modules/department/validation.ts`

```typescript
export const deleteDepartmentSchema = z.object({
  id: idSchema,
});
```


## GET /api/v1/files

**Source:** `server/src/modules/file/api.ts:42`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/files?limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "67000000000000000000000a",
      "filename": "photo.png",
      "key": "generated-photo.png",
      "size": 2048,
      "mimeType": "image/png"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false,
    "startIndex": 1,
    "endIndex": 1
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Uploads have no JWT middleware in this snapshot. File listing is authenticated but has no tenant scope in its query.
- Single-item final-page example. Offset pagination uses page and limit; this example requests the first page.

## POST /api/v1/files/upload-image-single

**Source:** `server/src/modules/file/api.ts:81`

**Access:** No JWT middleware on this route.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/files/upload-image-single" \
  -F "file=@./photo.png"
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "67000000000000000000000a",
    "filename": "photo.png",
    "key": "generated-photo.png",
    "size": 2048,
    "mimeType": "image/png"
  }
}
```

- Read the route-specific authentication requirement below.
- Uploads have no JWT middleware in this snapshot. File listing is authenticated but has no tenant scope in its query.
- File field: file. Let curl/browser set the multipart boundary.

Handler-local error examples:

- HTTP 400: No file uploaded
- HTTP 500: File Upload Request Failed

## POST /api/v1/files/upload-image-multiple

**Source:** `server/src/modules/file/api.ts:118`

**Access:** No JWT middleware on this route.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/files/upload-image-multiple" \
  -F "files=@./photo.png"
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "67000000000000000000000a",
      "filename": "photo.png",
      "key": "generated-photo.png",
      "size": 2048,
      "mimeType": "image/png"
    }
  ]
}
```

- Read the route-specific authentication requirement below.
- Uploads have no JWT middleware in this snapshot. File listing is authenticated but has no tenant scope in its query.
- File field: files. Let curl/browser set the multipart boundary.

Handler-local error examples:

- HTTP 400: No files uploaded
- HTTP 500: Multiple File Upload Request Failed

## GET /api/v1/brands/:brandId/fixed-replies

**Source:** `server/src/modules/fixed-reply/api.ts:50`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/fixed-replies" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "67000000000000000000000b",
      "brandId": "670000000000000000000004",
      "companyId": "670000000000000000000001",
      "title": "Greeting",
      "body": "Hello {user_name}, how can we help?"
    }
  ]
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `brandParamSchema` · `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```


## POST /api/v1/brands/:brandId/fixed-replies

**Source:** `server/src/modules/fixed-reply/api.ts:66`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/brands/670000000000000000000004/fixed-replies" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"title":"Greeting","body":"Hello {user_name}, how can we help?"}'
```

### Example response — HTTP 201

```json
{
  "success": true,
  "message": "Fixed reply created",
  "data": {
    "_id": "67000000000000000000000b",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "title": "Greeting",
    "body": "Hello {user_name}, how can we help?"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `brandParamSchema` · `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

Body · `createFixedReplySchema` · `server/src/modules/fixed-reply/validation.ts`

```typescript
export const createFixedReplySchema = z.strictObject({
  title: z.string().trim().min(1, 'Title is required').max(100, 'Title is too long'),
  body: z.string().trim().min(1, 'Body is required').max(2000, 'Body is too long'),
});
```


## PATCH /api/v1/brands/:brandId/fixed-replies/:id

**Source:** `server/src/modules/fixed-reply/api.ts:84`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/brands/670000000000000000000004/fixed-replies/67000000000000000000000b" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"title":"Welcome"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Fixed reply updated",
  "data": {
    "_id": "67000000000000000000000b",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "title": "Welcome",
    "body": "Hello {user_name}, how can we help?"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `replyParamsSchema` · `server/src/modules/fixed-reply/validation.ts`

```typescript
export const replyParamsSchema = z.object({
  brandId: idSchema,
  id: idSchema,
});
```

Body · `updateFixedReplySchema` · `server/src/modules/fixed-reply/validation.ts`

```typescript
export const updateFixedReplySchema = z
  .strictObject({
    title: z.string().trim().min(1, 'Title is required').max(100, 'Title is too long').optional(),
    body: z.string().trim().min(1, 'Body is required').max(2000, 'Body is too long').optional(),
  })
  .refine(data => data.title !== undefined || data.body !== undefined, {
    message: 'Provide a title or body to update',
  });
```


## DELETE /api/v1/brands/:brandId/fixed-replies/:id

**Source:** `server/src/modules/fixed-reply/api.ts:105`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/brands/670000000000000000000004/fixed-replies/67000000000000000000000b" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Fixed reply deleted",
  "data": {
    "_id": "67000000000000000000000b",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "title": "Greeting",
    "body": "Hello {user_name}, how can we help?"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `replyParamsSchema` · `server/src/modules/fixed-reply/validation.ts`

```typescript
export const replyParamsSchema = z.object({
  brandId: idSchema,
  id: idSchema,
});
```


## GET /api/v1/brands/:brandId/overview/stats

**Source:** `server/src/modules/overview/api.ts:36`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/overview/stats" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "openSessions": 0,
    "unassignedOpenSessions": 0
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `brandParamSchema` · `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

Query · `statsQuerySchema` · `server/src/modules/overview/validation.ts`

```typescript
export const statsQuerySchema = z.strictObject({
  platform: z.enum(CHANNEL_PLATFORMS).optional(),
});
```


## GET /api/v1/brands/:brandId/overview/sla

**Source:** `server/src/modules/overview/api.ts:55`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/overview/sla?from=2026-10-15&to=2026-10-15" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "range": {
      "from": "2026-10-15",
      "to": "2026-10-15"
    },
    "firstResponse": {
      "enabled": true,
      "pending": 0,
      "resolved": 0,
      "atRisk": {
        "count": 0,
        "percent": null
      },
      "breached": {
        "count": 0,
        "percent": null
      }
    },
    "resolution": {
      "enabled": true,
      "pending": 0,
      "resolved": 0,
      "atRisk": {
        "count": 0,
        "percent": null
      },
      "breached": {
        "count": 0,
        "percent": null
      }
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `brandParamSchema` · `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

Query · `slaQuerySchema` · `server/src/modules/overview/validation.ts`

```typescript
export const slaQuerySchema = withRangeChecks(
  z.strictObject({ source: z.enum(SLA_SOURCES).optional(), ...rangeFields })
);
```


## GET /api/v1/brands/:brandId/overview/engagement

**Source:** `server/src/modules/overview/api.ts:87`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/overview/engagement?from=2026-10-15&to=2026-10-15" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "range": {
      "from": "2026-10-15",
      "to": "2026-10-15"
    },
    "inbound": {
      "sessions": 0,
      "threads": 0,
      "total": 0,
      "byPlatform": [
        {
          "platform": "facebook",
          "sessions": 0,
          "threads": 0,
          "total": 0
        },
        {
          "platform": "instagram",
          "sessions": 0,
          "threads": 0,
          "total": 0
        },
        {
          "platform": "whatsapp",
          "sessions": 0,
          "threads": 0,
          "total": 0
        }
      ]
    },
    "responseRate": {
      "dm": {
        "responded": 0,
        "total": 0,
        "percent": null
      },
      "comments": {
        "responded": 0,
        "total": 0,
        "percent": null
      }
    },
    "backlog": {
      "sessions": {
        "lt1h": 0,
        "h1to4": 0,
        "gt4h": 0,
        "total": 0
      },
      "threads": {
        "lt1h": 0,
        "h1to4": 0,
        "gt4h": 0,
        "total": 0
      },
      "total": {
        "lt1h": 0,
        "h1to4": 0,
        "gt4h": 0,
        "total": 0
      }
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `brandParamSchema` · `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

Query · `rangeQuerySchema` · `server/src/modules/overview/validation.ts`

```typescript
export const rangeQuerySchema = withRangeChecks(z.strictObject(rangeFields));
```


## GET /api/v1/brands/:brandId/overview/inbound-trend

**Source:** `server/src/modules/overview/api.ts:112`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/overview/inbound-trend?from=2026-10-15&to=2026-10-15" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "date": "2026-10-15",
      "inbound": 0,
      "closed": 0
    }
  ]
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `brandParamSchema` · `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

Query · `rangeQuerySchema` · `server/src/modules/overview/validation.ts`

```typescript
export const rangeQuerySchema = withRangeChecks(z.strictObject(rangeFields));
```


## GET /api/v1/brands/:brandId/overview/sla-compliance

**Source:** `server/src/modules/overview/api.ts:133`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/overview/sla-compliance?from=2026-10-15&to=2026-10-15" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "range": {
      "from": "2026-10-15",
      "to": "2026-10-15"
    },
    "firstResponse": {
      "enabled": true,
      "met": 0,
      "breached": 0,
      "measured": 0,
      "percent": null
    },
    "resolution": {
      "enabled": true,
      "met": 0,
      "breached": 0,
      "measured": 0,
      "percent": null
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `brandParamSchema` · `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

Query · `rangeQuerySchema` · `server/src/modules/overview/validation.ts`

```typescript
export const rangeQuerySchema = withRangeChecks(z.strictObject(rangeFields));
```


## GET /api/v1/query-managers

**Source:** `server/src/modules/query-manager/api.ts:57`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/query-managers?limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000002",
      "name": "Amina Rahman",
      "email": "amina@example.com",
      "role": "query_manager",
      "companyId": "670000000000000000000001"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false,
    "startIndex": 1,
    "endIndex": 1
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Single-item final-page example. Offset pagination uses page and limit; this example requests the first page.

### Validation declarations

Query · `listQueryManagersSchema` · `server/src/modules/query-manager/validation.ts`

```typescript
export const listQueryManagersSchema = listQuerySchema.extend({
  departmentId: idSchema.optional(),
});
```


## POST /api/v1/query-managers

**Source:** `server/src/modules/query-manager/api.ts:72`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/query-managers" \
  -b cookies.txt -c cookies.txt \
  -F "name=Amina Rahman" \
  -F "email=amina@example.com" \
  -F "password=ExamplePassword1!" \
  -F "departmentId=670000000000000000000003" \
  -F "avatar=@./photo.png"
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Query manager created successfully",
  "data": {
    "_id": "670000000000000000000002",
    "name": "Amina Rahman",
    "email": "amina@example.com",
    "role": "query_manager",
    "companyId": "670000000000000000000001"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- File field: avatar. Let curl/browser set the multipart boundary.
- For a super_admin creating a tenant resource, also supply companyId where the schema permits it. Tenant callers use their own company; role assignment is additionally restricted.

Handler-local error examples:

- HTTP 400: companyId is required

### Validation declarations

Body · `createQueryManagerSchema` · `server/src/modules/query-manager/validation.ts`

```typescript
export const createQueryManagerSchema = z.strictObject({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email format').min(1, 'Email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  departmentId: idSchema,
```


## GET /api/v1/query-managers/:id

**Source:** `server/src/modules/query-manager/api.ts:110`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/query-managers/670000000000000000000002" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000002",
    "name": "Amina Rahman",
    "email": "amina@example.com",
    "role": "query_manager",
    "companyId": "670000000000000000000001"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

## PATCH /api/v1/query-managers/:id

**Source:** `server/src/modules/query-manager/api.ts:127`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/query-managers/670000000000000000000002" \
  -b cookies.txt -c cookies.txt \
  -F "name=Amina Rahman Updated" \
  -F "avatar=@./photo.png"
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Query manager updated successfully",
  "data": {
    "_id": "670000000000000000000002",
    "name": "Amina Rahman Updated",
    "email": "amina@example.com",
    "role": "query_manager",
    "companyId": "670000000000000000000001"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- File field: avatar. Let curl/browser set the multipart boundary.

Handler-local error examples:

- HTTP 400: Invalid request body

### Validation declarations

Body · `updateQueryManagerSchema` · `server/src/modules/query-manager/validation.ts`

```typescript
export const updateQueryManagerSchema = z.strictObject({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.email('Invalid email format').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  departmentId: idSchema.optional(),
});
```


## DELETE /api/v1/query-managers/:id

**Source:** `server/src/modules/query-manager/api.ts:181`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/query-managers/670000000000000000000002" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Query manager deleted successfully",
  "data": {
    "_id": "670000000000000000000002",
    "name": "Amina Rahman",
    "email": "amina@example.com",
    "role": "query_manager",
    "companyId": "670000000000000000000001"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `deleteQueryManagerSchema` · `server/src/modules/query-manager/validation.ts`

```typescript
export const deleteQueryManagerSchema = z.object({
  id: idSchema,
});
```


## GET /api/v1/sessions

**Source:** `server/src/modules/session/api.ts:83`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/sessions?conversationId=670000000000000000000005&limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000006",
      "conversationId": "670000000000000000000005",
      "brandId": "670000000000000000000004",
      "companyId": "670000000000000000000001",
      "platform": "facebook",
      "status": "pending",
      "sentiment": "NEUTRAL",
      "sequence": 1,
      "startedAt": "2026-10-15T09:00:00.000Z",
      "lastActivityAt": "2026-10-15T09:00:00.000Z",
      "tags": [],
      "messageCount": 1
    }
  ],
  "pagination": {
    "limit": 20,
    "hasNext": false
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Single-item final-page example. Continue with nextCursor when hasNext is true; the token is omitted on the final page.

### Validation declarations

Query · `listSessionsSchema` · `server/src/modules/session/validation.ts`

```typescript
export const listSessionsSchema = cursorListQuerySchema.extend({
  conversationId: idSchema,
});
```


## GET /api/v1/sessions/assignees

**Source:** `server/src/modules/session/api.ts:104`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/sessions/assignees?brandId=670000000000000000000004" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "departments": [],
    "queryManagers": []
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

Handler-local error examples:

- HTTP 404: Brand not found

### Validation declarations

Query · `assigneesQuerySchema` · `server/src/modules/session/validation.ts`

```typescript
export const assigneesQuerySchema = z.object({
  brandId: idSchema,
});
```


## GET /api/v1/sessions/:id

**Source:** `server/src/modules/session/api.ts:125`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/sessions/670000000000000000000006" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000006",
    "conversationId": "670000000000000000000005",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "status": "pending",
    "sentiment": "NEUTRAL",
    "sequence": 1,
    "startedAt": "2026-10-15T09:00:00.000Z",
    "lastActivityAt": "2026-10-15T09:00:00.000Z",
    "tags": [],
    "messageCount": 1
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `sessionIdSchema` · `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```


## PATCH /api/v1/sessions/:id/status

**Source:** `server/src/modules/session/api.ts:140`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/sessions/670000000000000000000006/status" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"status":"resolved"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Session status updated",
  "data": {
    "_id": "670000000000000000000006",
    "conversationId": "670000000000000000000005",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "status": "resolved",
    "sentiment": "NEUTRAL",
    "sequence": 1,
    "startedAt": "2026-10-15T09:00:00.000Z",
    "lastActivityAt": "2026-10-15T09:00:00.000Z",
    "tags": [],
    "messageCount": 1
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.
- Alternative body: {"mergeWithPrevious":true}. That branch merges into the previous session and returns it with message Session merged.

### Validation declarations

Params · `sessionIdSchema` · `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

Body · `changeStatusSchema` · `server/src/modules/session/validation.ts`

```typescript
export const changeStatusSchema = z
  .strictObject({
    status: z.enum(SESSION_STATUSES).optional(),
    mergeWithPrevious: z.boolean().optional(),
  })
  .refine(v => v.status !== undefined || v.mergeWithPrevious === true, {
    message: 'Provide a status to set, or mergeWithPrevious: true',
  });
```


## PATCH /api/v1/sessions/:id/sentiment

**Source:** `server/src/modules/session/api.ts:170`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/sessions/670000000000000000000006/sentiment" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"sentiment":"POSITIVE"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Session sentiment updated",
  "data": {
    "_id": "670000000000000000000006",
    "conversationId": "670000000000000000000005",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "status": "pending",
    "sentiment": "POSITIVE",
    "sequence": 1,
    "startedAt": "2026-10-15T09:00:00.000Z",
    "lastActivityAt": "2026-10-15T09:00:00.000Z",
    "tags": [],
    "messageCount": 1
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.

### Validation declarations

Params · `sessionIdSchema` · `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

Body · `setSentimentSchema` · `server/src/modules/session/validation.ts`

```typescript
export const setSentimentSchema = z.strictObject({
  sentiment: z.enum(SESSION_SENTIMENTS),
});
```


## PATCH /api/v1/sessions/:id/wrap-up

**Source:** `server/src/modules/session/api.ts:195`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/sessions/670000000000000000000006/wrap-up" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"status":"resolved","sentiment":"POSITIVE","sessionType":"support","resolutionSummary":"Issue resolved.","tagIds":[]}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Session wrapped up",
  "data": {
    "_id": "670000000000000000000006",
    "conversationId": "670000000000000000000005",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "status": "resolved",
    "sentiment": "POSITIVE",
    "sequence": 1,
    "startedAt": "2026-10-15T09:00:00.000Z",
    "lastActivityAt": "2026-10-15T09:00:00.000Z",
    "tags": [],
    "messageCount": 1,
    "sessionType": "support",
    "resolutionSummary": "Issue resolved."
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.

### Validation declarations

Params · `sessionIdSchema` · `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

Body · `wrapUpSchema` · `server/src/modules/session/validation.ts`

```typescript
export const wrapUpSchema = z.strictObject({
  status: z.enum(['unresolved', 'resolved', 'hold']),
  sentiment: z.enum(SESSION_SENTIMENTS),
  sessionType: z.enum(SESSION_TYPES),
  resolutionSummary: z.string().trim().max(8000, 'Resolution summary is too long').optional(),
  tagIds: z
    .array(idSchema)
    .max(MAX_TAGS_PER_RECORD, `A record can carry at most ${MAX_TAGS_PER_RECORD} tags`),
});
```


## PATCH /api/v1/sessions/:id/assignment

**Source:** `server/src/modules/session/api.ts:227`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/sessions/670000000000000000000006/assignment" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"assigneeType":"department","assigneeId":"670000000000000000000003"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Session assigned",
  "data": {
    "_id": "670000000000000000000006",
    "conversationId": "670000000000000000000005",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "status": "pending",
    "sentiment": "NEUTRAL",
    "sequence": 1,
    "startedAt": "2026-10-15T09:00:00.000Z",
    "lastActivityAt": "2026-10-15T09:00:00.000Z",
    "tags": [],
    "messageCount": 1,
    "assignee": {
      "kind": "department",
      "id": "670000000000000000000003",
      "name": "Customer Care"
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment changes have a separate company-policy gate; assigned-only mode restricts agent reassignment.
- Use {"assigneeType":null} to clear; response message becomes Session unassigned.

### Validation declarations

Params · `sessionIdSchema` · `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

Body · `assignSessionSchema` · `server/src/modules/session/validation.ts`

```typescript
export const assignSessionSchema = z
  .strictObject({
    assigneeType: z.enum(ASSIGNEE_TYPES).nullable(),
    assigneeId: idSchema.optional(),
  })
  .refine(v => v.assigneeType === null || v.assigneeId !== undefined, {
    message: 'assigneeId is required unless clearing the assignment (assigneeType: null)',
  });
```


## PUT /api/v1/sessions/:id/tags

**Source:** `server/src/modules/session/api.ts:275`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X PUT "${BASE_URL}/api/v1/sessions/670000000000000000000006/tags" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"tagIds":[]}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Session tags updated",
  "data": {
    "_id": "670000000000000000000006",
    "conversationId": "670000000000000000000005",
    "brandId": "670000000000000000000004",
    "companyId": "670000000000000000000001",
    "platform": "facebook",
    "status": "pending",
    "sentiment": "NEUTRAL",
    "sequence": 1,
    "startedAt": "2026-10-15T09:00:00.000Z",
    "lastActivityAt": "2026-10-15T09:00:00.000Z",
    "tags": [],
    "messageCount": 1
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.

### Validation declarations

Params · `sessionIdSchema` · `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

Body · `setSessionTagsSchema` · `server/src/modules/session/validation.ts`

```typescript
export const setSessionTagsSchema = z.strictObject({
  tagIds: z
    .array(idSchema)
    .max(MAX_TAGS_PER_RECORD, `A record can carry at most ${MAX_TAGS_PER_RECORD} tags`),
});
```


## GET /api/v1/sessions/:id/notes

**Source:** `server/src/modules/session/api.ts:298`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/sessions/670000000000000000000006/notes" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "67000000000000000000000c",
      "sessionId": "670000000000000000000006",
      "conversationId": "670000000000000000000005",
      "authorId": "670000000000000000000002",
      "authorName": "Amina Rahman",
      "text": "Customer requested a callback."
    }
  ]
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `sessionIdSchema` · `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```


## POST /api/v1/sessions/:id/notes

**Source:** `server/src/modules/session/api.ts:314`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/sessions/670000000000000000000006/notes" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"text":"Customer requested a callback."}'
```

### Example response — HTTP 201

```json
{
  "success": true,
  "message": "Note added",
  "data": {
    "_id": "67000000000000000000000c",
    "sessionId": "670000000000000000000006",
    "conversationId": "670000000000000000000005",
    "authorId": "670000000000000000000002",
    "authorName": "Amina Rahman",
    "text": "Customer requested a callback."
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Assignment policy and active channel checks can reject the operation even when the record is readable.

### Validation declarations

Params · `sessionIdSchema` · `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

Body · `addNoteSchema` · `server/src/modules/session/validation.ts`

```typescript
export const addNoteSchema = z.strictObject({
  text: z.string().trim().min(1, 'Note text is required').max(8000, 'Note is too long'),
});
```


## GET /api/v1/brands/:brandId/settings/:type

**Source:** `server/src/modules/settings/api.ts:33`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/settings/sla" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "type": "sla",
    "version": 0,
    "value": {
      "tier": "Standard",
      "overrides": {
        "firstResponse": null,
        "resolution": null
      }
    },
    "changedBy": null,
    "savedAt": null,
    "tierDefaults": {
      "Standard": {
        "firstResponse": {
          "on": true,
          "minutes": 60
        },
        "resolution": {
          "on": true,
          "minutes": 480
        }
      },
      "Priority": {
        "firstResponse": {
          "on": true,
          "minutes": 45
        },
        "resolution": {
          "on": true,
          "minutes": 240
        }
      }
    }
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- type is sla or business-hours. History cursor is a version number, unlike opaque inbox cursors. PUT requires the current baseVersion; concurrent changes return 409.

### Validation declarations

Params · `settingParamsSchema` · `server/src/modules/settings/validation.ts`

```typescript
export const settingParamsSchema = z.object({
  brandId: idSchema,
  type: z.enum(SETTING_TYPES),
});
```


## PUT /api/v1/brands/:brandId/settings/:type

**Source:** `server/src/modules/settings/api.ts:49`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X PUT "${BASE_URL}/api/v1/brands/670000000000000000000004/settings/sla" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"baseVersion":0,"value":{"tier":"Standard","overrides":{"firstResponse":null,"resolution":null}}}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Saved as version 1",
  "data": {
    "type": "sla",
    "version": 1,
    "value": {
      "tier": "Standard",
      "overrides": {
        "firstResponse": null,
        "resolution": null
      }
    },
    "changedBy": {
      "id": "670000000000000000000002",
      "name": "Amina Rahman"
    },
    "savedAt": "2026-10-15T09:00:00.000Z"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- type is sla or business-hours. History cursor is a version number, unlike opaque inbox cursors. PUT requires the current baseVersion; concurrent changes return 409.

### Validation declarations

Params · `settingParamsSchema` · `server/src/modules/settings/validation.ts`

```typescript
export const settingParamsSchema = z.object({
  brandId: idSchema,
  type: z.enum(SETTING_TYPES),
});
```

Body · `saveSettingSchema` · `server/src/modules/settings/validation.ts`

```typescript
export const saveSettingSchema = z.strictObject({
```


## GET /api/v1/brands/:brandId/settings/:type/history

**Source:** `server/src/modules/settings/api.ts:79`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/settings/sla/history?limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "type": "sla",
      "version": 1,
      "value": {
        "tier": "Standard",
        "overrides": {
          "firstResponse": null,
          "resolution": null
        }
      },
      "changedBy": {
        "id": "670000000000000000000002",
        "name": "Amina Rahman"
      },
      "savedAt": "2026-10-15T09:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "hasNext": false
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- type is sla or business-hours. History cursor is a version number, unlike opaque inbox cursors. PUT requires the current baseVersion; concurrent changes return 409.
- Single-item final-page example. Continue with nextCursor when hasNext is true; the token is omitted on the final page.

### Validation declarations

Params · `settingParamsSchema` · `server/src/modules/settings/validation.ts`

```typescript
export const settingParamsSchema = z.object({
  brandId: idSchema,
  type: z.enum(SETTING_TYPES),
});
```

Query · `historyQuerySchema` · `server/src/modules/settings/validation.ts`

```typescript
export const historyQuerySchema = z.strictObject({
  cursor: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
```


## GET /api/v1/users

**Source:** `server/src/modules/user/api.ts:101`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/users?limit=20" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000002",
      "name": "Amina Rahman",
      "email": "amina@example.com",
      "role": "company_admin",
      "companyId": "670000000000000000000001"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false,
    "startIndex": 1,
    "endIndex": 1
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Single-item final-page example. Offset pagination uses page and limit; this example requests the first page.

### Validation declarations

Query · `listUsersSchema` · `server/src/modules/user/validation.ts`

```typescript
export const listUsersSchema = listQuerySchema.extend({
  role: z.enum(ROLE_VALUES).optional(),
});
```


## POST /api/v1/users

**Source:** `server/src/modules/user/api.ts:116`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/users" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"Amina Rahman","email":"amina@example.com","password":"ExamplePassword1!","role":"query_manager","departmentId":"670000000000000000000003"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000002",
    "name": "Amina Rahman",
    "email": "amina@example.com",
    "role": "query_manager",
    "companyId": "670000000000000000000001",
    "departmentId": "670000000000000000000003"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- For a super_admin creating a tenant resource, also supply companyId where the schema permits it. Tenant callers use their own company; role assignment is additionally restricted.

Handler-local error examples:

- HTTP 400: Please provide name, email, password, and role
- HTTP 400: companyId is required

### Validation declarations

Body · `createUserSchema` · `server/src/modules/user/validation.ts`

```typescript
export const createUserSchema = z.strictObject({
  name: z.string({}).min(1, 'Name is required'),
  email: z.email('Invalid email format').min(1, 'Email is required'),
  password: passwordPolicy,
  role: z.enum(ROLE_VALUES).optional(),
```


## GET /api/v1/users/me

**Source:** `server/src/modules/user/api.ts:157`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension).

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/users/me" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000002",
    "name": "Amina Rahman",
    "email": "amina@example.com",
    "role": "company_admin",
    "companyId": "670000000000000000000001"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

## GET /api/v1/users/:id

**Source:** `server/src/modules/user/api.ts:171`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/users/670000000000000000000002" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000002",
    "name": "Amina Rahman",
    "email": "amina@example.com",
    "role": "company_admin",
    "companyId": "670000000000000000000001"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `deleteUserSchema` · `server/src/modules/user/validation.ts`

```typescript
export const deleteUserSchema = z.object({
  id: idSchema,
});
```


## PATCH /api/v1/users/me

**Source:** `server/src/modules/user/api.ts:189`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension).

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/users/me" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"Amina Rahman Updated"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000002",
    "name": "Amina Rahman Updated",
    "email": "amina@example.com",
    "role": "company_admin",
    "companyId": "670000000000000000000001"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

Handler-local error examples:

- HTTP 400: Please provide at least one field to update

### Validation declarations

Body · `updateMeSchema` · `server/src/modules/user/validation.ts`

```typescript
export const updateMeSchema = z.strictObject({
  name: z.string().optional(),
});
```


## PATCH /api/v1/users/me/change-password

**Source:** `server/src/modules/user/api.ts:217`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension).

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/users/me/change-password" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"oldPassword":"ExamplePassword1!","newPassword":"DifferentPassword2!"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000002",
    "name": "Amina Rahman",
    "email": "amina@example.com",
    "role": "company_admin",
    "companyId": "670000000000000000000001"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

Handler-local error examples:

- HTTP 400: Please provide oldPassword and newPassword
- HTTP 400: Old password does not match

### Validation declarations

Body · `changePasswordSchema` · `server/src/modules/user/validation.ts`

```typescript
export const changePasswordSchema = z
  .strictObject({
    oldPassword: z.string().min(1, 'Old password is required'),
    newPassword: passwordPolicy,
  })
  .refine(data => data.oldPassword !== data.newPassword, {
    message: 'New password must be different from old password',
    path: ['newPassword'],
  });
```


## PATCH /api/v1/users/:id

**Source:** `server/src/modules/user/api.ts:254`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/users/670000000000000000000002" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"Amina Rahman Updated"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000002",
    "name": "Amina Rahman Updated",
    "email": "amina@example.com",
    "role": "company_admin",
    "companyId": "670000000000000000000001"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

Handler-local error examples:

- HTTP 400: Invalid request body

### Validation declarations

Body · `updateUserSchema` · `server/src/modules/user/validation.ts`

```typescript
export const updateUserSchema = z.strictObject({
  name: z.string().optional(),
  email: z.email('Invalid email format').optional(),
  role: z.enum(ROLE_VALUES).optional(),
  departmentId: idSchema.optional(),
});
```


## DELETE /api/v1/users/:id

**Source:** `server/src/modules/user/api.ts:293`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

### Request example

```sh
curl -i -X DELETE "${BASE_URL}/api/v1/users/670000000000000000000002" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000002",
    "name": "Amina Rahman",
    "email": "amina@example.com",
    "role": "company_admin",
    "companyId": "670000000000000000000001"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

Params · `deleteUserSchema` · `server/src/modules/user/validation.ts`

```typescript
export const deleteUserSchema = z.object({
  id: idSchema,
});
```


## GET /api/v1/webhooks/facebook

**Source:** `server/src/modules/webhook/index.ts:14`

**Access:** Provider verification token must match the configured token.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/webhooks/facebook?hub.mode=subscribe&hub.verify_token=VERIFY_TOKEN&hub.challenge=12345"
```

### Example response — HTTP 200

```text
12345
```

- Read the route-specific authentication requirement below.

## POST /api/v1/webhooks/facebook

**Source:** `server/src/modules/webhook/index.ts:15`

**Access:** X-Hub-Signature-256: sha256=<HMAC of exact raw body using the app secret>.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/webhooks/facebook" \
  -H "X-Hub-Signature-256: sha256=<VALID_HMAC>" \
  -H "Content-Type: application/json" \
  --data '{"object":"page","entry":[]}'
```

### Example response — HTTP 200

```text
OK
```

- Read the route-specific authentication requirement below.
- Minimal no-op envelope. Real deliveries contain provider entries. HTTP 200 acknowledges queue admission, not completed processing; queue failure returns 500, bad authentication 403.

## POST /api/v1/webhooks/facebook/relay

**Source:** `server/src/modules/webhook/index.ts:18`

**Access:** X-Relay-Token must match FACEBOOK_RELAY_TOKEN.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/webhooks/facebook/relay" \
  -H "X-Relay-Token: <RELAY_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"object":"page","entry":[]}'
```

### Example response — HTTP 200

```text
OK
```

- Read the route-specific authentication requirement below.
- Minimal no-op envelope. Real deliveries contain provider entries. HTTP 200 acknowledges queue admission, not completed processing; queue failure returns 500, bad authentication 403.

## GET /api/v1/webhooks/whatsapp

**Source:** `server/src/modules/webhook/index.ts:22`

**Access:** Provider verification token must match the configured token.

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=VERIFY_TOKEN&hub.challenge=12345"
```

### Example response — HTTP 200

```text
12345
```

- Read the route-specific authentication requirement below.

## POST /api/v1/webhooks/whatsapp

**Source:** `server/src/modules/webhook/index.ts:23`

**Access:** X-Hub-Signature-256: sha256=<HMAC of exact raw body using the app secret>.

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/webhooks/whatsapp" \
  -H "X-Hub-Signature-256: sha256=<VALID_HMAC>" \
  -H "Content-Type: application/json" \
  --data '{"object":"whatsapp_business_account","entry":[]}'
```

### Example response — HTTP 200

```text
OK
```

- Read the route-specific authentication requirement below.
- Minimal no-op envelope. Real deliveries contain provider entries. HTTP 200 acknowledges queue admission, not completed processing; queue failure returns 500, bad authentication 403.

## GET /health

**Source:** `server/src/routes.ts`

**Access:** Public; no JWT middleware.

### Request example

```sh
curl -i "${BASE_URL}/health"
```

### Example response — HTTP 200

```json
{
  "status": "ok",
  "uptime": 120,
  "components": {
    "mongo": "connected",
    "redis": "connected",
    "realtime": "up"
  }
}
```

- Health uses its own response shape. /health returns 503 only when Mongo is unavailable; Redis failure can return 200 degraded. /health/queue returns 200 ok or 503 stalled, flooded, or unavailable. Queue example shows the healthy, empty-queue branch. An unavailable queue returns HTTP 503 with {"status":"unavailable"}.

## GET /health/queue

**Source:** `server/src/routes.ts`

**Access:** Public; no JWT middleware.

### Request example

```sh
curl -i "${BASE_URL}/health/queue"
```

### Example response — HTTP 200

```json
{
  "status": "ok",
  "waiting": 0,
  "active": 0,
  "delayed": 0,
  "failed": 0,
  "oldestWaitingAgeSec": null,
  "thresholds": {
    "stallAgeSec": 300,
    "backlogLimit": 5000
  }
}
```

- Health uses its own response shape. /health returns 503 only when Mongo is unavailable; Redis failure can return 200 degraded. /health/queue returns 200 ok or 503 stalled, flooded, or unavailable. Queue example shows the healthy, empty-queue branch. An unavailable queue returns HTTP 503 with {"status":"unavailable"}.


## Settings payload variants


The endpoint examples select `type=sla`. The same three settings routes also accept `type=business-hours`. Read the current version first, then PUT its version as `baseVersion`:

```json title="PUT /api/v1/brands/:brandId/settings/business-hours"
{
  "baseVersion": 0,
  "value": {
    "days": [
      { "day": "Saturday", "open": true, "opens": "09:00", "closes": "21:00" },
      { "day": "Sunday", "open": true, "opens": "09:00", "closes": "21:00" },
      { "day": "Monday", "open": true, "opens": "09:00", "closes": "21:00" },
      { "day": "Tuesday", "open": true, "opens": "09:00", "closes": "21:00" },
      { "day": "Wednesday", "open": true, "opens": "09:00", "closes": "21:00" },
      { "day": "Thursday", "open": true, "opens": "09:00", "closes": "21:00" },
      { "day": "Friday", "open": false, "opens": "09:00", "closes": "21:00" }
    ],
    "holidays": []
  }
}
```

Every weekday must occur once. Opening time must precede closing time on an open day; overnight ranges are unsupported. Do not send `timezone`: the server adds `Asia/Dhaka` to the saved value. The response is `{ success, message, data }`, with `data.type`, `version`, `value`, `changedBy`, and `savedAt`. GET before the first save returns virtual version zero with null audit values; history includes saved versions only.


