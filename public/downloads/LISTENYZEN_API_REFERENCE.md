# Listenyzen API endpoint reference

Source-derived examples for all 129 mounted API operations and two health endpoints. Inspected on 2026-10-19. These are illustrative examples, not captured live responses. IDs must be replaced with records visible to your account. Provider codes, tokens, URLs, and signatures are placeholders.

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

**Prerequisites:** Database foundation. Registration bootstraps Company and User together; login needs an existing user. Company administration needs an authenticated permitted role.

**Business logic:** A company is the tenant boundary. Registration creates the company and owner, links ownerId and uses compensating cleanup on failure. Password verification precedes issuing access/refresh cookies. Query-manager writes require personal assignment; suspension is checked separately from role permission.

**Implementation entry points:** `server/src/auth/api.ts → auth/service.ts; auth/company-access.ts; modules/company/service.ts`

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

**Body: registerCompanySchema** — `server/src/auth/validation.ts`

```typescript
const registerCompanySchema = z.strictObject({
  companyName: z.string().min(1, 'Company name is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email format').min(1, 'Email is required'),
  password: passwordPolicy,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post(
    '/register-company',
    authLimiter,
    validateBody(registerCompanySchema),
    async (req: Request, res: Response) => {
      const { companyName, name, email, password } = req.body;
      const user = await registerCompany({ companyName, name, email, password });
      const { accessToken, refreshToken } = loginUser({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId?.toString(),
        departmentId: user.departmentId?.toString(),
        teamId: user.teamId?.toString(),
      });
      setAuthCookies(res, { accessToken, refreshToken });
      successResponse(res, {
        data: { user },
        message: 'Company registered successfully',
      });
    }
  )
```

## POST /api/v1/auth/login

**Source:** `server/src/auth/api.ts:74`

**Access:** Email and password via the local authentication strategy; no existing access token required. Active company required for tenant users.

**Prerequisites:** Database foundation. Registration bootstraps Company and User together; login needs an existing user. Company administration needs an authenticated permitted role.

**Business logic:** A company is the tenant boundary. Registration creates the company and owner, links ownerId and uses compensating cleanup on failure. Password verification precedes issuing access/refresh cookies. Query-manager writes require personal assignment; suspension is checked separately from role permission.

**Implementation entry points:** `server/src/auth/api.ts → auth/service.ts; auth/company-access.ts; modules/company/service.ts`

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

- Sets access_token and refresh_token HttpOnly cookies. Tokens are not returned in JSON.

### Validation declarations

**Body: loginSchema** — `server/src/auth/validation.ts`

```typescript
const loginSchema = z.strictObject({
  email: z.email('Invalid email format').min(1, 'Email is required'),
  // Length-only on purpose — see `password-policy.ts`. Checking a password is not setting one.
  password: z.string().min(1, 'Password is required'),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post(
    '/login',
    authLimiter,
    validateBody(loginSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      passport.authenticate(
        'local',
        { session: false },
        async (err: Error, user: IUser, info: { message: string }) => {
          if (err) return next(err);
          if (!user) return res.status(401).json({ message: info?.message });
          const { accessToken, refreshToken } = loginUser({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            companyId: user.companyId?.toString(),
            departmentId: user.departmentId?.toString(),
            teamId: user.teamId?.toString(),
          });
          setAuthCookies(res, { accessToken, refreshToken });
          successResponse(res, {
            data: { user },
            message: 'User logged in successfully',
          });
        }
      )(req, res, next);
    }
  )
```

## POST /api/v1/auth/logout

**Source:** `server/src/auth/api.ts:108`

**Access:** No JWT middleware on this route.

**Prerequisites:** Database foundation. Registration bootstraps Company and User together; login needs an existing user. Company administration needs an authenticated permitted role.

**Business logic:** A company is the tenant boundary. Registration creates the company and owner, links ownerId and uses compensating cleanup on failure. Password verification precedes issuing access/refresh cookies. Query-manager writes require personal assignment; suspension is checked separately from role permission.

**Implementation entry points:** `server/src/auth/api.ts → auth/service.ts; auth/company-access.ts; modules/company/service.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post('/logout', (_req: Request, res: Response) => {
    clearAuthCookies(res);
    successResponse(res, { message: 'User logged out successfully' });
  })
```

## POST /api/v1/auth/refresh

**Source:** `server/src/auth/api.ts:118`

**Access:** No JWT middleware on this route.

**Prerequisites:** Database foundation. Registration bootstraps Company and User together; login needs an existing user. Company administration needs an authenticated permitted role.

**Business logic:** A company is the tenant boundary. Registration creates the company and owner, links ownerId and uses compensating cleanup on failure. Password verification precedes issuing access/refresh cookies. Query-manager writes require personal assignment; suspension is checked separately from role permission.

**Implementation entry points:** `server/src/auth/api.ts → auth/service.ts; auth/company-access.ts; modules/company/service.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

- HTTP 400: Refresh token is required

### Handler code

```typescript
router.post('/refresh', authLimiter, async (req: Request, res: Response) => {
    const refresh_token = req.cookies?.refresh_token;
    if (!refresh_token)
      throw new BadRequestError('Refresh token is required', 'auth POST /refresh');
    const { accessToken, refreshToken } = await refresh(refresh_token);
    setAuthCookies(res, { accessToken, refreshToken });
    successResponse(res, { message: 'Tokens refreshed successfully' });
  })
```

## GET /api/v1/brands

**Source:** `server/src/modules/brand/api.ts:60`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Query: listBrandsSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const listBrandsSchema = listQuerySchema.extend({
  status: z.enum(BRAND_STATUS).optional(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN, ROLES.QUERY_MANAGER),
    validateQuery(listBrandsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const data = await search(req.query, getBrandScope(req.user));
      paginatedSuccessResponse(res, { data });
    }
  )
```

## POST /api/v1/brands

**Source:** `server/src/modules/brand/api.ts:75`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

### Validation declarations

**Body: createBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const createBrandSchema = z.strictObject({
  name: z.string().min(1, NAME_REQUIRED),
  email: z.email('Invalid email'),
  status: z.enum(BRAND_STATUS).optional(),
  // Only honoured for super_admin; for company_admin the server forces its own company.
  companyId: idSchema.optional(),
});
```

### Error examples

- HTTP 400: companyId is required
- HTTP 400: Logo is required

### Handler code

```typescript
router.post(
    '/',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    // multer must run before validateBody so the multipart text fields populate req.body.
    upload({ fieldName: 'logo' }),
    validateBody(createBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, email, status } = req.body;
      // super_admin targets any company via the body; company_admin is forced to its own.
      const companyId =
        req.user?.role === ROLES.SUPER_ADMIN ? req.body.companyId : req.user?.companyId;
      if (!companyId) {
        throw new BadRequestError('companyId is required', `module/brand/api.ts - /`);
      }
      if (!req.file) {
        throw new BadRequestError('Logo is required', `module/brand/api.ts - /`);
      }

      const { key } = await saveLocal({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        subdir: 'brands',
      });

      try {
        const item = await create({ name, email, status, companyId, logo: key });
        successResponse(res, { data: item, message: 'Brand created successfully' });
      } catch (error) {
        // Avoid orphaned files if the insert fails (e.g. duplicate name).
        await deleteLocal(key);
        throw error;
      }
    }
  )
```

## GET /api/v1/brands/:id

**Source:** `server/src/modules/brand/api.ts:116`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN, ROLES.QUERY_MANAGER),
    logRequest({}),
    async (req: Request, res: Response) => {
      const item = await getById(String(req.params.id ?? ''), getBrandScope(req.user));
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id`);
      }
      successResponse(res, { data: item });
    }
  )
```

## GET /api/v1/brands/:id/departments

**Source:** `server/src/modules/brand/api.ts:133`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/departments',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const scope = getTenantScope(req.user);
      const brand = await getById(String(req.params.id ?? ''), scope);
      if (!brand) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id/departments`);
      }
      const items = await getDepartmentsByIds(brand.departmentIds ?? [], scope);
      successResponse(res, { data: items });
    }
  )
```

## PUT /api/v1/brands/:id/departments

**Source:** `server/src/modules/brand/api.ts:155`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

### Validation declarations

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

**Body: assignDepartmentsSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const assignDepartmentsSchema = z.strictObject({
  departmentIds: z.array(idSchema),
});
```

### Error examples

- HTTP 400: One or more departments do not belong to this company

### Handler code

```typescript
router.put(
    '/:id/departments',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    validateBody(assignDepartmentsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const scope = getTenantScope(req.user);
      const brand = await getById(String(req.params.id ?? ''), scope);
      if (!brand) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id/departments`);
      }

      const { departmentIds } = req.body as { departmentIds: string[] };

      // Every assigned department must belong to the brand's own company.
      const allValid = await allDepartmentsInCompany(departmentIds, brand.companyId.toString());
      if (!allValid) {
        throw new BadRequestError(
          'One or more departments do not belong to this company',
          `module/brand/api.ts - /:id/departments`
        );
      }

      const item = await setDepartments(String(req.params.id ?? ''), departmentIds, scope);
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id/departments`);
      }
      successResponse(res, { data: item, message: 'Departments assigned successfully' });
    }
  )
```

## GET /api/v1/brands/:id/teams

**Source:** `server/src/modules/brand/api.ts:191`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant/brand visibility is still required.

**Prerequisites:** Visible brand and teams belonging to its company.

**Business logic:** GET resolves the directly granted brand.teamIds. PUT validates that every team belongs to the brand company, replaces the full teamIds array and returns the updated brand. This grants visibility; it does not assign a query.

**Implementation entry points:** `server/src/modules/brand/api.ts`

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/brands/670000000000000000000004/teams" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000020",
      "name": "Night shift",
      "status": "active",
      "departmentId": "670000000000000000000003",
      "companyId": "670000000000000000000001"
    }
  ]
}
```

- An empty teamIds array clears direct team grants; department or individual grants can still allow access.
- Brand access saves department, team and individual grant sets through three separate PUTs, not one transaction.

### Validation declarations

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/teams',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const scope = getTenantScope(req.user);
      const brand = await getById(String(req.params.id ?? ''), scope);
      if (!brand) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id/teams`);
      }
      const items = await getTeamsByIds(brand.teamIds ?? [], scope);
      successResponse(res, { data: items });
    }
  )
```

## PUT /api/v1/brands/:id/teams

**Source:** `server/src/modules/brand/api.ts:213`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant/brand visibility is still required.

**Prerequisites:** Visible brand and teams belonging to its company.

**Business logic:** GET resolves the directly granted brand.teamIds. PUT validates that every team belongs to the brand company, replaces the full teamIds array and returns the updated brand. This grants visibility; it does not assign a query.

**Implementation entry points:** `server/src/modules/brand/api.ts`

### Request example

```sh
curl -i -X PUT "${BASE_URL}/api/v1/brands/670000000000000000000004/teams" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"teamIds":["670000000000000000000020"]}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Teams assigned successfully",
  "data": {
    "_id": "670000000000000000000004",
    "teamIds": [
      "670000000000000000000020"
    ]
  }
}
```

- An empty teamIds array clears direct team grants; department or individual grants can still allow access.
- Brand access saves department, team and individual grant sets through three separate PUTs, not one transaction.

### Validation declarations

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

**Body: assignTeamsSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const assignTeamsSchema = z.strictObject({
  teamIds: z.array(idSchema),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.put(
    '/:id/teams',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    validateBody(assignTeamsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const scope = getTenantScope(req.user);
      const brand = await getById(String(req.params.id ?? ''), scope);
      if (!brand) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id/teams`);
      }

      const { teamIds } = req.body as { teamIds: string[] };

      // Every assigned team must belong to the brand's own company.
      if (!(await allTeamsInCompany(teamIds, brand.companyId))) {
        throw new BadRequestError(
          'One or more teams do not belong to this company',
          `module/brand/api.ts - /:id/teams`
        );
      }

      const item = await setTeams(String(req.params.id ?? ''), teamIds, scope);
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id/teams`);
      }
      successResponse(res, { data: item, message: 'Teams assigned successfully' });
    }
  )
```

## GET /api/v1/brands/:id/query-managers

**Source:** `server/src/modules/brand/api.ts:249`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

**Query: listQueryManagersSchema** — `server/src/modules/query-manager/validation.ts`

```typescript
export const listQueryManagersSchema = listQuerySchema.extend({
  departmentId: idSchema.optional(),
  teamId: idSchema.optional(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/query-managers',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    validateQuery(listQueryManagersSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const scope = getTenantScope(req.user);
      const brand = await getById(String(req.params.id ?? ''), scope);
      if (!brand) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id/query-managers`);
      }
      const data = await searchQueryManagersByIds(brand.queryManagerIds ?? [], req.query, scope);
      paginatedSuccessResponse(res, { data });
    }
  )
```

## PUT /api/v1/brands/:id/query-managers

**Source:** `server/src/modules/brand/api.ts:271`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

### Validation declarations

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

**Body: assignQueryManagersSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const assignQueryManagersSchema = z.strictObject({
  queryManagerIds: z.array(idSchema),
});
```

### Error examples

- HTTP 400: One or more query managers do not belong to this company

### Handler code

```typescript
router.put(
    '/:id/query-managers',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    validateBody(assignQueryManagersSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const scope = getTenantScope(req.user);
      const brand = await getById(String(req.params.id ?? ''), scope);
      if (!brand) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id/query-managers`);
      }

      const { queryManagerIds } = req.body as { queryManagerIds: string[] };

      // Every assigned query manager must belong to the brand's own company.
      const allValid = await allQueryManagersInCompany(queryManagerIds, brand.companyId.toString());
      if (!allValid) {
        throw new BadRequestError(
          'One or more query managers do not belong to this company',
          `module/brand/api.ts - /:id/query-managers`
        );
      }

      const item = await setQueryManagers(String(req.params.id ?? ''), queryManagerIds, scope);
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id/query-managers`);
      }
      successResponse(res, { data: item, message: 'Query managers assigned successfully' });
    }
  )
```

## PATCH /api/v1/brands/:id

**Source:** `server/src/modules/brand/api.ts:332`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

### Validation declarations

**Body: updateBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const updateBrandSchema = z.strictObject({
  name: z.string().min(1, NAME_REQUIRED).optional(),
  email: z.email('Invalid email').optional(),
  status: z.enum(BRAND_STATUS).optional(),
});
```

### Error examples

- HTTP 400: Invalid request body

### Handler code

```typescript
router.patch(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    upload({ fieldName: 'logo' }),
    validateBody(updateBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, email, status } = req.body;
      if (!name && !email && !status && !req.file) {
        throw new BadRequestError('Invalid request body', `module/brand/api.ts - /:id`);
      }

      const scope = getTenantScope(req.user);
      const existing = await getById(String(req.params.id ?? ''), scope);
      if (!existing) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id`);
      }

      const update: Partial<IBrand> = { name, email, status };

      let newKey: string | undefined;
      if (req.file) {
        const saved = await saveLocal({
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          subdir: 'brands',
        });
        newKey = saved.key;
        update.logo = newKey;
      }

      try {
        const item = await updateById(String(req.params.id ?? ''), update, scope);
        if (!item) {
          throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id`);
        }
        // Remove the old logo only after the update succeeded.
        if (newKey) {
          await deleteLocal(existing.logo);
        }
        successResponse(res, { data: item, message: 'Brand updated successfully' });
      } catch (error) {
        // The update failed after writing the new file — clean it up.
        if (newKey) {
          await deleteLocal(newKey);
        }
        throw error;
      }
    }
  )
```

## DELETE /api/v1/brands/:id

**Source:** `server/src/modules/brand/api.ts:387`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.delete(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const item = await deleteById(String(req.params.id ?? ''), getTenantScope(req.user));
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/brand/api.ts - /:id`);
      }
      await deleteLocal(item.logo);
      successResponse(res, { data: item, message: 'Brand deleted successfully' });
    }
  )
```

## POST /api/v1/brands/:id/facebook/connect

**Source:** `server/src/modules/brand/meta-channels.ts:123`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

### Validation declarations

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

**Body: connectFacebookSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const connectFacebookSchema = z.strictObject({
  pageId: z.string().min(1, 'pageId is required'),
  pageName: z.string().min(1, 'pageName is required'),
  userAccessToken: z.string().min(1, 'userAccessToken is required'),
});
```

### Error examples

- HTTP 400: Facebook integration is not configured on the server
- HTTP 400: This Facebook page is already connected to another brand

### Handler code

```typescript
router.post(
    '/:id/facebook/connect',
    authenticate,
    authorize(ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    validateBody(connectFacebookSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      if (!isFacebookConfigured()) {
        throw new BadRequestError(
          'Facebook integration is not configured on the server',
          `module/brand/meta-channels.ts - /:id/facebook/connect`
        );
      }

      const scope = getTenantScope(req.user);
      const brand = await getById(String(req.params.id ?? ''), scope);
      if (!brand) {
        throw new NotFoundError(
          `${model} not found`,
          `module/brand/meta-channels.ts - /:id/facebook/connect`
        );
      }

      const { pageId, pageName, userAccessToken } = req.body as {
        pageId: string;
        pageName: string;
        userAccessToken: string;
      };

      // A page can only belong to one brand at a time (unless it's already this brand's).
      const owner = await getByFacebookPageId(pageId);
      if (owner && owner.id !== brand.id) {
        throw new BadRequestError(
          'This Facebook page is already connected to another brand',
          `module/brand/meta-channels.ts - /:id/facebook/connect`
        );
      }

      // Short-lived user token -> long-lived user token -> long-lived (non-expiring) page token.
      const longLivedUserToken = await exchangeForLongLivedUserToken(userAccessToken);
      const page = await getPageAccessToken(pageId, longLivedUserToken);

      // Subscribe the page to our webhook so Meta actually delivers its messaging events, and keep
      // the verified result: a failure here shouldn't block the connect (the token is still worth
      // storing), but it must not be swallowed either — an unsubscribed page receives nothing.
      const subscription = await subscribePageToWebhook(pageId, page.accessToken);

      const item = await setFacebook(
        String(req.params.id ?? ''),
        {
          pageId,
          pageName: page.name ?? pageName,
          accessToken: page.accessToken,
          userAccessToken: longLivedUserToken,
          connected: true,
          connectedAt: new Date(),
          ...persistedSubscription(subscription, new Date()),
        },
        scope
      );
      if (!item) {
        throw new NotFoundError(
          `${model} not found`,
          `module/brand/meta-channels.ts - /:id/facebook/connect`
        );
      }
      const note = subscriptionNote(subscription);
      successResponse(res, {
        data: item,
        message: note
          ? `Facebook page connected, but ${note}`
          : 'Facebook page connected successfully',
      });
    }
  )
```

## DELETE /api/v1/brands/:id/facebook

**Source:** `server/src/modules/brand/meta-channels.ts:203`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.delete(
    '/:id/facebook',
    authenticate,
    authorize(ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const item = await clearFacebook(String(req.params.id ?? ''), getTenantScope(req.user));
      if (!item) {
        throw new NotFoundError(
          `${model} not found`,
          `module/brand/meta-channels.ts - /:id/facebook`
        );
      }
      successResponse(res, { data: item, message: 'Facebook page disconnected' });
    }
  )
```

## POST /api/v1/brands/:id/instagram/connect

**Source:** `server/src/modules/brand/meta-channels.ts:225`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

### Validation declarations

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

### Error examples

- HTTP 400: Connect a Facebook page before connecting Instagram
- HTTP 400: No Instagram Business account is linked to this Facebook page

### Handler code

```typescript
router.post(
    '/:id/instagram/connect',
    authenticate,
    authorize(ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const scope = getTenantScope(req.user);
      const brand = await getById(String(req.params.id ?? ''), scope);
      if (!brand) {
        throw new NotFoundError(
          `${model} not found`,
          `module/brand/meta-channels.ts - /:id/instagram/connect`
        );
      }
      if (!brand.facebook?.connected || !brand.facebook.pageId || !brand.facebook.accessToken) {
        throw new BadRequestError(
          'Connect a Facebook page before connecting Instagram',
          `module/brand/meta-channels.ts - /:id/instagram/connect`
        );
      }

      const account = await getInstagramBusinessAccount(
        brand.facebook.pageId,
        brand.facebook.accessToken
      );
      if (!account) {
        throw new BadRequestError(
          'No Instagram Business account is linked to this Facebook page',
          `module/brand/meta-channels.ts - /:id/instagram/connect`
        );
      }

      // No webhook subscription step, and that is not an omission. Instagram webhooks cannot be
      // subscribed through any API in this flow — Meta's Page reference: "You must use your app
      // dashboard to subscribe to Instagram Webhooks", and the app-level `/{app-id}/subscriptions`
      // edge says the same. Delivery comes from two places, neither of them here: the `instagram`
      // object subscribed in the App Dashboard (once per app, by hand) and this app being installed
      // on the linked Page (done at `/facebook/connect`).
      //
      // So this endpoint's job is only to tell US which Instagram account belongs to which brand,
      // so the webhook handler can route an incoming `entry.id` through `getByInstagramAccountId`.
      const item = await setInstagram(
        String(req.params.id ?? ''),
        {
          accountId: account.id,
          username: account.username,
          // Instagram messaging/comments use the page access token.
          accessToken: brand.facebook.accessToken,
          connected: true,
          connectedAt: new Date(),
        },
        scope
      );
      if (!item) {
        throw new NotFoundError(
          `${model} not found`,
          `module/brand/meta-channels.ts - /:id/instagram/connect`
        );
      }
      successResponse(res, { data: item, message: 'Instagram connected successfully' });
    }
  )
```

## DELETE /api/v1/brands/:id/instagram

**Source:** `server/src/modules/brand/meta-channels.ts:292`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.delete(
    '/:id/instagram',
    authenticate,
    authorize(ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const item = await clearInstagram(String(req.params.id ?? ''), getTenantScope(req.user));
      if (!item) {
        throw new NotFoundError(
          `${model} not found`,
          `module/brand/meta-channels.ts - /:id/instagram`
        );
      }
      successResponse(res, { data: item, message: 'Instagram disconnected' });
    }
  )
```

## GET /api/v1/brands/:id/instagram/login-url

**Source:** `server/src/modules/brand/meta-channels.ts:316`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

### Validation declarations

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

### Error examples

- HTTP 400: Instagram Login is not configured on the server

### Handler code

```typescript
router.get(
    '/:id/instagram/login-url',
    authenticate,
    authorize(ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      if (!igLogin.isConfigured()) {
        throw new BadRequestError(
          'Instagram Login is not configured on the server',
          `module/brand/meta-channels.ts - /:id/instagram/login-url`
        );
      }
      const scope = getTenantScope(req.user);
      const brand = await getById(String(req.params.id ?? ''), scope);
      if (!brand) {
        throw new NotFoundError(
          `${model} not found`,
          `module/brand/meta-channels.ts - /:id/instagram/login-url`
        );
      }
      const state = signOAuthState({ brandId: brand.id, companyId: brand.companyId?.toString() });
      const url = igLogin.getAuthorizationUrl(state);
      successResponse(res, { data: { url }, message: 'Instagram login URL generated' });
    }
  )
```

## GET /api/v1/brands/instagram/oauth/callback

**Source:** `server/src/modules/brand/meta-channels.ts:348`

**Access:** Signed state from the login-url flow; no JWT required.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get('/instagram/oauth/callback', logRequest({}), handleInstagramOAuthCallback)
```

## GET /api/v1/brands/:id/tags

**Source:** `server/src/modules/brand/tags/api.ts:89`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: brandIdParamsSchema** — `server/src/modules/brand/tags/validation.ts`

```typescript
export const brandIdParamsSchema = z.object({
  id: idSchema,
});
```

**Query: listTagsSchema** — `server/src/modules/brand/tags/validation.ts`

```typescript
export const listTagsSchema = z.object({
  includeArchived: z.enum(['true', 'false']).optional(),
  // Narrow the vocabulary by path prefix, so a brand with thousands of tags doesn't have to ship
  // all of them for the picker to filter in the browser.
  search: z.string().trim().min(1).max(80).optional(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/tags',
    authenticate,
    authorize(...tagRoles),
    validateParams(brandIdParamsSchema),
    validateQuery(listTagsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await requireVisibleBrand(req, `module/brand/tags/api.ts - /:id/tags`);
      const { includeArchived, search } = req.query as ListTagsQuery;
      const tags = await listTags(brand._id as Types.ObjectId, {
        includeArchived: includeArchived === 'true',
        search,
      });
      successResponse(res, { data: toClientTags(tags) });
    }
  )
```

## POST /api/v1/brands/:id/tags

**Source:** `server/src/modules/brand/tags/api.ts:114`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: brandIdParamsSchema** — `server/src/modules/brand/tags/validation.ts`

```typescript
export const brandIdParamsSchema = z.object({
  id: idSchema,
});
```

**Body: createTagSchema** — `server/src/modules/brand/tags/validation.ts`

```typescript
export const createTagSchema = z.strictObject({
  name: z.string().trim().min(1, 'Tag name is required').max(80, 'Tag name is too long'),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post(
    '/:id/tags',
    authenticate,
    authorize(...tagRoles),
    validateParams(brandIdParamsSchema),
    validateBody(createTagSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await requireVisibleBrand(req, `module/brand/tags/api.ts - /:id/tags`);
      const { name } = req.body as { name: string };
      const created = await addTag(brand._id as Types.ObjectId, brand.companyId, name);

      const tags = await listTags(brand._id as Types.ObjectId);
      successResponse(res, {
        data: { created: toClientTag(created), tags: toClientTags(tags) },
        message: 'Tag added successfully',
      });
    }
  )
```

## PATCH /api/v1/brands/:id/tags/:tagId

**Source:** `server/src/modules/brand/tags/api.ts:141`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: tagParamsSchema** — `server/src/modules/brand/tags/validation.ts`

```typescript
export const tagParamsSchema = z.object({
  id: idSchema,
  tagId: idSchema,
});
```

**Body: renameTagSchema** — `server/src/modules/brand/tags/validation.ts`

```typescript
export const renameTagSchema = createTagSchema;
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.patch(
    '/:id/tags/:tagId',
    authenticate,
    authorize(...curateRoles),
    validateParams(tagParamsSchema),
    validateBody(renameTagSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const comingFrom = `module/brand/tags/api.ts - /:id/tags/:tagId`;
      const brand = await requireVisibleBrand(req, comingFrom);
      const brandId = brand._id as Types.ObjectId;
      const { name } = req.body as RenameTagInput;

      await renameTag(brandId, String(req.params.tagId ?? ''), name);
      emitTagsUpdated(brandId);

      const tags = await listTags(brandId);
      successResponse(res, { data: toClientTags(tags), message: 'Tag renamed' });
    }
  )
```

## PATCH /api/v1/brands/:id/tags/:tagId/archive

**Source:** `server/src/modules/brand/tags/api.ts:166`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: tagParamsSchema** — `server/src/modules/brand/tags/validation.ts`

```typescript
export const tagParamsSchema = z.object({
  id: idSchema,
  tagId: idSchema,
});
```

**Body: archiveTagSchema** — `server/src/modules/brand/tags/validation.ts`

```typescript
export const archiveTagSchema = z.strictObject({
  archived: z.boolean(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.patch(
    '/:id/tags/:tagId/archive',
    authenticate,
    authorize(...curateRoles),
    validateParams(tagParamsSchema),
    validateBody(archiveTagSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const comingFrom = `module/brand/tags/api.ts - /:id/tags/:tagId/archive`;
      const brand = await requireVisibleBrand(req, comingFrom);
      const brandId = brand._id as Types.ObjectId;
      const { archived } = req.body as ArchiveTagInput;

      await setTagArchived(brandId, String(req.params.tagId ?? ''), archived);
      emitTagsUpdated(brandId);

      const tags = await listTags(brandId, { includeArchived: true });
      successResponse(res, {
        data: toClientTags(tags),
        message: archived ? 'Tag archived' : 'Tag restored',
      });
    }
  )
```

## GET /api/v1/brands/:id/whatsapp/templates

**Source:** `server/src/modules/brand/whatsapp-templates.ts:128`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/whatsapp/templates',
    authenticate,
    authorize(...MANAGE_ROLES),
    validateParams(deleteBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { wabaId, token } = await requireConnectedBrand(req);
      const templates = await cloudApi.listAllMessageTemplates(wabaId, token);

      successResponse(res, { data: { templates }, message: 'Templates fetched' });
    }
  )
```

## POST /api/v1/brands/:id/whatsapp/templates

**Source:** `server/src/modules/brand/whatsapp-templates.ts:148`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

**Body: whatsAppTemplateDraftSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const whatsAppTemplateDraftSchema = z.strictObject({
  // Meta's own rule, and it is unforgiving: lowercase letters, digits and underscores, nothing else.
  // Enforced here rather than silently slugified, because the name is the template's identity and a
  // name the admin did not type is a name they cannot find again.
  name: z
    .string()
    .min(1, NAME_REQUIRED)
    .max(WA_LIMITS.name)
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only'),
  // Language AND locale, e.g. 'en_US' or 'pt_BR'. Half of the template's identity — sends match on
  // (name, language) with no fallback, so 'en' will never resolve an 'en_US' template.
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

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post(
    '/:id/whatsapp/templates',
    authenticate,
    authorize(...MANAGE_ROLES),
    validateParams(deleteBrandSchema),
    validateBody(whatsAppTemplateDraftSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { wabaId, token } = await requireConnectedBrand(req);
      const draft = draftFromBody(req.body);
      assertDraftIsValid(draft);

      const created = await cloudApi.createMessageTemplate(wabaId, token, draft);
      // A PENDING template is not sendable, so this cannot affect the picker today — but it will the
      // moment Meta approves it, and invalidating on every write is the rule that has no exceptions
      // to remember.
      invalidateTemplates(wabaId);

      logger.info('createTemplate(): template submitted', {
        brandId: String(req.params.id ?? ''),
        name: draft.name,
        language: draft.language,
        requested: draft.category,
        assigned: created.category,
      });

      successResponse(res, {
        statusCode: 201,
        data: created,
        message:
          created.category === draft.category
            ? 'Template submitted for approval'
            : `Template submitted for approval. WhatsApp filed it under ${created.category} rather than ${draft.category}, which is what it will be billed as.`,
      });
    }
  )
```

## POST /api/v1/brands/:id/whatsapp/templates/:templateId

**Source:** `server/src/modules/brand/whatsapp-templates.ts:191`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: whatsAppTemplateParamsSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const whatsAppTemplateParamsSchema = z.object({
  id: idSchema,
  templateId: z.string().regex(/^\d+$/, 'Invalid template id'),
});
```

**Body: whatsAppTemplateDraftSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const whatsAppTemplateDraftSchema = z.strictObject({
  // Meta's own rule, and it is unforgiving: lowercase letters, digits and underscores, nothing else.
  // Enforced here rather than silently slugified, because the name is the template's identity and a
  // name the admin did not type is a name they cannot find again.
  name: z
    .string()
    .min(1, NAME_REQUIRED)
    .max(WA_LIMITS.name)
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only'),
  // Language AND locale, e.g. 'en_US' or 'pt_BR'. Half of the template's identity — sends match on
  // (name, language) with no fallback, so 'en' will never resolve an 'en_US' template.
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

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post(
    '/:id/whatsapp/templates/:templateId',
    authenticate,
    authorize(...MANAGE_ROLES),
    validateParams(whatsAppTemplateParamsSchema),
    validateBody(whatsAppTemplateDraftSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { wabaId, token } = await requireConnectedBrand(req);
      const templateId = String(req.params.templateId ?? '');
      const existing = await requireTemplate(wabaId, token, templateId);

      if (!cloudApi.isEditableStatus(existing.status)) {
        // Graph would say the same thing with code 2388039, but only after a round-trip and without
        // naming the status the admin is actually looking at.
        throw new BadRequestError(
          `This template cannot be edited while it is ${existing.status}. Only approved and rejected templates can be changed.`,
          comingFrom
        );
      }

      // The identity fields are Meta's, not the client's: a body claiming a different name or
      // language would otherwise look like it had been applied when Graph silently ignored it.
      const draft = {
        ...draftFromBody(req.body),
        name: existing.name,
        language: existing.language,
      };
      assertDraftIsValid(draft);

      await cloudApi.updateMessageTemplate(templateId, token, draft);
      // This one matters: the template was APPROVED a moment ago and is now back in review, so the
      // cached picker list is holding something agents must stop sending.
      invalidateTemplates(wabaId);

      successResponse(res, {
        data: { id: templateId },
        message: 'Template updated and sent back to WhatsApp for review',
      });
    }
  )
```

## DELETE /api/v1/brands/:id/whatsapp/templates/:templateId

**Source:** `server/src/modules/brand/whatsapp-templates.ts:238`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: whatsAppTemplateParamsSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const whatsAppTemplateParamsSchema = z.object({
  id: idSchema,
  templateId: z.string().regex(/^\d+$/, 'Invalid template id'),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.delete(
    '/:id/whatsapp/templates/:templateId',
    authenticate,
    authorize(...MANAGE_ROLES),
    validateParams(whatsAppTemplateParamsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { wabaId, token } = await requireConnectedBrand(req);
      const templateId = String(req.params.templateId ?? '');
      // Resolves the name the delete has to carry, and proves the template is this brand's.
      const existing = await requireTemplate(wabaId, token, templateId);

      await cloudApi.deleteMessageTemplate(wabaId, token, {
        id: existing.id,
        name: existing.name,
      });
      invalidateTemplates(wabaId);

      logger.info('deleteTemplate(): template deleted', {
        brandId: String(req.params.id ?? ''),
        name: existing.name,
        language: existing.language,
      });

      successResponse(res, { data: { id: templateId }, message: 'Template deleted' });
    }
  )
```

## POST /api/v1/brands/:id/whatsapp/connect

**Source:** `server/src/modules/brand/whatsapp.ts:128`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

### Validation declarations

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

**Body: connectWhatsAppSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const connectWhatsAppSchema = z.strictObject({
  code: z.string().min(1, 'code is required'),
  wabaId: z.string().min(1, 'wabaId is required'),
  phoneNumberId: z.string().min(1, 'phoneNumberId is required'),
});
```

### Error examples

- HTTP 400: WhatsApp integration is not configured on the server

### Handler code

```typescript
router.post(
    '/:id/whatsapp/connect',
    authenticate,
    authorize(ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    validateBody(connectWhatsAppSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      if (!cloudApi.isConfigured()) {
        throw new BadRequestError(
          'WhatsApp integration is not configured on the server',
          comingFrom
        );
      }

      const id = String(req.params.id ?? '');
      const scope = getTenantScope(req.user);
      const brand = await getById(id, scope);
      if (!brand) {
        throw new NotFoundError(`${model} not found`, comingFrom);
      }

      const { code, wabaId, phoneNumberId } = req.body as {
        code: string;
        wabaId: string;
        phoneNumberId: string;
      };

      // First — the code expires ~30 seconds after the client's FB.login callback fired.
      const accessToken = await cloudApi.exchangeCodeForBusinessToken(code);

      // `wabaId` and `phoneNumberId` came from a browser postMessage, so treat them as untrusted.
      // Reading the phone number IS the authorization check: the call only succeeds if the token we
      // just exchanged is scoped to this number, and the subscribe below is the same check for the
      // WABA. Both must stay ahead of the write — this is not a cosmetic metadata fetch.
      const phone = await cloudApi.getPhoneNumber(phoneNumberId, accessToken);

      // Blocking, unlike the best-effort page/Instagram subscriptions: without it Meta delivers no
      // webhooks for this WABA, leaving a connection that looks healthy and hears nothing.
      await cloudApi.subscribeAppToWaba(wabaId, accessToken);

      // The step that moves the number off PENDING in WhatsApp Manager. Non-fatal — see above.
      const { registered, registrationPin } = await registerNumber(
        brand.whatsapp,
        phoneNumberId,
        accessToken,
        phone.status === 'CONNECTED'
      );

      const item = await persistConnection(
        id,
        brand.id,
        {
          wabaId,
          phoneNumberId,
          displayPhoneNumber: phone.displayPhoneNumber,
          verifiedName: phone.verifiedName,
          accessToken,
          registered,
          registrationPin,
        },
        scope
      );
      successResponse(res, {
        data: item,
        message: registered ? 'WhatsApp connected successfully' : PENDING_MSG,
      });
    }
  )
```

## POST /api/v1/brands/:id/whatsapp/connect-manual

**Source:** `server/src/modules/brand/whatsapp.ts:205`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

### Validation declarations

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

**Body: manualConnectWhatsAppSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const manualConnectWhatsAppSchema = z.strictObject({
  wabaId: z.string().min(1, 'wabaId is required'),
  phoneNumberId: z.string().min(1, 'phoneNumberId is required'),
  accessToken: z.string().min(1, 'accessToken is required'),
});
```

### Error examples

- HTTP 404: Not found

### Handler code

```typescript
router.post(
    '/:id/whatsapp/connect-manual',
    authenticate,
    authorize(ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    validateBody(manualConnectWhatsAppSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      if (!configs.WHATSAPP_ALLOW_MANUAL_CONNECT) {
        throw new NotFoundError('Not found', comingFrom);
      }

      const id = String(req.params.id ?? '');
      const scope = getTenantScope(req.user);
      const brand = await getById(id, scope);
      if (!brand) {
        throw new NotFoundError(`${model} not found`, comingFrom);
      }

      const { wabaId, phoneNumberId, accessToken } = req.body as {
        wabaId: string;
        phoneNumberId: string;
        accessToken: string;
      };

      // Same read as the Embedded Signup path, and for the same reason: it proves the pasted token
      // is actually scoped to this number before we store anything. A typo'd id fails here.
      const phone = await cloudApi.getPhoneNumber(phoneNumberId, accessToken);

      // Best-effort here, unlike the Embedded Signup path. The test WABA belongs to our own app and
      // is already subscribed via the dashboard's webhook configuration, so this call is usually
      // redundant and sometimes rejected — not a reason to fail the connect.
      const subscribed = await cloudApi.trySubscribeAppToWaba(wabaId, accessToken);

      // The app's test number arrives already registered, so this is normally the CONNECTED
      // short-circuit rather than a real /register call.
      const { registered, registrationPin } = await registerNumber(
        brand.whatsapp,
        phoneNumberId,
        accessToken,
        phone.status === 'CONNECTED'
      );

      const item = await persistConnection(
        id,
        brand.id,
        {
          wabaId,
          phoneNumberId,
          displayPhoneNumber: phone.displayPhoneNumber,
          verifiedName: phone.verifiedName,
          accessToken,
          registered,
          registrationPin,
        },
        scope
      );

      logger.warn('connect-manual(): WhatsApp connected via the development bypass', {
        id,
        phoneNumberId,
        subscribed,
        registered,
      });
      successResponse(res, {
        data: item,
        message: subscribed
          ? 'WhatsApp connected (development bypass)'
          : 'WhatsApp connected (development bypass). The WABA subscription call did not succeed — check the webhook configuration in the App Dashboard if messages do not arrive.',
      });
    }
  )
```

## POST /api/v1/brands/:id/whatsapp/register

**Source:** `server/src/modules/brand/whatsapp.ts:284`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post(
    '/:id/whatsapp/register',
    authenticate,
    authorize(ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      const scope = getTenantScope(req.user);
      const brand = await getById(id, scope);
      if (!brand) {
        throw new NotFoundError(`${model} not found`, comingFrom);
      }

      const wa = brand.whatsapp;
      if (!wa?.connected || !wa.phoneNumberId || !wa.accessToken) {
        throw new BadRequestError(NOT_CONNECTED_MSG, comingFrom);
      }

      // Read the live status first: the number may have been registered elsewhere since we stored
      // it, and this also catches a token revoked in the meantime before we report success.
      const phone = await cloudApi.getPhoneNumber(wa.phoneNumberId, wa.accessToken);

      const { registered, registrationPin, error } = await registerNumber(
        wa,
        wa.phoneNumberId,
        wa.accessToken,
        phone.status === 'CONNECTED'
      );

      // Field by field rather than a spread: `brand.whatsapp` is a Mongoose subdocument, and
      // spreading one carries its internals ($__, _doc) into the update.
      const item = await setWhatsApp(
        id,
        {
          wabaId: wa.wabaId,
          phoneNumberId: wa.phoneNumberId,
          // Refreshed while we were here — the display name in particular changes when Meta
          // approves it, and this is the only place that re-reads it after connect.
          displayPhoneNumber: phone.displayPhoneNumber,
          verifiedName: phone.verifiedName,
          accessToken: wa.accessToken,
          registered,
          registrationPin: registrationPin ?? wa.registrationPin,
          connected: wa.connected,
          connectedAt: wa.connectedAt,
        },
        scope
      );
      if (!item) {
        throw new NotFoundError(`${model} not found`, comingFrom);
      }

      // Graph's own text is the only thing that says WHY — surface it rather than a generic retry
      // message the admin can do nothing with.
      const reason = error ?? `the number is ${phone.status || 'not ready'}`;
      successResponse(res, {
        data: item,
        message: registered
          ? 'WhatsApp number registered and ready to send'
          : `Registration still failing: ${reason}`,
      });
    }
  )
```

## DELETE /api/v1/brands/:id/whatsapp

**Source:** `server/src/modules/brand/whatsapp.ts:352`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: company_owner, company_admin.

**Prerequisites:** Company and identity. Department/agent assignment additionally needs those records; social connection needs provider credentials and the selected brand.

**Business logic:** Brand departmentIds, teamIds and queryManagerIds grant alternative visibility paths inside the tenant scope. Provider identifiers and secrets live in channel subdocuments. Connections, provider templates and tags have different prerequisites: local tags need only a visible brand, while provider calls need a connected operational channel. Archived tags preserve existing references.

**Implementation entry points:** `server/src/modules/brand/service.ts; brand/assignees.ts; brand/channel-access.ts; brand/tags/service.ts; auth/tenant.ts`

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

**Params: deleteBrandSchema** — `server/src/modules/brand/validation.ts`

```typescript
export const deleteBrandSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.delete(
    '/:id/whatsapp',
    authenticate,
    authorize(ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteBrandSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      const scope = getTenantScope(req.user);
      const brand = await getById(id, scope);
      if (!brand) {
        throw new NotFoundError(`${model} not found`, comingFrom);
      }

      // Stop receiving events for a WABA we no longer serve — otherwise we keep ingesting messages
      // for a former client. Skipped when another brand still holds a number under the same WABA,
      // because the subscription is WABA-scoped and would take theirs down too. Best-effort by
      // design (see unsubscribeAppFromWaba), and before clearWhatsApp, which drops the token.
      const wa = brand.whatsapp;
      if (wa?.wabaId && wa.accessToken && !(await otherBrandHasWaba(wa.wabaId, id))) {
        await cloudApi.unsubscribeAppFromWaba(wa.wabaId, wa.accessToken);
      }

      const item = await clearWhatsApp(id, scope);
      if (!item) {
        throw new NotFoundError(`${model} not found`, comingFrom);
      }
      successResponse(res, { data: item, message: 'WhatsApp disconnected' });
    }
  )
```

## GET /api/v1/comments

**Source:** `server/src/modules/comment/api.ts:168`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** Provider parentCommentId joins replies to a root within brand/post scope. The root owns thread status and SLA. Page replies end hold, and root-author replies reopen unresolved roots. Resolved roots do not automatically reopen. Replies, hiding, liking and deletion can call the provider; local wrap-up and classification update domain state. Reading history using a reply ID resolves the root first.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.
- mine=true includes personal work and own department/team pools. Pool membership is read from User, while brand visibility still follows token claims until refresh.

### Validation declarations

**Query: listCommentsSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const listCommentsSchema = cursorPaginationQuerySchema.extend({
  brandId: idSchema,
  platform: z.enum(COMMENT_PLATFORMS).optional(),
  status: z.enum(COMMENT_STATUSES).optional(),
  sentiment: z.enum(COMMENT_SENTIMENTS).optional(),
  // "Assigned to me" — narrows to comments assigned to the caller or their department. The ids are
  // resolved from the auth token in the API layer, so the client just sends the flag.
  mine: z.enum(['true', 'false']).optional(),
  // Narrow to a single post — its platform post/media id (what comments store as `platformPostId`).
  // Not a Mongo id, so a plain non-empty string.
  postId: z.string().trim().min(1).optional(),
  // Narrow to threads carrying at least one of these brand tags. Arrives as a comma-separated list
  // of ids (`tagIds=a,b`) since it rides in the query string; empty/absent means "any tag".
  tagIds: z
    .string()
    .trim()
    .optional()
    .transform(v => (v ? v.split(',').filter(Boolean) : undefined))
    .pipe(z.array(idSchema).max(MAX_TAGS_PER_RECORD).optional()),
});
```

### Error examples

- HTTP 404: Brand not found

### Handler code

```typescript
router.get(
    '/',
    authenticate,
    authorize(...READ_ROLES),
    validateQuery(listCommentsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { brandId, platform, status, sentiment, mine, postId, tagIds, cursor, limit } =
        req.query as unknown as ListCommentsQuery;
      // Confirm the caller may see this brand before returning any of its comments.
      const brand = await getBrandById(String(brandId), getBrandScope(req.user));
      if (!brand) {
        throw new NotFoundError('Brand not found', `${comingFrom} - GET /`);
      }
      // "Assigned to me" → held by the caller, or pooled on their department or team.
      const assigneeIds =
        mine === 'true' ? await assignedToMeIds(req.user as Express.User) : undefined;
      const data = await listCommentThreads(String(brandId), {
        platform,
        status,
        sentiment,
        assigneeIds,
        postId,
        // Filtering by a parent tag means "and everything under it" — picking `complaint` returns
        // `complaint/billing` threads too, so a level isn't a dead end just because agents tag deeper.
        tagIds: tagIds?.length ? await expandTagIdsToSubtrees(brand._id, tagIds) : undefined,
        cursor,
        limit,
      });
      paginatedSuccessResponse(res, { data });
    }
  )
```

## GET /api/v1/comments/posts

**Source:** `server/src/modules/comment/api.ts:208`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** Provider parentCommentId joins replies to a root within brand/post scope. The root owns thread status and SLA. Page replies end hold, and root-author replies reopen unresolved roots. Resolved roots do not automatically reopen. Replies, hiding, liking and deletion can call the provider; local wrap-up and classification update domain state. Reading history using a reply ID resolves the root first.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Query: commentPostsSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentPostsSchema = z.object({
  brandId: idSchema,
  platform: z.enum(COMMENT_PLATFORMS),
  after: z.string().trim().min(1).optional(),
});
```

### Error examples

- HTTP 404: Brand not found

### Handler code

```typescript
router.get(
    '/posts',
    authenticate,
    authorize(...READ_ROLES),
    validateQuery(commentPostsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { brandId, platform, after } = req.query as CommentPostsQuery;
      const brand = await getBrandById(String(brandId), getBrandScope(req.user));
      if (!brand) {
        throw new NotFoundError('Brand not found', `${comingFrom} - GET /posts`);
      }

      let result: PagePostsResult = { posts: [] };
      if (platform === 'facebook' && brand.facebook?.connected && brand.facebook.accessToken) {
        result = await listFacebookPagePosts(
          brand.facebook.pageId,
          brand.facebook.accessToken,
          after
        );
      } else if (
        platform === 'instagram' &&
        brand.instagram?.connected &&
        brand.instagram.accessToken
      ) {
        result = await listInstagramMedia(
          brand.instagram.accountId,
          brand.instagram.accessToken,
          after
        );
      }

      const posts = result.posts.map(p => ({ ...p, platform }));
      successResponse(res, { data: { posts, after: result.after ?? null } });
    }
  )
```

## GET /api/v1/comments/:id

**Source:** `server/src/modules/comment/api.ts:249`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** Provider parentCommentId joins replies to a root within brand/post scope. The root owns thread status and SLA. Page replies end hold, and root-author replies reopen unresolved roots. Resolved roots do not automatically reopen. Replies, hiding, liking and deletion can call the provider; local wrap-up and classification update domain state. Reading history using a reply ID resolves the root first.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(commentIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      // Confirm the caller may see this comment's brand before returning the thread.
      await ensureVisibleComment(id, req.user);
      const thread = await getCommentThread(id);
      if (!thread) {
        throw new NotFoundError(`${model} not found`, `${comingFrom} - GET /:id`);
      }
      successResponse(res, { data: thread });
    }
  )
```

## POST /api/v1/comments/:id/replies

**Source:** `server/src/modules/comment/api.ts:271`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** Provider parentCommentId joins replies to a root within brand/post scope. The root owns thread status and SLA. Page replies end hold, and root-author replies reopen unresolved roots. Resolved roots do not automatically reopen. Replies, hiding, liking and deletion can call the provider; local wrap-up and classification update domain state. Reading history using a reply ID resolves the root first.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

**Body: replyCommentSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const replyCommentSchema = z.strictObject({
  text: z.string().trim().min(1, 'Reply text is required').max(8000, 'Reply is too long'),
});
```

### Error examples

- HTTP 400: This comment can no longer be replied to

### Handler code

```typescript
router.post(
    '/:id/replies',
    markInitiated,
    authenticate,
    authorize(...READ_ROLES),
    validateParams(commentIdSchema),
    validateBody(replyCommentSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { comment, pageId, pageName, accessToken } = await ensureReplyableComment(
        String(req.params.id ?? ''),
        req.user
      );
      if (!comment.commentId) {
        throw new BadRequestError('This comment can no longer be replied to', comingFrom);
      }

      const { text } = req.body as { text: string };

      // Facebook/Instagram threads are two levels deep: replying to a reply posts under the same
      // top-level comment, not a third level. Target that top-level comment — the comment itself
      // when it's top-level, otherwise its parent (which the platform would re-parent to anyway).
      const parentCommentId = comment.parentCommentId ?? comment.commentId;

      // Post first; only persist once Graph accepts it, so the thread never shows a reply that
      // wasn't actually published. The echoed webhook folds into this row by commentId.
      const sent = await replyToComment(comment.platform, parentCommentId, accessToken, text);
      const reply = await recordOutgoingComment({
        brandId: comment.brandId,
        companyId: comment.companyId,
        platform: comment.platform,
        // Post context copied from the comment we're replying under (no Post collection).
        pageId: comment.pageId,
        platformPostId: comment.platformPostId,
        permalinkUrl: comment.permalinkUrl,
        commentId: sent.commentId,
        parentCommentId,
        authorId: pageId,
        authorName: pageName,
        senderUserId: req.user?.id,
        text,
        commentedAt: new Date(),
        initiatedAt: res.locals.initiatedAt as Date,
      });

      successResponse(res, { statusCode: 201, data: reply, message: 'Reply posted' });
    }
  )
```

## GET /api/v1/comments/:id/status-log

**Source:** `server/src/modules/comment/api.ts:334`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant and brand visibility checks still apply.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** After manager-role and record-visibility checks, explicitly read the hidden statusLog and resolve actor names. Comment replies resolve to their thread root. Return oldest first; unknown actors/reasons are null and deleted users retain their ID with name null.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

### Request example

```sh
curl -i "${BASE_URL}/api/v1/comments/670000000000000000000008/status-log" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "status": "hold",
      "at": "2026-10-17T04:10:00.000Z",
      "cause": "agent",
      "by": {
        "id": "670000000000000000000002",
        "name": "Amina Rahman",
        "role": "company_admin"
      },
      "reason": "Waiting for warehouse confirmation"
    },
    {
      "status": "pending",
      "at": "2026-10-17T04:40:00.000Z",
      "cause": "reply",
      "by": {
        "id": "670000000000000000000002",
        "name": "Amina Rahman",
        "role": "company_admin"
      },
      "reason": null
    }
  ]
}
```

- History is oldest first; no history returns an empty array.
- by is null for an unknown actor; a deleted user retains id with name null. Missing reason is null.
- A reply ID resolves to the thread root before reading history.
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.
- Shared history handler: status-log selects the corresponding reader in ROOT_HISTORIES; a comment reply ID resolves to its root.
- Named actors now include role, resolved at read time with the current name. Deleted users retain id with name and role null; neither field is a historical snapshot.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

- HTTP 403: You do not have permission to access this resource

### Handler code

```typescript
router.get(
      `/:id/${path}`,
      authenticate,
      authorize(...MANAGER_ROLES),
      validateParams(commentIdSchema),
      logRequest({}),
      async (req: Request, res: Response) => {
        const id = String(req.params.id ?? '');
        await ensureVisibleComment(id, req.user);
        const comment = await getCommentById(id);
        const root = comment && (await getThreadRoot(comment));
        successResponse(res, { data: root ? await readHistory(root._id as Types.ObjectId) : [] });
      }
    )
```

## GET /api/v1/comments/:id/assignment-log

**Source:** `server/src/modules/comment/api.ts:334`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant/brand visibility still applies. Query managers receive 403.

**Prerequisites:** Company, brand visibility and eligible organizational membership.

**Business logic:** Explicitly read the hidden assignmentLog from the visible session or comment root, resolve actors and return oldest first. Assignee names are stored snapshots, actor name/role are current read-time labels; cleared assignments are null.

**Implementation entry points:** `server/src/modules/session/status-history.ts:readAssignmentLog, namedAssignmentLog`

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/comments/670000000000000000000008/assignment-log" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "assignee": {
        "kind": "team",
        "id": "670000000000000000000020",
        "name": "Night shift"
      },
      "at": "2026-10-19T04:15:00.000Z",
      "cause": "forwarded",
      "by": {
        "id": "670000000000000000000002",
        "name": "Amina Rahman",
        "role": "query_manager"
      },
      "note": "Please check the warehouse delivery update"
    }
  ]
}
```

- Shared history handler: assignment-log selects the corresponding reader in ROOT_HISTORIES; a comment reply ID resolves to its root.
- Causes are routed, claimed or forwarded. Missing actor/note is null. Empty history returns [].
- This is an embedded history, not a separate collection or a reconstruction of all legacy assignments. Comment reply IDs resolve to their root.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
      `/:id/${path}`,
      authenticate,
      authorize(...MANAGER_ROLES),
      validateParams(commentIdSchema),
      logRequest({}),
      async (req: Request, res: Response) => {
        const id = String(req.params.id ?? '');
        await ensureVisibleComment(id, req.user);
        const comment = await getCommentById(id);
        const root = comment && (await getThreadRoot(comment));
        successResponse(res, { data: root ? await readHistory(root._id as Types.ObjectId) : [] });
      }
    )
```

## GET /api/v1/comments/:id/wrap-up-log

**Source:** `server/src/modules/comment/api.ts:334`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant/brand visibility still applies. Query managers receive 403.

**Prerequisites:** Company, brand visibility and eligible organizational membership.

**Business logic:** Read hidden wrapUpLog and resolve actors plus current tag names. Return oldest-first entries containing before/after changes for sentiment, tags, summary and sessionType (sessions only). Status changes are read through status-log.

**Implementation entry points:** `server/src/modules/session/wrap-up-log.ts; server/src/modules/session/status-history.ts:readWrapUpLog, namedWrapUpLog`

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/comments/670000000000000000000008/wrap-up-log" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "at": "2026-10-19T04:20:00.000Z",
      "by": {
        "id": "670000000000000000000002",
        "name": "Amina Rahman",
        "role": "query_manager"
      },
      "changes": [
        {
          "field": "sentiment",
          "from": "NEUTRAL",
          "to": "POSITIVE"
        },
        {
          "field": "resolutionSummary",
          "from": null,
          "to": "Confirmed the delivery update"
        }
      ]
    }
  ]
}
```

- Shared history handler: wrap-up-log selects the corresponding reader in ROOT_HISTORIES; a comment reply ID resolves to its root.
- Missing scalar values become null; missing tags become []. Tag changes return current names, with Deleted tag for a missing ID.
- Actor name and role are current labels. The history records actual edits, including standalone tag/sentiment changes, not just pressing the wrap-up button.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
      `/:id/${path}`,
      authenticate,
      authorize(...MANAGER_ROLES),
      validateParams(commentIdSchema),
      logRequest({}),
      async (req: Request, res: Response) => {
        const id = String(req.params.id ?? '');
        await ensureVisibleComment(id, req.user);
        const comment = await getCommentById(id);
        const root = comment && (await getThreadRoot(comment));
        successResponse(res, { data: root ? await readHistory(root._id as Types.ObjectId) : [] });
      }
    )
```

## PATCH /api/v1/comments/:id

**Source:** `server/src/modules/comment/api.ts:353`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** Provider parentCommentId joins replies to a root within brand/post scope. The root owns thread status and SLA. Page replies end hold, and root-author replies reopen unresolved roots. Resolved roots do not automatically reopen. Replies, hiding, liking and deletion can call the provider; local wrap-up and classification update domain state. Reading history using a reply ID resolves the root first.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

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
- Optional reason is trimmed and limited to 500 characters. Only a real status transition appends a log; re-saving the same status does not replace its reason.
- hold, unresolved and resolved stop resolution time. First-response time is independent of these pauses.
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

**Body: updateCommentSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const updateCommentSchema = z
  .strictObject({
    status: z.enum(COMMENT_STATUSES).optional(),
    sentiment: z.enum(COMMENT_SENTIMENTS).optional(),
    reason: statusReasonSchema,
  })
  .refine(v => v.status !== undefined || v.sentiment !== undefined, {
    message: 'Provide a status or sentiment to update',
  });
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.patch(
    '/:id',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(commentIdSchema),
    validateBody(updateCommentSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      await ensureActionableComment(id, req.user);

      const { status, sentiment, reason } = req.body as {
        status?: 'pending' | 'resolved';
        sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
        reason?: string;
      };

      let updated: IComment | null = null;
      if (status) updated = await setCommentStatus(id, status, {}, req.user?.id, reason);
      if (sentiment) updated = await setCommentSentiment(id, sentiment, {}, req.user?.id);

      successResponse(res, { data: updated, message: 'Comment updated' });
    }
  )
```

## PUT /api/v1/comments/:id/tags

**Source:** `server/src/modules/comment/api.ts:383`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** Provider parentCommentId joins replies to a root within brand/post scope. The root owns thread status and SLA. Page replies end hold, and root-author replies reopen unresolved roots. Resolved roots do not automatically reopen. Replies, hiding, liking and deletion can call the provider; local wrap-up and classification update domain state. Reading history using a reply ID resolves the root first.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.
- Actual sentiment, type (sessions), tag or summary changes append wrapUpLog with before/after values; reordered tags and equivalent empty/absent summaries do not produce edits. Status transitions use the separate statusLog.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

**Body: setCommentTagsSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const setCommentTagsSchema = z.strictObject({
  tagIds: z
    .array(idSchema)
    .max(MAX_TAGS_PER_RECORD, `A record can carry at most ${MAX_TAGS_PER_RECORD} tags`),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.put(
    '/:id/tags',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(commentIdSchema),
    validateBody(setCommentTagsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      // Reuse the brand ensureActionableComment already resolved (and access-checked) to validate the ids.
      const { brand } = await ensureActionableComment(id, req.user);

      const { tagIds } = req.body as { tagIds: string[] };
      const tags = await resolveTagIds(brand._id, tagIds, `${comingFrom} - PUT /:id/tags`);

      const updated = await setCommentTags(id, tags, {}, req.user?.id);
      successResponse(res, { data: updated, message: 'Comment tags updated' });
    }
  )
```

## PATCH /api/v1/comments/:id/assignment

**Source:** `server/src/modules/comment/api.ts:410`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant and brand visibility checks still apply.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** Owners/admins route a non-resolved session or comment root after brand visibility and target validation. Conversation routes resolve the latest session; comment reply IDs resolve the thread root. A conditional open-only write prevents routing a query resolved concurrently. Update the conversation mirror where relevant and emit assignment:changed.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

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
- Use {"assigneeType":null} to clear; response message becomes Comment unassigned.
- GET thread responses use the ClientCommentThread projection (id, author, at, post, replies). Mutation responses return stored Comment documents; do not assume identical field names.
- assigneeType accepts query_manager, team, department or null (clear). The target must be eligible for this brand; inactive teams/departments take no new work.
- Resolved work rejects assignment changes with 409. Routing and claiming preserve status, including hold.
- A real assignment write appends assignmentLog in the same document update. An already-matching target produces no write/log; comments report Assignment unchanged.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

**Body: assignCommentSchema** — `server/src/modules/comment/validation.ts`

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

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.patch(
    '/:id/assignment',
    authenticate,
    authorize(...MANAGER_ROLES),
    validateParams(commentIdSchema),
    validateBody(assignCommentSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      // Reuse the brand ensureVisibleComment already resolved (and access-checked) to validate the
      // assignee below rather than fetching the brand a second time.
      const { comment, brand } = await ensureVisibleComment(id, req.user);
      const assignmentComingFrom = `${comingFrom} - PATCH /:id/assignment`;
      // Routing lives on the thread root, whichever comment of the thread was named (as claim).
      const root = await getThreadRoot(comment);
      if (!root || root.parentCommentId) {
        throw new NotFoundError('This thread has no root to assign', assignmentComingFrom);
      }
      // A closed thread's assignment no longer changes.
      if (root.status === 'resolved') {
        throw new ConflictError(THREAD_WRAPPED_UP, assignmentComingFrom);
      }

      const { assigneeType, assigneeId } = req.body as {
        assigneeType: AssigneeType | null;
        assigneeId?: string;
      };
      // The assignee must be one the brand grants access to, so a comment can't be routed to someone
      // who can't even see its brand. Shared with the session route and with GET /sessions/assignees,
      // so the list and the check can't drift apart. Clearing needs no lookup.
      const assignee: ICommentAssignee | null =
        assigneeType === null
          ? null
          : await resolveBrandAssignee(
              brand,
              assigneeType,
              assigneeId!,
              getTenantScope(req.user),
              assignmentComingFrom
            );

      // Routed where it already is: nothing changes, so nothing is written (or logged).
      if (sameAssignee(root.assignee, assignee)) {
        return successResponse(res, { data: root, message: 'Assignment unchanged' });
      }
      const updated = await assignComment(
        String(root._id),
        assignee,
        {},
        { openOnly: true, actor: { cause: 'routed', by: req.user?.id } }
      );
      // Wrapped up since it was read.
      if (!updated) throw new ConflictError(THREAD_WRAPPED_UP, assignmentComingFrom);
      successResponse(res, {
        data: updated,
        message: assigneeType === null ? 'Comment unassigned' : 'Comment assigned',
      });
    }
  )
```

## POST /api/v1/comments/:id/claim

**Source:** `server/src/modules/comment/api.ts:476`

**Access:** Authenticated query_manager only; visible brand and an eligible open query required.

**Prerequisites:** Company, brand visibility and eligible organizational membership.

**Business logic:** Resolve the visible latest session or comment root. Reject resolved work. Already held by the caller returns Already assigned to you. Resolve the caller as a brand-eligible assignee and atomically match unassigned, own department or own team pool before setting a personal assignment. A concurrent loser receives 409.

**Implementation entry points:** `server/src/modules/comment/api.ts`

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/comments/670000000000000000000008/claim" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Assigned to you",
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
      "kind": "query_manager",
      "id": "670000000000000000000002",
      "name": "Amina Rahman"
    }
  }
}
```

- No request body. Only query_manager can call this endpoint; managers use assignment routes.
- Claim preserves hold/unresolved status and does not resume SLA. Already assigned to you is HTTP 200 for an open query.
- Pool membership is read from the current User record; another person or team cannot be claimed. A stale brand-access token still affects visibility.
- A successful new claim appends cause claimed with the caller as actor in the same update. Already assigned to you does not append another history entry.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

- HTTP 409: This thread is already wrapped up

### Handler code

```typescript
router.post(
    '/:id/claim',
    authenticate,
    authorize(ROLES.QUERY_MANAGER),
    validateParams(commentIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const claimComingFrom = `${comingFrom} - POST /:id/claim`;
      const user = req.user as Express.User;
      const { comment, brand } = await ensureVisibleComment(String(req.params.id ?? ''), user);
      const root = await getThreadRoot(comment);
      // No root, or a reply whose chain breaks before the root (its parent was never ingested).
      if (!root || root.parentCommentId) {
        throw new NotFoundError('This thread has no root to assign', claimComingFrom);
      }
      if (root.status === 'resolved') {
        throw new ConflictError(THREAD_WRAPPED_UP, claimComingFrom);
      }
      if (root.assignee?.kind === 'query_manager' && String(root.assignee.id) === user.id) {
        return successResponse(res, { data: root, message: 'Already assigned to you' });
      }
      const assignee: ICommentAssignee = await resolveBrandAssignee(
        brand,
        'query_manager',
        user.id,
        getTenantScope(user),
        claimComingFrom
      );
      const claimed = await claimComment(root._id, assignee, await claimableFilter(user));
      if (!claimed) {
        // Taken meanwhile, or wrapped up meanwhile.
        const current = await getCommentById(String(root._id));
        throw new ConflictError(
          current?.status === 'resolved' ? THREAD_WRAPPED_UP : 'Someone else has this thread',
          claimComingFrom
        );
      }
      successResponse(res, { data: claimed, message: 'Assigned to you' });
    }
  )
```

## POST /api/v1/comments/:id/forward

**Source:** `server/src/modules/comment/api.ts:521`

**Access:** Authenticated query_manager only, personally holding the visible current session or comment root. Managers use routing endpoints.

**Prerequisites:** Visible brand, personally assigned non-resolved query, eligible target query manager/team/department.

**Business logic:** Resolve the latest session (conversation) or root (comment), verify the caller personally holds it before checking resolved status, then resolve a brand-eligible target. The database write rechecks holder and non-resolved status, changes assignee and appends a forwarded assignment log together. Mirror/emit afterwards. Status, SLA and wrap-up fields are preserved.

**Implementation entry points:** `server/src/modules/session/assignment.ts; server/src/modules/session/service.ts; server/src/modules/comment/forward.ts; server/src/modules/comment/service.ts`

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/comments/670000000000000000000008/forward" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"assigneeType":"team","assigneeId":"670000000000000000000020","note":"Please check the warehouse delivery update"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Thread forwarded",
  "data": {
    "_id": "670000000000000000000008",
    "status": "hold",
    "assignee": {
      "kind": "team",
      "id": "670000000000000000000020",
      "name": "Night shift"
    }
  }
}
```

- assigneeType is query_manager, team or department; null is forbidden. assigneeId is required. Optional note is trimmed, maximum 500 characters.
- Forwarding to yourself returns 400. Forwarding a pool requires claiming it first. Managers route rather than forward.
- A successful forward returns the updated Session for conversations or root Comment for threads. The former holder loses action permission; a team/department target must be claimed.
- The optional note lives in assignmentLog. History reads remain manager-only; a forward does not send a provider message or create an internal SessionNote.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

**Body: forwardSchema** — `server/src/modules/session/validation.ts`

```typescript
export const forwardSchema = z.strictObject({
  assigneeType: z.enum(ASSIGNEE_TYPES),
  assigneeId: idSchema,
  note: z.string().trim().max(FORWARD_NOTE_MAX_LENGTH, 'Note is too long').optional(),
});
```

### Error examples

- HTTP 400: This is already assigned to you
- HTTP 403: Only the query manager this is assigned to can forward it
- HTTP 409: This thread changed hands meanwhile

### Handler code

```typescript
router.post(
    '/:id/forward',
    authenticate,
    authorize(ROLES.QUERY_MANAGER),
    validateParams(commentIdSchema),
    validateBody(forwardSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const forwardComingFrom = `${comingFrom} - POST /:id/forward`;
      const user = req.user as Express.User;
      const { comment, brand } = await ensureVisibleComment(String(req.params.id ?? ''), user);
      const root = await getThreadRoot(comment);
      if (!root || root.parentCommentId) {
        throw new NotFoundError('This thread has no root to forward', forwardComingFrom);
      }
      const choice = req.body as ForwardChoice;
      const forwarded = await forwardThreadForCaller(root, brand, choice, user, forwardComingFrom);
      successResponse(res, { data: forwarded, message: 'Thread forwarded' });
    }
  )
```

## PATCH /api/v1/comments/:id/wrap-up

**Source:** `server/src/modules/comment/api.ts:547`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** Provider parentCommentId joins replies to a root within brand/post scope. The root owns thread status and SLA. Page replies end hold, and root-author replies reopen unresolved roots. Resolved roots do not automatically reopen. Replies, hiding, liking and deletion can call the provider; local wrap-up and classification update domain state. Reading history using a reply ID resolves the root first.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

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
- Optional reason is trimmed and limited to 500 characters. Only a real status transition appends a log; re-saving the same status does not replace its reason.
- hold, unresolved and resolved stop resolution time. First-response time is independent of these pauses.
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.
- Actual sentiment, type (sessions), tag or summary changes append wrapUpLog with before/after values; reordered tags and equivalent empty/absent summaries do not produce edits. Status transitions use the separate statusLog.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

**Body: wrapUpCommentSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const wrapUpCommentSchema = z.strictObject({
  status: z.enum(['unresolved', 'resolved', 'hold']),
  reason: statusReasonSchema,

  sentiment: z.enum(COMMENT_SENTIMENTS),
  resolutionSummary: z.string().trim().max(8000, 'Resolution summary is too long').optional(),
  // Brand-tag ids applied in the same modal; resolved against the brand vocabulary in the API layer.
  tagIds: z
    .array(idSchema)
    .max(MAX_TAGS_PER_RECORD, `A record can carry at most ${MAX_TAGS_PER_RECORD} tags`),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.patch(
    '/:id/wrap-up',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(commentIdSchema),
    validateBody(wrapUpCommentSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      // Reuse the access-checked brand to resolve the tag ids applied in the same modal.
      const { brand } = await ensureActionableComment(id, req.user);

      const { status, reason, sentiment, resolutionSummary, tagIds } = req.body as {
        status: 'unresolved' | 'resolved' | 'hold';
        reason?: string;
        sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
        resolutionSummary?: string;
        tagIds: string[];
      };
      const tags = await resolveTagIds(brand._id, tagIds, `${comingFrom} - PATCH /:id/wrap-up`);

      const updated = await wrapUpComment(id, {
        status,
        sentiment,
        resolutionSummary,
        tags,
        statusChangedBy: req.user?.id,
        reason,
      });
      successResponse(res, { data: updated, message: 'Comment wrapped up' });
    }
  )
```

## POST /api/v1/comments/:id/hide

**Source:** `server/src/modules/comment/api.ts:584`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** Provider parentCommentId joins replies to a root within brand/post scope. The root owns thread status and SLA. Page replies end hold, and root-author replies reopen unresolved roots. Resolved roots do not automatically reopen. Replies, hiding, liking and deletion can call the provider; local wrap-up and classification update domain state. Reading history using a reply ID resolves the root first.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

**Body: hideCommentSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const hideCommentSchema = z.strictObject({
  hidden: z.boolean(),
});
```

### Error examples

- HTTP 400: This comment can no longer be moderated

### Handler code

```typescript
router.post(
    '/:id/hide',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(commentIdSchema),
    validateBody(hideCommentSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      const { comment, accessToken } = await ensureReplyableComment(id, req.user);
      if (!comment.commentId) {
        throw new BadRequestError('This comment can no longer be moderated', comingFrom);
      }
      const { hidden } = req.body as { hidden: boolean };

      await setCommentHiddenOnPlatform(comment.platform, comment.commentId, accessToken, hidden);
      const updated = await markCommentHidden(id, hidden);
      successResponse(res, {
        data: updated,
        message: hidden ? 'Comment hidden' : 'Comment unhidden',
      });
    }
  )
```

## POST /api/v1/comments/:id/like

**Source:** `server/src/modules/comment/api.ts:611`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** Provider parentCommentId joins replies to a root within brand/post scope. The root owns thread status and SLA. Page replies end hold, and root-author replies reopen unresolved roots. Resolved roots do not automatically reopen. Replies, hiding, liking and deletion can call the provider; local wrap-up and classification update domain state. Reading history using a reply ID resolves the root first.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

**Body: likeCommentSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const likeCommentSchema = z.strictObject({
  liked: z.boolean(),
});
```

### Error examples

- HTTP 400: This comment can no longer be liked
- HTTP 400: Liking comments is only supported on Facebook

### Handler code

```typescript
router.post(
    '/:id/like',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(commentIdSchema),
    validateBody(likeCommentSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      const { comment, accessToken } = await ensureReplyableComment(id, req.user);
      if (!comment.commentId) {
        throw new BadRequestError('This comment can no longer be liked', comingFrom);
      }
      if (comment.platform !== 'facebook') {
        throw new BadRequestError('Liking comments is only supported on Facebook', comingFrom);
      }
      const { liked } = req.body as { liked: boolean };

      await setCommentLikedOnPlatform(comment.commentId, accessToken, liked);
      const updated = await markCommentLiked(id, liked);
      successResponse(res, { data: updated, message: liked ? 'Comment liked' : 'Like removed' });
    }
  )
```

## DELETE /api/v1/comments/:id

**Source:** `server/src/modules/comment/api.ts:638`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Brand/channel and ingested comment tree. Uses the shared access, tag, status and SLA concepts; no Conversation or Session document is required.

**Business logic:** Provider parentCommentId joins replies to a root within brand/post scope. The root owns thread status and SLA. Page replies end hold, and root-author replies reopen unresolved roots. Resolved roots do not automatically reopen. Replies, hiding, liking and deletion can call the provider; local wrap-up and classification update domain state. Reading history using a reply ID resolves the root first.

**Implementation entry points:** `server/src/modules/comment/api.ts; comment/service.ts; comment/sla.ts; modules/session/status-log.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: commentIdSchema** — `server/src/modules/comment/validation.ts`

```typescript
export const commentIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.delete(
    '/:id',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(commentIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      const { comment, accessToken } = await ensureReplyableComment(id, req.user);
      if (comment.commentId) {
        await deleteCommentOnPlatform(comment.commentId, accessToken);
      }
      await deleteCommentThread(id);
      successResponse(res, { message: 'Comment deleted' });
    }
  )
```

## GET /api/v1/companies/me

**Source:** `server/src/modules/company/api.ts:92`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension).

**Prerequisites:** Database foundation. Registration bootstraps Company and User together; login needs an existing user. Company administration needs an authenticated permitted role.

**Business logic:** A company is the tenant boundary. Registration creates the company and owner, links ownerId and uses compensating cleanup on failure. Password verification precedes issuing access/refresh cookies. Query-manager writes require personal assignment; suspension is checked separately from role permission.

**Implementation entry points:** `server/src/auth/api.ts → auth/service.ts; auth/company-access.ts; modules/company/service.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get('/me', authenticate, logRequest({}), async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new NotFoundError(`${model} not found`, `module/company/api.ts - /me`);
    }
    const item = await getById(companyId);
    if (!item) {
      throw new NotFoundError(`${model} not found`, `module/company/api.ts - /me`);
    }
    successResponse(res, { data: item });
  })
```

## GET /api/v1/companies

**Source:** `server/src/modules/company/api.ts:107`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin.

**Prerequisites:** Database foundation. Registration bootstraps Company and User together; login needs an existing user. Company administration needs an authenticated permitted role.

**Business logic:** A company is the tenant boundary. Registration creates the company and owner, links ownerId and uses compensating cleanup on failure. Password verification precedes issuing access/refresh cookies. Query-manager writes require personal assignment; suspension is checked separately from role permission.

**Implementation entry points:** `server/src/auth/api.ts → auth/service.ts; auth/company-access.ts; modules/company/service.ts`

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

**Query: listCompaniesSchema** — `server/src/modules/company/validation.ts`

```typescript
export const listCompaniesSchema = listQuerySchema.extend({
  status: z.enum(COMPANY_STATUS).optional(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/',
    authenticate,
    authorize(ROLES.SUPER_ADMIN),
    validateQuery(listCompaniesSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const data = await search(req.query);
      paginatedSuccessResponse(res, { data });
    }
  )
```

## POST /api/v1/companies

**Source:** `server/src/modules/company/api.ts:123`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin.

**Prerequisites:** Database foundation. Registration bootstraps Company and User together; login needs an existing user. Company administration needs an authenticated permitted role.

**Business logic:** A company is the tenant boundary. Registration creates the company and owner, links ownerId and uses compensating cleanup on failure. Password verification precedes issuing access/refresh cookies. Query-manager writes require personal assignment; suspension is checked separately from role permission.

**Implementation entry points:** `server/src/auth/api.ts → auth/service.ts; auth/company-access.ts; modules/company/service.ts`

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

**Body: createCompanySchema** — `server/src/modules/company/validation.ts`

```typescript
export const createCompanySchema = z.strictObject({
  name: z.string().min(1, 'Name is required'),
  status: z.enum(COMPANY_STATUS).optional(),
  // The initial owner login provisioned alongside the company.
  ownerName: z.string().min(1, 'Owner name is required'),
  ownerEmail: z.email('Invalid email format'),
  ownerPassword: z.string().min(8, 'Password must be at least 8 characters'),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post(
    '/',
    authenticate,
    authorize(ROLES.SUPER_ADMIN),
    // multer must run before validateBody so the multipart text fields populate req.body.
    upload({ fieldName: 'logo' }),
    validateBody(createCompanySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, status, ownerName, ownerEmail, ownerPassword } = req.body;

      const logoKey = await saveLogoIfPresent(req.file);

      try {
        const { company } = await provisionCompany({
          companyName: name,
          status,
          owner: { name: ownerName, email: ownerEmail, password: ownerPassword },
          logo: logoKey,
        });
        successResponse(res, { data: company, message: 'Company created successfully' });
      } catch (error) {
        // Avoid orphaned files if provisioning fails (e.g. duplicate name/email).
        if (logoKey) await deleteLocal(logoKey);
        throw error;
      }
    }
  )
```

## GET /api/v1/companies/:id

**Source:** `server/src/modules/company/api.ts:155`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin.

**Prerequisites:** Database foundation. Registration bootstraps Company and User together; login needs an existing user. Company administration needs an authenticated permitted role.

**Business logic:** A company is the tenant boundary. Registration creates the company and owner, links ownerId and uses compensating cleanup on failure. Password verification precedes issuing access/refresh cookies. Query-manager writes require personal assignment; suspension is checked separately from role permission.

**Implementation entry points:** `server/src/auth/api.ts → auth/service.ts; auth/company-access.ts; modules/company/service.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN),
    logRequest({}),
    async (req: Request, res: Response) => {
      const item = await getById(String(req.params.id ?? ''));
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/company/api.ts - /:id`);
      }
      successResponse(res, { data: item });
    }
  )
```

## PATCH /api/v1/companies/:id

**Source:** `server/src/modules/company/api.ts:174`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin.

**Prerequisites:** Database foundation. Registration bootstraps Company and User together; login needs an existing user. Company administration needs an authenticated permitted role.

**Business logic:** A company is the tenant boundary. Registration creates the company and owner, links ownerId and uses compensating cleanup on failure. Password verification precedes issuing access/refresh cookies. Query-manager writes require personal assignment; suspension is checked separately from role permission.

**Implementation entry points:** `server/src/auth/api.ts → auth/service.ts; auth/company-access.ts; modules/company/service.ts`

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

### Validation declarations

**Body: updateCompanySchema** — `server/src/modules/company/validation.ts`

```typescript
export const updateCompanySchema = z.strictObject({
  name: z.string().min(1, 'Name is required').optional(),
  status: z.enum(COMPANY_STATUS).optional(),
  // Owner login edits. All optional — an empty password means "keep the current one".
  ownerName: z.string().min(1, 'Owner name is required').optional(),
  ownerEmail: z.email('Invalid email format').optional(),
  ownerPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
});
```

### Error examples

- HTTP 400: Invalid request body

### Handler code

```typescript
router.patch(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN),
    upload({ fieldName: 'logo' }),
    validateBody(updateCompanySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, status, ownerName, ownerEmail, ownerPassword } = req.body;
      if (!name && !status && !ownerName && !ownerEmail && !ownerPassword && !req.file) {
        throw new BadRequestError('Invalid request body', `module/company/api.ts - /:id`);
      }

      const existing = await getById(String(req.params.id ?? ''));
      if (!existing) {
        throw new NotFoundError(`${model} not found`, `module/company/api.ts - /:id`);
      }

      const newKey = await saveLogoIfPresent(req.file);
      try {
        const data = await performCompanyUpdate(
          existing,
          { name, status, owner: { ownerName, ownerEmail, ownerPassword } },
          newKey
        );
        successResponse(res, { data, message: 'Company updated successfully' });
      } catch (error) {
        // The update failed after writing the new file — clean it up.
        if (newKey) await deleteLocal(newKey);
        throw error;
      }
    }
  )
```

## DELETE /api/v1/companies/:id

**Source:** `server/src/modules/company/api.ts:211`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin.

**Prerequisites:** Database foundation. Registration bootstraps Company and User together; login needs an existing user. Company administration needs an authenticated permitted role.

**Business logic:** A company is the tenant boundary. Registration creates the company and owner, links ownerId and uses compensating cleanup on failure. Password verification precedes issuing access/refresh cookies. Query-manager writes require personal assignment; suspension is checked separately from role permission.

**Implementation entry points:** `server/src/auth/api.ts → auth/service.ts; auth/company-access.ts; modules/company/service.ts`

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

**Params: deleteCompanySchema** — `server/src/modules/company/validation.ts`

```typescript
export const deleteCompanySchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.delete(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN),
    validateParams(deleteCompanySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const item = await deleteById(String(req.params.id ?? ''));
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/company/api.ts - /:id`);
      }
      await deleteLocal(item.logo);
      successResponse(res, { data: item, message: 'Company deleted successfully' });
    }
  )
```

## GET /api/v1/conversations

**Source:** `server/src/modules/conversation/api.ts:350`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.
- mine=true includes personal work and own department/team pools. Pool membership is read from User, while brand visibility still follows token claims until refresh.

### Validation declarations

**Query: listConversationsSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const listConversationsSchema = cursorListQuerySchema.extend({
  brandId: idSchema,
  platform: z.enum(CHANNEL_PLATFORMS).optional(),
  status: z.enum(SESSION_STATUSES).optional(),
  sentiment: z.enum(SESSION_SENTIMENTS).optional(),
  // "Assigned to me / my department" pill. When 'true', the API narrows to the caller's own
  // assignments (ids resolved from the auth token, never trusted from the client).
  mine: z.enum(['true', 'false']).optional(),
  // Narrow to conversations carrying at least one of these brand tags. Same shape as the comment
  // list: a comma-separated list of ids (`tagIds=a,b`), since it rides in the query string.
  // Empty/absent means "any tag". Tags sit on sessions, so the API resolves this to conversation ids.
  tagIds: z
    .string()
    .trim()
    .optional()
    .transform(v => (v ? v.split(',').filter(Boolean) : undefined))
    .pipe(z.array(idSchema).max(MAX_TAGS_PER_RECORD).optional()),
});
```

### Error examples

- HTTP 404: Brand not found

### Handler code

```typescript
router.get(
    '/',
    authenticate,
    authorize(...READ_ROLES),
    validateQuery(listConversationsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brandId = String(req.query.brandId ?? '');
      // Confirm the caller may see this brand before returning any of its conversations.
      const brand = await getBrandById(brandId, getBrandScope(req.user));
      if (!brand) {
        throw new NotFoundError('Brand not found', `module/conversation/api.ts - GET /`);
      }
      // "Assigned to me" → held by the caller, or pooled on their department or team.
      const assigneeIds =
        req.query.mine === 'true' ? await assignedToMeIds(req.user as Express.User) : undefined;
      // Tag filter, matched against the conversation's denormalized `tags` (its latest session's).
      // Filtering by a parent tag means "and everything under it" — picking `complaint` returns
      // `complaint/billing` threads too, exactly as in the comment list.
      const { tagIds } = req.query as unknown as ListConversationsQuery;
      const data = await listConversations(brandId, req.query, {
        assigneeIds,
        tagIds: tagIds?.length ? await expandTagIdsToSubtrees(brand._id, tagIds) : undefined,
      });
      paginatedSuccessResponse(res, { data });
    }
  )
```

## GET /api/v1/conversations/:id/messages

**Source:** `server/src/modules/conversation/api.ts:381`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/messages',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(conversationIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { conversation } = await loadVisibleConversation(
        String(req.params.id ?? ''),
        req.user,
        `${comingFrom} - GET /:id/messages`
      );

      const messages = await listMessages(conversation.id);
      successResponse(res, { data: messages });
    }
  )
```

## GET /api/v1/conversations/:id/sessions

**Source:** `server/src/modules/conversation/api.ts:404`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

**Query: conversationSessionsQuerySchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationSessionsQuerySchema = cursorPaginationQuerySchema;
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/sessions',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(conversationIdSchema),
    validateQuery(conversationSessionsQuerySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { conversation } = await loadVisibleConversation(
        String(req.params.id ?? ''),
        req.user,
        `${comingFrom} - GET /:id/sessions`
      );

      const { cursor, limit } = req.query as unknown as ConversationSessionsQuery;
      const data = await getConversationThread(conversation.id, { cursor, limit });
      paginatedSuccessResponse(res, { data });
    }
  )
```

## GET /api/v1/conversations/:id/stats

**Source:** `server/src/modules/conversation/api.ts:428`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/stats',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(conversationIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { conversation } = await loadVisibleConversation(
        String(req.params.id ?? ''),
        req.user,
        `${comingFrom} - GET /:id/stats`
      );

      const stats = await getConversationSessionStats(conversation.id);
      successResponse(res, { data: stats });
    }
  )
```

## GET /api/v1/conversations/:id/customer

**Source:** `server/src/modules/conversation/api.ts:450`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/customer',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(conversationIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { conversation } = await loadVisibleConversation(
        String(req.params.id ?? ''),
        req.user,
        `${comingFrom} - GET /:id/customer`
      );

      const customer = await getConversationCustomer(conversation);
      successResponse(res, { data: customer });
    }
  )
```

## PATCH /api/v1/conversations/:id/customer

**Source:** `server/src/modules/conversation/api.ts:473`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

**Body: updateCustomerSchema** — `server/src/modules/customer/validation.ts`

```typescript
export const updateCustomerSchema = z.strictObject({
  mobile: z.string().trim().max(32, 'Mobile number is too long').optional(),
  email: z.union([z.literal(''), z.email('Invalid email format')]).optional(),
  address: z.string().trim().max(500, 'Address is too long').optional(),
  gender: z.enum(CUSTOMER_GENDERS).optional(),
});
```

### Error examples

- HTTP 400: No customer fields to update

### Handler code

```typescript
router.patch(
    '/:id/customer',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(conversationIdSchema),
    validateBody(updateCustomerSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const body = req.body as UpdateCustomerInput;
      if (Object.keys(body).length === 0) {
        throw new BadRequestError('No customer fields to update', comingFrom);
      }

      const { conversation } = await loadActionableConversation(
        String(req.params.id ?? ''),
        req.user,
        `${comingFrom} - PATCH /:id/customer`
      );

      const customer = await updateConversationCustomer(conversation, body);
      successResponse(res, { data: customer, message: 'Customer updated' });
    }
  )
```

## POST /api/v1/conversations/:id/claim

**Source:** `server/src/modules/conversation/api.ts:502`

**Access:** Authenticated query_manager only; visible brand and an eligible open query required.

**Prerequisites:** Company, brand visibility and eligible organizational membership.

**Business logic:** Resolve the visible latest session or comment root. Reject resolved work. Already held by the caller returns Already assigned to you. Resolve the caller as a brand-eligible assignee and atomically match unassigned, own department or own team pool before setting a personal assignment. A concurrent loser receives 409.

**Implementation entry points:** `server/src/modules/conversation/api.ts`

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/conversations/670000000000000000000005/claim" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Assigned to you",
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
      "kind": "query_manager",
      "id": "670000000000000000000002",
      "name": "Amina Rahman"
    }
  }
}
```

- No request body. Only query_manager can call this endpoint; managers use assignment routes.
- Claim preserves hold/unresolved status and does not resume SLA. Already assigned to you is HTTP 200 for an open query.
- Pool membership is read from the current User record; another person or team cannot be claimed. A stale brand-access token still affects visibility.
- A successful new claim appends cause claimed with the caller as actor in the same update. Already assigned to you does not append another history entry.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

- HTTP 409: This conversation is already wrapped up

### Handler code

```typescript
router.post(
    '/:id/claim',
    authenticate,
    authorize(ROLES.QUERY_MANAGER),
    validateParams(conversationIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const claimComingFrom = `${comingFrom} - POST /:id/claim`;
      const user = req.user as Express.User;
      const { conversation, brand } = await loadVisibleConversation(
        String(req.params.id ?? ''),
        user,
        claimComingFrom
      );
      const session = await getLatestSession(conversation._id);
      if (!session) throw new NotFoundError(NO_SESSION_YET, claimComingFrom);
      const claimed = await claimForCaller(session, brand, user, claimComingFrom);
      successResponse(res, {
        data: claimed.session,
        message: claimed.already ? 'Already assigned to you' : 'Assigned to you',
      });
    }
  )
```

## POST /api/v1/conversations/:id/forward

**Source:** `server/src/modules/conversation/api.ts:531`

**Access:** Authenticated query_manager only, personally holding the visible current session or comment root. Managers use routing endpoints.

**Prerequisites:** Visible brand, personally assigned non-resolved query, eligible target query manager/team/department.

**Business logic:** Resolve the latest session (conversation) or root (comment), verify the caller personally holds it before checking resolved status, then resolve a brand-eligible target. The database write rechecks holder and non-resolved status, changes assignee and appends a forwarded assignment log together. Mirror/emit afterwards. Status, SLA and wrap-up fields are preserved.

**Implementation entry points:** `server/src/modules/session/assignment.ts; server/src/modules/session/service.ts; server/src/modules/comment/forward.ts; server/src/modules/comment/service.ts`

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/conversations/670000000000000000000005/forward" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"assigneeType":"team","assigneeId":"670000000000000000000020","note":"Please check the warehouse delivery update"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Conversation forwarded",
  "data": {
    "_id": "670000000000000000000006",
    "status": "hold",
    "assignee": {
      "kind": "team",
      "id": "670000000000000000000020",
      "name": "Night shift"
    },
    "conversationId": "670000000000000000000005"
  }
}
```

- assigneeType is query_manager, team or department; null is forbidden. assigneeId is required. Optional note is trimmed, maximum 500 characters.
- Forwarding to yourself returns 400. Forwarding a pool requires claiming it first. Managers route rather than forward.
- A successful forward returns the updated Session for conversations or root Comment for threads. The former holder loses action permission; a team/department target must be claimed.
- The optional note lives in assignmentLog. History reads remain manager-only; a forward does not send a provider message or create an internal SessionNote.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

**Body: forwardSchema** — `server/src/modules/session/validation.ts`

```typescript
export const forwardSchema = z.strictObject({
  assigneeType: z.enum(ASSIGNEE_TYPES),
  assigneeId: idSchema,
  note: z.string().trim().max(FORWARD_NOTE_MAX_LENGTH, 'Note is too long').optional(),
});
```

### Error examples

- HTTP 400: This is already assigned to you
- HTTP 403: Only the query manager this is assigned to can forward it
- HTTP 409: This conversation changed hands meanwhile

### Handler code

```typescript
router.post(
    '/:id/forward',
    authenticate,
    authorize(ROLES.QUERY_MANAGER),
    validateParams(conversationIdSchema),
    validateBody(forwardSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const forwardComingFrom = `${comingFrom} - POST /:id/forward`;
      const user = req.user as Express.User;
      const { conversation, brand } = await loadVisibleConversation(
        String(req.params.id ?? ''),
        user,
        forwardComingFrom
      );
      const session = await getLatestSession(conversation._id);
      if (!session) {
        throw new NotFoundError(NO_SESSION_YET, forwardComingFrom);
      }
      const forwarded = await forwardForCaller(
        session,
        brand,
        req.body as ForwardChoice,
        user,
        forwardComingFrom
      );
      successResponse(res, { data: forwarded, message: 'Conversation forwarded' });
    }
  )
```

## PATCH /api/v1/conversations/:id/assignment

**Source:** `server/src/modules/conversation/api.ts:567`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant and brand visibility checks still apply.

**Prerequisites:** Company, brand visibility and eligible organizational membership.

**Business logic:** Owners/admins route a non-resolved session or comment root after brand visibility and target validation. Conversation routes resolve the latest session; comment reply IDs resolve the thread root. A conditional open-only write prevents routing a query resolved concurrently. Update the conversation mirror where relevant and emit assignment:changed.

**Implementation entry points:** `server/src/modules/conversation/api.ts`

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/conversations/670000000000000000000005/assignment" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"assigneeType":"team","assigneeId":"670000000000000000000020"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Conversation assigned",
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
      "kind": "team",
      "id": "670000000000000000000020",
      "name": "Night shift"
    }
  }
}
```

- assigneeType accepts query_manager, team, department or null (clear). The target must be eligible for this brand; inactive teams/departments take no new work.
- Resolved work rejects assignment changes with 409. Routing and claiming preserve status, including hold.
- A real assignment write appends assignmentLog in the same document update. An already-matching target produces no write/log; comments report Assignment unchanged.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

**Body: assignSessionSchema** — `server/src/modules/session/validation.ts`

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

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.patch(
    '/:id/assignment',
    authenticate,
    authorize(...MANAGER_ROLES),
    validateParams(conversationIdSchema),
    validateBody(assignSessionSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const assignmentComingFrom = `${comingFrom} - PATCH /:id/assignment`;
      const { conversation, brand } = await loadVisibleConversation(
        String(req.params.id ?? ''),
        req.user,
        assignmentComingFrom
      );
      const session = await getLatestSession(conversation._id);
      if (!session) {
        throw new NotFoundError(NO_SESSION_YET, assignmentComingFrom);
      }
      const choice = req.body as AssigneeChoice;
      const updated = await routeSession(
        session,
        brand,
        choice,
        req.user as Express.User,
        assignmentComingFrom
      );
      successResponse(res, {
        data: updated,
        message: choice.assigneeType === null ? 'Conversation unassigned' : 'Conversation assigned',
      });
    }
  )
```

## POST /api/v1/conversations/:id/messages

**Source:** `server/src/modules/conversation/api.ts:604`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

**Body: sendMessageSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const sendMessageSchema = z.strictObject({
  text: z.string().trim().min(1, 'Message text is required').max(2000, 'Message is too long'),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post(
    '/:id/messages',
    markInitiated,
    authenticate,
    authorize(...READ_ROLES),
    validateParams(conversationIdSchema),
    validateBody(sendMessageSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const initiatedAt = res.locals.initiatedAt as Date;
      const { conversation, accessToken, channel } = await ensureSendableConversation(
        String(req.params.id ?? ''),
        req.user
      );

      const { text } = req.body as { text: string };

      // Send first; only persist once Facebook accepts it, so the thread never shows a
      // reply that wasn't actually delivered.
      const message = await deliverText(
        conversation,
        accessToken,
        { userId: req.user?.id, name: req.user?.name, initiatedAt },
        text,
        channel
      );

      successResponse(res, {
        statusCode: 201,
        data: message,
        message: 'Reply sent',
      });
    }
  )
```

## POST /api/v1/conversations/:id/attachments

**Source:** `server/src/modules/conversation/api.ts:644`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

- HTTP 400: No files uploaded
- HTTP 400: Message is too long

### Handler code

```typescript
router.post(
    '/:id/attachments',
    markInitiated,
    authenticate,
    authorize(...READ_ROLES),
    validateParams(conversationIdSchema),
    upload({
      allowMultiple: true,
      fieldName: 'files',
      allowedMimeTypes: CHAT_ALLOWED_MIME_TYPES,
      maxFileSize: CHAT_MAX_FILE_SIZE,
    }),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { conversation, accessToken, channel } = await ensureSendableConversation(
        String(req.params.id ?? ''),
        req.user
      );

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        throw new BadRequestError('No files uploaded', comingFrom);
      }

      // WhatsApp takes a narrower set of types and smaller sizes than the multer allow-list above,
      // which is Facebook's. Vet the whole batch up front: the loop below sends sequentially, so a
      // file rejected halfway through would leave the earlier ones already delivered.
      if (channel === SEND_CHANNELS.whatsapp) {
        for (const file of files) {
          assertSendableOnWhatsApp(file);
        }
      }

      // Optional caption sent alongside the files (multipart field).
      const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (rawText.length > 2000) {
        throw new BadRequestError('Message is too long', comingFrom);
      }

      const sender: Sender = {
        userId: req.user?.id,
        name: req.user?.name,
        initiatedAt: res.locals.initiatedAt as Date,
      };

      // Caption first, then one Send API call per file (a message carries a single attachment).
      // Sequential so a mid-batch failure surfaces without leaving half the batch silently unsent.
      const messages: IMessage[] = [];
      if (rawText) {
        const captionMessage = await deliverText(
          conversation,
          accessToken,
          sender,
          rawText,
          channel
        );
        if (captionMessage) messages.push(captionMessage);
      }
      for (const file of files) {
        const message = await deliverAttachment(conversation, accessToken, sender, file, channel);
        if (message) messages.push(message);
      }

      successResponse(res, {
        statusCode: 201,
        data: messages,
        message: 'Attachment sent',
      });
    }
  )
```

## POST /api/v1/conversations/:id/messages/:messageId/reaction

**Source:** `server/src/modules/conversation/api.ts:720`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: messageReactionParamsSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const messageReactionParamsSchema = z.object({
  id: idSchema,
  messageId: idSchema,
});
```

**Body: reactToMessageSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const reactToMessageSchema = z.strictObject({
  emoji: z.string().trim().min(1, 'An emoji is required').max(16, 'Not a valid emoji'),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post(
    '/:id/messages/:messageId/reaction',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(messageReactionParamsSchema),
    validateBody(reactToMessageSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { emoji } = req.body as { emoji: string };
      const message = await applyAgentReaction(req, emoji);
      successResponse(res, { data: message, message: 'Reaction sent' });
    }
  )
```

## DELETE /api/v1/conversations/:id/messages/:messageId/reaction

**Source:** `server/src/modules/conversation/api.ts:734`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: messageReactionParamsSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const messageReactionParamsSchema = z.object({
  id: idSchema,
  messageId: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.delete(
    '/:id/messages/:messageId/reaction',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(messageReactionParamsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const message = await applyAgentReaction(req, undefined);
      successResponse(res, { data: message, message: 'Reaction removed' });
    }
  )
```

## POST /api/v1/conversations/:id/messages/:messageId/media

**Source:** `server/src/modules/conversation/media.ts:131`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: messageReactionParamsSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const messageReactionParamsSchema = z.object({
  id: idSchema,
  messageId: idSchema,
});
```

### Error examples

- HTTP 404: Message not found
- HTTP 400: This brand no longer has a connected WhatsApp number

### Handler code

```typescript
router.post(
    '/:id/messages/:messageId/media',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(messageReactionParamsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const conversationId = String(req.params.id ?? '');
      const messageId = String(req.params.messageId ?? '');

      // Through the same seam as every other conversation read (./access.ts), not a hand-rolled
      // copy of it: this route hands back attachment bytes, so it has to answer "may this caller
      // see this thread" exactly as the message reads do.
      const { conversation, brand } = await loadVisibleConversation(
        conversationId,
        req.user,
        comingFrom,
        model
      );

      const message = await getConversationMessageById(conversation.id, messageId);
      if (!message) {
        throw new NotFoundError('Message not found', comingFrom);
      }

      const pending = fetchable(message);
      // Nothing to do — already fetched, or an attachment that never had a media id (a Messenger one,
      // or a WhatsApp media object that arrived without an id). Returned rather than rejected so the
      // client's on-open sweep can be naive.
      if (pending.length === 0) {
        successResponse(res, { data: message, message: 'Media already available' });
        return;
      }

      if (conversation.platform !== 'whatsapp' || !brand.whatsapp?.accessToken) {
        throw new BadRequestError(
          'This brand no longer has a connected WhatsApp number',
          comingFrom
        );
      }

      // Meta's 7-day webhook-media window. Checked against the message's own timestamp, so no sweep
      // has to write an `expired` state — and the attachment keeps `pending`, which is the truth: we
      // never fetched it, and now cannot.
      const age = Date.now() - new Date(message.sentAt).getTime();
      if (age > MEDIA_ID_TTL_MS) {
        logger.info('fetchMedia(): media id past its 7-day window', {
          comingFrom,
          conversationId,
          messageId,
          ageDays: Math.floor(age / (24 * 60 * 60 * 1000)),
        });
        throw new BadRequestError(EXPIRED_MSG, comingFrom);
      }

      const channel = {
        phoneNumberId: conversation.pageId,
        token: brand.whatsapp.accessToken,
      };

      // Collapse concurrent requests for the same message onto one fetch (see `inFlight`).
      let work = inFlight.get(messageId);
      if (!work) {
        work = fetchMessageMedia(message, channel).finally(() => inFlight.delete(messageId));
        inFlight.set(messageId, work);
      }
      const updated = await work;

      successResponse(res, {
        data: updated ?? message,
        message: 'Media fetched',
      });
    }
  )
```

## GET /api/v1/conversations/:id/whatsapp/templates

**Source:** `server/src/modules/conversation/whatsapp-templates.ts:215`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/whatsapp/templates',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(conversationIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { conversation, brand, channel } = await ensureSendableConversation(
        String(req.params.id ?? ''),
        req.user
      );
      if (channel !== SEND_CHANNELS.whatsapp) {
        throw new BadRequestError(NOT_WHATSAPP_MSG, comingFrom);
      }

      const all = await loadTemplates(brand);
      const templates = all.filter(isSendable);
      // Specifically the media-header count, NOT everything filtered out: the picker turns this into
      // "N need an image or file, which isn't supported yet", and a red-quality template counted here
      // would make that sentence a lie.
      const unsupportedCount = all.filter(needsUnsupportedMedia).length;

      successResponse(res, {
        data: { templates, unsupportedCount },
        message: 'Templates fetched',
      });
      logger.info('listTemplates(): served templates', {
        conversationId: String(conversation._id),
        sendable: templates.length,
        needsMedia: unsupportedCount,
        // The remainder: approved but red-quality, dropped without telling the agent.
        dropped: all.length - templates.length - unsupportedCount,
      });
    }
  )
```

## POST /api/v1/conversations/:id/whatsapp/templates

**Source:** `server/src/modules/conversation/whatsapp-templates.ts:257`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and stored conversation; provider sends additionally need channel access, action policy and provider configuration. Session/message knowledge is needed to interpret summaries.

**Business logic:** Conversation is the long-lived thread, Message is the event and Session is the support episode. List routes use stable compound cursors. Customer lookup/editing can resolve the external identity and lazily link a Customer. A send checks access before provider work and local storage. Attachments can partially succeed; template re-engagement can start a new episode after resolved work.

**Implementation entry points:** `server/src/modules/conversation/api.ts; conversation/access.ts; conversation/service.ts; conversation/send-channel.ts; conversation/whatsapp-templates.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: conversationIdSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const conversationIdSchema = z.object({
  id: idSchema,
});
```

**Body: sendTemplateSchema** — `server/src/modules/conversation/validation.ts`

```typescript
export const sendTemplateSchema = z.strictObject({
  name: z.string().trim().min(1, 'A template name is required'),
  language: z.string().trim().min(1, 'A template language is required'),
  values: z
    .record(z.string(), z.string().trim().min(1, 'Every field needs a value').max(1024, 'Too long'))
    .default({}),
});
```

### Error examples

- HTTP 400: That template is no longer available. Reopen the template picker to see the current list.
- HTTP 400: That template cannot be sent from here — it needs an image or file attachment, or it has been paused for quality.

### Handler code

```typescript
router.post(
    '/:id/whatsapp/templates',
    markInitiated,
    authenticate,
    authorize(...READ_ROLES),
    validateParams(conversationIdSchema),
    validateBody(sendTemplateSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { conversation, brand, accessToken, channel } = await ensureSendableConversation(
        String(req.params.id ?? ''),
        req.user
      );
      if (channel !== SEND_CHANNELS.whatsapp) {
        throw new BadRequestError(NOT_WHATSAPP_MSG, comingFrom);
      }

      const initiatedAt = res.locals.initiatedAt as Date;
      const { name, language, values } = req.body as {
        name: string;
        language: string;
        values: Record<string, string>;
      };

      // Resolved from Meta's own list rather than trusted from the body, so an agent cannot send a
      // template that is unapproved, paused, or needs media — the same filter the picker applied.
      const template = (await loadTemplates(brand)).find(
        t => t.name === name && t.language === language
      );
      if (!template) {
        throw new BadRequestError(
          'That template is no longer available. Reopen the template picker to see the current list.',
          comingFrom
        );
      }
      if (!isSendable(template)) {
        throw new BadRequestError(
          'That template cannot be sent from here — it needs an image or file attachment, or it has been paused for quality.',
          comingFrom
        );
      }

      assertValuesMatchSpec(template, values);

      // Send before persisting, matching deliverText in ./api.ts: the thread must never show a message
      // WhatsApp did not accept. `pageId` holds the phone number id and `participantId` the wa_id —
      // sent verbatim, never reformatted (it can be an opaque business-scoped id).
      const sent = await sendTemplateMessage(
        conversation.pageId,
        accessToken,
        conversation.participantId,
        {
          name: template.name,
          language: template.language,
          components: buildTemplateComponents(template, values),
        }
      );

      const message = await persistTemplateSend(conversation, template, values, sent.messageId, {
        userId: req.user?.id,
        name: req.user?.name,
        initiatedAt,
      });

      successResponse(res, {
        statusCode: 201,
        data: message,
        message: 'Template sent',
      });
    }
  )
```

## GET /api/v1/departments

**Source:** `server/src/modules/department/api.ts:29`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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

**Query: listDepartmentsSchema** — `server/src/modules/department/validation.ts`

```typescript
export const listDepartmentsSchema = listQuerySchema.extend({
  status: z.enum(DEPARTMENT_STATUS).optional(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateQuery(listDepartmentsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const data = await search(req.query, getTenantScope(req.user));
      paginatedSuccessResponse(res, { data });
    }
  )
```

## POST /api/v1/departments

**Source:** `server/src/modules/department/api.ts:44`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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

### Validation declarations

**Body: createDepartmentSchema** — `server/src/modules/department/validation.ts`

```typescript
export const createDepartmentSchema = z.strictObject({
  name: z.string().min(1, 'Name is required'),
  status: z.enum(DEPARTMENT_STATUS).optional(),
  // Only honoured for super_admin; for company_admin the server forces its own company.
  companyId: idSchema.optional(),
});
```

### Error examples

- HTTP 400: companyId is required

### Handler code

```typescript
router.post(
    '/',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateBody(createDepartmentSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, status } = req.body;
      // super_admin targets any company via the body; company_admin is forced to its own.
      const companyId =
        req.user?.role === ROLES.SUPER_ADMIN ? req.body.companyId : req.user?.companyId;
      if (!companyId) {
        throw new BadRequestError('companyId is required', `module/department/api.ts - /`);
      }
      const item = await create({ name, status, companyId });
      successResponse(res, { data: item, message: 'Department created successfully' });
    }
  )
```

## GET /api/v1/departments/:id

**Source:** `server/src/modules/department/api.ts:66`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    logRequest({}),
    async (req: Request, res: Response) => {
      const item = await getById(String(req.params.id ?? ''), getTenantScope(req.user));
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/department/api.ts - /:id`);
      }
      successResponse(res, { data: item });
    }
  )
```

## PATCH /api/v1/departments/:id

**Source:** `server/src/modules/department/api.ts:83`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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

### Validation declarations

**Body: updateDepartmentSchema** — `server/src/modules/department/validation.ts`

```typescript
export const updateDepartmentSchema = z.strictObject({
  name: z.string().min(1, 'Name is required').optional(),
  status: z.enum(DEPARTMENT_STATUS).optional(),
});
```

### Error examples

- HTTP 400: Invalid request body

### Handler code

```typescript
router.patch(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateBody(updateDepartmentSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, status } = req.body;
      if (!name && !status) {
        throw new BadRequestError('Invalid request body', `module/department/api.ts - /:id`);
      }
      const item = await updateById(
        String(req.params.id ?? ''),
        { name, status },
        getTenantScope(req.user)
      );
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/department/api.ts - /:id`);
      }
      successResponse(res, { data: item, message: 'Department updated successfully' });
    }
  )
```

## DELETE /api/v1/departments/:id

**Source:** `server/src/modules/department/api.ts:109`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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
- Departments containing any teams, including inactive teams, cannot be deleted (409).

### Validation declarations

**Params: deleteDepartmentSchema** — `server/src/modules/department/validation.ts`

```typescript
export const deleteDepartmentSchema = z.object({
  id: idSchema,
});
```

### Error examples

- HTTP 409: This department has teams: deactivate it instead of deleting

### Handler code

```typescript
router.delete(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteDepartmentSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      // Teams point at their department and members derive theirs from the team, so deleting one
      // with teams would orphan them. Deactivate the department instead.
      if (await hasTeams(String(req.params.id ?? ''))) {
        throw new ConflictError(
          'This department has teams: deactivate it instead of deleting',
          `module/department/api.ts - /:id`
        );
      }
      const item = await deleteById(String(req.params.id ?? ''), getTenantScope(req.user));
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/department/api.ts - /:id`);
      }
      successResponse(res, { data: item, message: 'Department deleted successfully' });
    }
  )
```

## GET /api/v1/files

**Source:** `server/src/modules/file/api.ts:42`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Authentication and configured object storage; no conversation is required for the standalone file routes.

**Business logic:** File metadata is independent of Message attachment metadata. Uploads involve external storage, and File has no company field; inspect the actual route access checks rather than inventing a tenant foreign key. Conversation attachments additionally require a visible actionable conversation and provider send.

**Implementation entry points:** `server/src/modules/file/api.ts; modules/file/service.ts; modules/conversation/media.ts`

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

### Validation declarations

**Query: fileUploadValidation.list** — `server/src/modules/file/validation.ts`

```typescript
export const fileUploadValidation = {
  // Validate file upload request
  upload: z.strictObject({
    isPublic: z.boolean().default(false),
    tags: z.array(z.string().trim().max(50)).max(10).default([]),
    metadata: z.record(z.string(), z.any()).default({}),
    folder: z.string().trim().max(100).optional(),
  }),

  // Validate file query parameters
  list: listQuerySchema.extend({
    mimeType: z.string().max(100).optional(),
    isTemporary: z.enum(['true', 'false']).optional(),
  }),

  // Validate file update request
  update: z.strictObject({
    tags: z.array(z.string().trim().max(50)).max(10).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    isPublic: z.boolean().optional(),
  }),

  // Validate download URL request
  downloadUrl: z.object({
    expiresIn: z.coerce.number().int().min(60).max(86400).default(3600), // 1 minute to 24 hours
  }),
};
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/',
    authenticate,
    authorize(...ROLE_VALUES),
    validateQuery(fileUploadValidation.list),
    async (req: Request, res: Response) => {
      const data = await createQueryBuilder(QUERY_CONFIG)
        .query(FileModel, req.query)
        .lean()
        .paginate()
        .execute();

      paginatedSuccessResponse(res, { data });

      // const pipeline: PipelineStage[] = [
      //   {
      //     $addFields: {
      //       url: {
      //         $concat: [
      //           'https://your-bucket.s3.amazonaws.com/', // Your base URL
      //           '$key',
      //         ],
      //       },
      //     },
      //   },
      // ];
      // const data = await aggregateWithPagination(
      //   FileModel,
      //   req.query,
      //   ['filename', 'mimeType', 'createdAt'],
      //   pipeline
      // );
      // paginatedSuccessResponse(res, { data });
    }
  )
```

## POST /api/v1/files/upload-image-single

**Source:** `server/src/modules/file/api.ts:81`

**Access:** No JWT middleware on this route.

**Prerequisites:** Authentication and configured object storage; no conversation is required for the standalone file routes.

**Business logic:** File metadata is independent of Message attachment metadata. Uploads involve external storage, and File has no company field; inspect the actual route access checks rather than inventing a tenant foreign key. Conversation attachments additionally require a visible actionable conversation and provider send.

**Implementation entry points:** `server/src/modules/file/api.ts; modules/file/service.ts; modules/conversation/media.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

- HTTP 400: No file uploaded
- HTTP 500: File Upload Request Failed

### Handler code

```typescript
router.post(
    '/upload-image-single',
    logRequest({}),
    upload({ allowMultiple: false, fieldName: 'file' }),
    // validateRequest({ schema: createSchema }),
    async (req: Request, res: Response, _next: NextFunction) => {
      if (!req.file) {
        logger.error('No file uploaded', req.file);
        throw new BadRequestError('No file uploaded', 'domain/file/api.ts - POST /single-any');
      }
      try {
        const key = generateFileName(req.file.originalname);
        const uploadParams = {
          key,
          body: req.file.buffer,
          contentType: req.file.mimetype,
        };
        const result = await uploadToS3(uploadParams);
        const data = await create({
          filename: req.file?.originalname,
          key: result.key,
          size: req.file?.size,
          mimeType: req.file?.mimetype,
          // uploadedBy: req.user?._id,
        });
        successResponse(res, { data });
      } catch (error) {
        // @TODO: Implement Delete File From S3
        logger.error('File Upload Request Failed', error);
        throw new ServerError('File Upload Request Failed', '/single any catch block');
      }
    }
  )
```

## POST /api/v1/files/upload-image-multiple

**Source:** `server/src/modules/file/api.ts:118`

**Access:** No JWT middleware on this route.

**Prerequisites:** Authentication and configured object storage; no conversation is required for the standalone file routes.

**Business logic:** File metadata is independent of Message attachment metadata. Uploads involve external storage, and File has no company field; inspect the actual route access checks rather than inventing a tenant foreign key. Conversation attachments additionally require a visible actionable conversation and provider send.

**Implementation entry points:** `server/src/modules/file/api.ts; modules/file/service.ts; modules/conversation/media.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

- HTTP 400: No files uploaded
- HTTP 500: Multiple File Upload Request Failed

### Handler code

```typescript
router.post(
    '/upload-image-multiple',
    logRequest({}),
    upload({ allowMultiple: true, fieldName: 'files' }),
    async (req: Request, res: Response, _next: NextFunction) => {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        logger.error('No files uploaded', req.files);
        throw new BadRequestError(
          'No files uploaded',
          'domain/file/api.ts - POST /upload-image-multiple'
        );
      }

      try {
        const results = await Promise.all(
          files.map(async file => {
            const key = generateFileName(file.originalname);
            const uploadParams = {
              key,
              body: file.buffer,
              contentType: file.mimetype,
            };

            const result = await uploadToS3(uploadParams);

            const data = await create({
              filename: file.originalname,
              key: result.key,
              size: file.size,
              mimeType: file.mimetype,
              // uploadedBy: req.user?._id,
            });

            return data;
          })
        );

        successResponse(res, { data: results });
      } catch (error) {
        // @TODO: optionally delete uploaded files from S3 if partial failure
        logger.error('Multiple File Upload Request Failed', error);
        throw new ServerError(
          'Multiple File Upload Request Failed',
          '/upload-image-multiple catch block'
        );
      }
    }
  )
```

## GET /api/v1/brands/:brandId/fixed-replies

**Source:** `server/src/modules/fixed-reply/api.ts:50`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and permitted role. Settings and fixed replies do not require conversations, sessions or comments, and can be learned independently of each other.

**Business logic:** FixedReply stores reusable local text; it is not a provider-approved WhatsApp template. Settings append immutable versions. baseVersion prevents silent overwrites, and the unique scope/type/version index resolves concurrent saves. Virtual version zero provides defaults without inserting a row. SLA later uses the settings in force at clock start.

**Implementation entry points:** `server/src/modules/fixed-reply/service.ts; modules/settings/service.ts; modules/settings/definitions.ts`

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

**Params: brandParamSchema** — `server/src/modules/fixed-reply/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/',
    authenticate,
    authorize(...replyRoles),
    validateParams(brandParamSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await ensureBrand(req);
      const items = await listByBrand(brand.id);
      successResponse(res, { data: items });
    }
  )
```

## POST /api/v1/brands/:brandId/fixed-replies

**Source:** `server/src/modules/fixed-reply/api.ts:66`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and permitted role. Settings and fixed replies do not require conversations, sessions or comments, and can be learned independently of each other.

**Business logic:** FixedReply stores reusable local text; it is not a provider-approved WhatsApp template. Settings append immutable versions. baseVersion prevents silent overwrites, and the unique scope/type/version index resolves concurrent saves. Virtual version zero provides defaults without inserting a row. SLA later uses the settings in force at clock start.

**Implementation entry points:** `server/src/modules/fixed-reply/service.ts; modules/settings/service.ts; modules/settings/definitions.ts`

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

**Params: brandParamSchema** — `server/src/modules/fixed-reply/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

**Body: createFixedReplySchema** — `server/src/modules/fixed-reply/validation.ts`

```typescript
export const createFixedReplySchema = z.strictObject({
  title: z.string().trim().min(1, 'Title is required').max(100, 'Title is too long'),
  body: z.string().trim().min(1, 'Body is required').max(2000, 'Body is too long'),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post(
    '/',
    authenticate,
    authorize(...replyRoles),
    validateParams(brandParamSchema),
    validateBody(createFixedReplySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await ensureBrand(req);
      const { title, body } = req.body as { title: string; body: string };
      const item = await create({ title, body, brandId: brand.id, companyId: brand.companyId });
      successResponse(res, { statusCode: 201, data: item, message: 'Fixed reply created' });
    }
  )
```

## PATCH /api/v1/brands/:brandId/fixed-replies/:id

**Source:** `server/src/modules/fixed-reply/api.ts:84`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and permitted role. Settings and fixed replies do not require conversations, sessions or comments, and can be learned independently of each other.

**Business logic:** FixedReply stores reusable local text; it is not a provider-approved WhatsApp template. Settings append immutable versions. baseVersion prevents silent overwrites, and the unique scope/type/version index resolves concurrent saves. Virtual version zero provides defaults without inserting a row. SLA later uses the settings in force at clock start.

**Implementation entry points:** `server/src/modules/fixed-reply/service.ts; modules/settings/service.ts; modules/settings/definitions.ts`

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

**Params: replyParamsSchema** — `server/src/modules/fixed-reply/validation.ts`

```typescript
export const replyParamsSchema = z.object({
  brandId: idSchema,
  id: idSchema,
});
```

**Body: updateFixedReplySchema** — `server/src/modules/fixed-reply/validation.ts`

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

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.patch(
    '/:id',
    authenticate,
    authorize(...replyRoles),
    validateParams(replyParamsSchema),
    validateBody(updateFixedReplySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await ensureBrand(req);
      const { title, body } = req.body as { title?: string; body?: string };
      const item = await updateById(String(req.params.id ?? ''), brand.id, { title, body });
      if (!item) {
        throw new NotFoundError(`${model} not found`, 'module/fixed-reply/api.ts - /:id');
      }
      successResponse(res, { data: item, message: 'Fixed reply updated' });
    }
  )
```

## DELETE /api/v1/brands/:brandId/fixed-replies/:id

**Source:** `server/src/modules/fixed-reply/api.ts:105`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Visible brand and permitted role. Settings and fixed replies do not require conversations, sessions or comments, and can be learned independently of each other.

**Business logic:** FixedReply stores reusable local text; it is not a provider-approved WhatsApp template. Settings append immutable versions. baseVersion prevents silent overwrites, and the unique scope/type/version index resolves concurrent saves. Virtual version zero provides defaults without inserting a row. SLA later uses the settings in force at clock start.

**Implementation entry points:** `server/src/modules/fixed-reply/service.ts; modules/settings/service.ts; modules/settings/definitions.ts`

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

**Params: replyParamsSchema** — `server/src/modules/fixed-reply/validation.ts`

```typescript
export const replyParamsSchema = z.object({
  brandId: idSchema,
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.delete(
    '/:id',
    authenticate,
    authorize(...replyRoles),
    validateParams(replyParamsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await ensureBrand(req);
      const item = await deleteById(String(req.params.id ?? ''), brand.id);
      if (!item) {
        throw new NotFoundError(`${model} not found`, 'module/fixed-reply/api.ts - /:id');
      }
      successResponse(res, { data: item, message: 'Fixed reply deleted' });
    }
  )
```

## GET /api/v1/brands/:brandId/overview/stats

**Source:** `server/src/modules/overview/api.ts:43`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Visible brand, manager role, stored sessions/comment roots, status history and historical settings. Reports derive from earlier workflows; they do not create support queries.

**Business logic:** Stats count pending sessions now. SLA reporting includes pending/hold/unresolved as open, but stopped resolution clocks are not at risk and retain earlier breaches. Engagement backlog excludes holds. Compliance counts decided targets. Hold rows are computed on read, not stored separately; an overlapping-date filter still returns full-hold durations, capped at 1,000 newest rows.

**Implementation entry points:** `server/src/modules/overview/api.ts; overview/service.ts; overview/holds.ts; modules/settings/service.ts`

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

**Params: brandParamSchema** — `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

**Query: statsQuerySchema** — `server/src/modules/overview/validation.ts`

```typescript
export const statsQuerySchema = z.strictObject({
  platform: z.enum(CHANNEL_PLATFORMS).optional(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/stats',
    authenticate,
    authorize(...overviewRoles),
    validateParams(brandParamSchema),
    validateQuery(statsQuerySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await getBrandById(String(req.params.brandId), getBrandScope(req.user));
      if (!brand) throw new NotFoundError(BRAND_NOT_FOUND, comingFrom);
      const { platform } = req.query as { platform?: ChannelPlatform };
      successResponse(res, { data: await getSessionStats(brand.id, platform) });
    }
  )
```

## GET /api/v1/brands/:brandId/overview/sla

**Source:** `server/src/modules/overview/api.ts:62`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Visible brand, manager role, stored sessions/comment roots, status history and historical settings. Reports derive from earlier workflows; they do not create support queries.

**Business logic:** Stats count pending sessions now. SLA reporting includes pending/hold/unresolved as open, but stopped resolution clocks are not at risk and retain earlier breaches. Engagement backlog excludes holds. Compliance counts decided targets. Hold rows are computed on read, not stored separately; an overlapping-date filter still returns full-hold durations, capped at 1,000 newest rows.

**Implementation entry points:** `server/src/modules/overview/api.ts; overview/service.ts; overview/holds.ts; modules/settings/service.ts`

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

**Params: brandParamSchema** — `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

**Query: slaQuerySchema** — `server/src/modules/overview/validation.ts`

```typescript
export const slaQuerySchema = withRangeChecks(
  z.strictObject({ source: z.enum(SLA_SOURCES).optional(), ...rangeFields })
);
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/sla',
    authenticate,
    authorize(...overviewRoles),
    validateParams(brandParamSchema),
    validateQuery(slaQuerySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await getBrandById(String(req.params.brandId), getBrandScope(req.user));
      if (!brand) throw new NotFoundError(BRAND_NOT_FOUND, comingFrom);
      const query = req.query as {
        source?: SlaSource;
        platform?: ChannelPlatform;
        from?: string;
        to?: string;
      };
      const range = query.from && query.to ? { from: query.from, to: query.to } : defaultRange();
      const data = await getSlaStats({
        brandId: brand.id,
        companyId: brand.companyId,
        source: query.source,
        platform: query.platform,
        ...range,
      });
      successResponse(res, { data });
    }
  )
```

## GET /api/v1/brands/:brandId/overview/engagement

**Source:** `server/src/modules/overview/api.ts:94`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Visible brand, manager role, stored sessions/comment roots, status history and historical settings. Reports derive from earlier workflows; they do not create support queries.

**Business logic:** Stats count pending sessions now. SLA reporting includes pending/hold/unresolved as open, but stopped resolution clocks are not at risk and retain earlier breaches. Engagement backlog excludes holds. Compliance counts decided targets. Hold rows are computed on read, not stored separately; an overlapping-date filter still returns full-hold durations, capped at 1,000 newest rows.

**Implementation entry points:** `server/src/modules/overview/api.ts; overview/service.ts; overview/holds.ts; modules/settings/service.ts`

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

**Params: brandParamSchema** — `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

**Query: rangeQuerySchema** — `server/src/modules/overview/validation.ts`

```typescript
export const rangeQuerySchema = withRangeChecks(z.strictObject(rangeFields));
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/engagement',
    authenticate,
    authorize(...overviewRoles),
    validateParams(brandParamSchema),
    validateQuery(rangeQuerySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await getBrandById(String(req.params.brandId), getBrandScope(req.user));
      if (!brand) throw new NotFoundError(BRAND_NOT_FOUND, comingFrom);
      const query = req.query as { platform?: ChannelPlatform; from?: string; to?: string };
      const range = query.from && query.to ? { from: query.from, to: query.to } : defaultRange();
      const data = await getEngagementStats({
        brandId: brand.id,
        platform: query.platform,
        ...range,
      });
      successResponse(res, { data });
    }
  )
```

## GET /api/v1/brands/:brandId/overview/inbound-trend

**Source:** `server/src/modules/overview/api.ts:119`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Visible brand, manager role, stored sessions/comment roots, status history and historical settings. Reports derive from earlier workflows; they do not create support queries.

**Business logic:** Stats count pending sessions now. SLA reporting includes pending/hold/unresolved as open, but stopped resolution clocks are not at risk and retain earlier breaches. Engagement backlog excludes holds. Compliance counts decided targets. Hold rows are computed on read, not stored separately; an overlapping-date filter still returns full-hold durations, capped at 1,000 newest rows.

**Implementation entry points:** `server/src/modules/overview/api.ts; overview/service.ts; overview/holds.ts; modules/settings/service.ts`

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

**Params: brandParamSchema** — `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

**Query: rangeQuerySchema** — `server/src/modules/overview/validation.ts`

```typescript
export const rangeQuerySchema = withRangeChecks(z.strictObject(rangeFields));
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/inbound-trend',
    authenticate,
    authorize(...overviewRoles),
    validateParams(brandParamSchema),
    validateQuery(rangeQuerySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await getBrandById(String(req.params.brandId), getBrandScope(req.user));
      if (!brand) throw new NotFoundError(BRAND_NOT_FOUND, comingFrom);
      const query = req.query as { platform?: ChannelPlatform; from?: string; to?: string };
      const range = query.from && query.to ? { from: query.from, to: query.to } : defaultRange();
      const data = await getInboundTrend({ brandId: brand.id, platform: query.platform, ...range });
      successResponse(res, { data });
    }
  )
```

## GET /api/v1/brands/:brandId/overview/sla-compliance

**Source:** `server/src/modules/overview/api.ts:140`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Visible brand, manager role, stored sessions/comment roots, status history and historical settings. Reports derive from earlier workflows; they do not create support queries.

**Business logic:** Stats count pending sessions now. SLA reporting includes pending/hold/unresolved as open, but stopped resolution clocks are not at risk and retain earlier breaches. Engagement backlog excludes holds. Compliance counts decided targets. Hold rows are computed on read, not stored separately; an overlapping-date filter still returns full-hold durations, capped at 1,000 newest rows.

**Implementation entry points:** `server/src/modules/overview/api.ts; overview/service.ts; overview/holds.ts; modules/settings/service.ts`

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

**Params: brandParamSchema** — `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

**Query: rangeQuerySchema** — `server/src/modules/overview/validation.ts`

```typescript
export const rangeQuerySchema = withRangeChecks(z.strictObject(rangeFields));
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/sla-compliance',
    authenticate,
    authorize(...overviewRoles),
    validateParams(brandParamSchema),
    validateQuery(rangeQuerySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await getBrandById(String(req.params.brandId), getBrandScope(req.user));
      if (!brand) throw new NotFoundError(BRAND_NOT_FOUND, comingFrom);
      const query = req.query as { platform?: ChannelPlatform; from?: string; to?: string };
      const range = query.from && query.to ? { from: query.from, to: query.to } : defaultRange();
      const data = await getSlaCompliance({
        brandId: brand.id,
        companyId: brand.companyId,
        platform: query.platform,
        ...range,
      });
      successResponse(res, { data });
    }
  )
```

## GET /api/v1/brands/:brandId/overview/holds

**Source:** `server/src/modules/overview/api.ts:167`

**Access:** Access-token cookie or Bearer token; active company required for tenant roles. Only super_admin, company_owner and company_admin; brand visibility still applies. Query managers receive 403.

**Prerequisites:** Visible brand, manager role, stored sessions/comment roots, status history and historical settings. Reports derive from earlier workflows; they do not create support queries.

**Business logic:** Resolve a visible brand; validate the paired date range; read session/root histories and historical business hours; pair hold entries with the next transition; keep overlapping holds, sort newest first and cap at 1,000. Return complete hold durations, with open holds measured to now.

**Implementation entry points:** `server/src/modules/overview/api.ts; overview/service.ts; overview/holds.ts; modules/settings/service.ts`

### Request example

```sh
curl -i "${BASE_URL}/api/v1/brands/670000000000000000000004/overview/holds?from=2026-10-17&to=2026-10-17&source=sessions" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "source": "session",
      "id": "670000000000000000000006",
      "conversationId": "670000000000000000000005",
      "heldBy": {
        "id": "670000000000000000000002",
        "name": "Amina Rahman",
        "role": "company_admin"
      },
      "reason": "Waiting for warehouse confirmation",
      "startedAt": "2026-10-17T04:10:00.000Z",
      "endedAt": "2026-10-17T04:40:00.000Z",
      "endedBy": {
        "cause": "reply",
        "by": {
          "id": "670000000000000000000002",
          "name": "Amina Rahman",
          "role": "company_admin"
        }
      },
      "durationMs": 1800000,
      "businessMs": 1800000
    }
  ]
}
```

- Omit source to include sessions and comments. source accepts sessions or comments, not singular names.
- Both from/to or neither; defaults to last 30 days. Inclusive Asia/Dhaka dates, at most one year. platform/page/limit are not accepted.
- Returns at most 1,000 overlapping holds, newest first, without pagination or a truncation flag. Durations cover the entire hold, not just its overlap with the requested range.
- Active holds have endedAt and endedBy null; durations run to read time. Business hours are those at the query clock start.
- No separate hold collection: deleting a thread removes its stored holds; session merge is no longer supported.
- Named actors now include role, resolved at read time with the current name. Deleted users retain id with name and role null; neither field is a historical snapshot.

### Validation declarations

**Params: brandParamSchema** — `server/src/modules/overview/validation.ts`

```typescript
export const brandParamSchema = z.object({
  brandId: idSchema,
});
```

**Query: holdsQuerySchema** — `server/src/modules/overview/validation.ts`

```typescript
export const holdsQuerySchema = withRangeChecks(
  z.strictObject({
    from: rangeFields.from,
    to: rangeFields.to,
    source: z.enum(HOLD_SOURCES).optional(),
  })
);
```

### Error examples

- HTTP 403: You do not have permission to access this resource

### Handler code

```typescript
router.get(
    '/holds',
    authenticate,
    authorize(...overviewRoles),
    validateParams(brandParamSchema),
    validateQuery(holdsQuerySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brand = await getBrandById(String(req.params.brandId), getBrandScope(req.user));
      if (!brand) throw new NotFoundError(BRAND_NOT_FOUND, comingFrom);
      const query = req.query as { from?: string; to?: string; source?: HoldSource };
      const range = query.from && query.to ? { from: query.from, to: query.to } : defaultRange();
      const data = await listHolds({
        brandId: brand.id,
        companyId: brand.companyId,
        source: query.source,
        ...range,
      });
      successResponse(res, { data });
    }
  )
```

## GET /api/v1/query-managers

**Source:** `server/src/modules/query-manager/api.ts:46`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company, active department, active team and manager role. Create the department and team before the query manager.

**Business logic:** Query managers are Users with role query_manager. Create requires teamId; resolveMembership validates an active team in an active department of the same company and writes teamId plus derived departmentId together. Re-sending an unchanged team skips revalidation, so existing members of inactive teams remain editable. List accepts teamId and departmentId filters.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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

**Query: listQueryManagersSchema** — `server/src/modules/query-manager/validation.ts`

```typescript
export const listQueryManagersSchema = listQuerySchema.extend({
  departmentId: idSchema.optional(),
  teamId: idSchema.optional(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateQuery(listQueryManagersSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const data = await search(req.query, getTenantScope(req.user));
      paginatedSuccessResponse(res, { data });
    }
  )
```

## POST /api/v1/query-managers

**Source:** `server/src/modules/query-manager/api.ts:61`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company, active department, active team and manager role. Create the department and team before the query manager.

**Business logic:** Query managers are Users with role query_manager. Create requires teamId; resolveMembership validates an active team in an active department of the same company and writes teamId plus derived departmentId together. Re-sending an unchanged team skips revalidation, so existing members of inactive teams remain editable. List accepts teamId and departmentId filters.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/query-managers" \
  -b cookies.txt -c cookies.txt \
  -F "name=Amina Rahman" \
  -F "email=amina@example.com" \
  -F "password=ExamplePassword1!" \
  -F "teamId=670000000000000000000020" \
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
    "companyId": "670000000000000000000001",
    "teamId": "670000000000000000000020",
    "departmentId": "670000000000000000000003"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- File field: avatar. Let curl/browser set the multipart boundary.
- For a super_admin creating a tenant resource, also supply companyId where the schema permits it. Tenant callers use their own company; role assignment is additionally restricted.

### Validation declarations

**Body: createQueryManagerSchema** — `server/src/modules/query-manager/validation.ts`

```typescript
export const createQueryManagerSchema = z.strictObject({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email format').min(1, 'Email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  // The team the query manager belongs to (active, within the company). Their department is the
  // team's, so it isn't accepted here.
  teamId: idSchema,
  // Only honoured for super_admin; company_owner/company_admin are forced to their own company.
  companyId: idSchema.optional(),
});
```

### Error examples

- HTTP 400: companyId is required

### Handler code

```typescript
router.post(
    '/',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    // multer must run before validateBody so any multipart text fields populate req.body.
    // The avatar file is optional; sending JSON (no file) is also supported.
    upload({ fieldName: 'avatar' }),
    validateBody(createQueryManagerSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, email, password, teamId } = req.body;

      // super_admin targets any company via the body; company roles are forced to their own.
      const companyId =
        req.user?.role === ROLES.SUPER_ADMIN ? req.body.companyId : req.user?.companyId;
      if (!companyId) {
        throw new BadRequestError('companyId is required', `module/query-manager/api.ts - /`);
      }

      const membership = await resolveMembership(
        teamId,
        companyId,
        `module/query-manager/api.ts - /`
      );

      // Avatar is optional — only persist a key when a file was uploaded.
      const avatar = await saveAvatar(req.file);

      try {
        const item = await create({ name, email, password, companyId, ...membership, avatar });
        successResponse(res, { data: item, message: 'Query manager created successfully' });
      } catch (error) {
        // Avoid an orphaned file if the insert fails (e.g. duplicate email).
        if (avatar) await deleteLocal(avatar);
        throw error;
      }
    }
  )
```

## GET /api/v1/query-managers/:id

**Source:** `server/src/modules/query-manager/api.ts:103`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company, active department, active team and manager role. Create the department and team before the query manager.

**Business logic:** Query managers are Users with role query_manager. Create requires teamId; resolveMembership validates an active team in an active department of the same company and writes teamId plus derived departmentId together. Re-sending an unchanged team skips revalidation, so existing members of inactive teams remain editable. List accepts teamId and departmentId filters.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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
    "companyId": "670000000000000000000001",
    "teamId": "670000000000000000000020",
    "departmentId": "670000000000000000000003"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    logRequest({}),
    async (req: Request, res: Response) => {
      const item = await getById(String(req.params.id ?? ''), getTenantScope(req.user));
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/query-manager/api.ts - /:id`);
      }
      successResponse(res, { data: item });
    }
  )
```

## PATCH /api/v1/query-managers/:id

**Source:** `server/src/modules/query-manager/api.ts:120`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company, active department, active team and manager role. Create the department and team before the query manager.

**Business logic:** Query managers are Users with role query_manager. Create requires teamId; resolveMembership validates an active team in an active department of the same company and writes teamId plus derived departmentId together. Re-sending an unchanged team skips revalidation, so existing members of inactive teams remain editable. List accepts teamId and departmentId filters.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/query-managers/670000000000000000000002" \
  -b cookies.txt -c cookies.txt \
  -F "name=Amina Rahman Updated" \
  -F "avatar=@./photo.png" \
  -F "teamId=670000000000000000000020"
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
    "companyId": "670000000000000000000001",
    "teamId": "670000000000000000000020",
    "departmentId": "670000000000000000000003"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- File field: avatar. Let curl/browser set the multipart boundary.

### Validation declarations

**Body: updateQueryManagerSchema** — `server/src/modules/query-manager/validation.ts`

```typescript
export const updateQueryManagerSchema = z.strictObject({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.email('Invalid email format').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  teamId: idSchema.optional(),
});
```

### Error examples

- HTTP 400: Invalid request body

### Handler code

```typescript
router.patch(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    upload({ fieldName: 'avatar' }),
    validateBody(updateQueryManagerSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, email, password, teamId } = req.body;
      if (!hasUpdatePayload(req.body, req.file)) {
        throw new BadRequestError('Invalid request body', `module/query-manager/api.ts - /:id`);
      }

      const scope = getTenantScope(req.user);
      const existing = await getById(String(req.params.id ?? ''), scope);
      if (!existing) {
        throw new NotFoundError(`${model} not found`, `module/query-manager/api.ts - /:id`);
      }

      // A new team must be joinable, within the manager's own company. Re-sending the current team
      // (the edit form always sends it) is a no-op, so someone whose team was deactivated since can
      // still have their name or password changed.
      const membership: Membership | undefined =
        teamId && teamId !== existing.teamId?.toString()
          ? await resolveMembership(
              teamId,
              existing.companyId,
              `module/query-manager/api.ts - /:id`
            )
          : undefined;

      const newAvatar = await saveAvatar(req.file);
      const update = { name, email, password, ...membership, avatar: newAvatar };

      try {
        const item = await updateById(String(req.params.id ?? ''), update, scope);
        if (!item) {
          throw new NotFoundError(`${model} not found`, `module/query-manager/api.ts - /:id`);
        }
        // Remove the old avatar only after the update succeeded.
        if (newAvatar && existing.avatar) {
          await deleteLocal(existing.avatar);
        }
        successResponse(res, { data: item, message: 'Query manager updated successfully' });
      } catch (error) {
        // The update failed after writing the new file — clean it up.
        if (newAvatar) await deleteLocal(newAvatar);
        throw error;
      }
    }
  )
```

## DELETE /api/v1/query-managers/:id

**Source:** `server/src/modules/query-manager/api.ts:175`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Company, active department, active team and manager role. Create the department and team before the query manager.

**Business logic:** Query managers are Users with role query_manager. Create requires teamId; resolveMembership validates an active team in an active department of the same company and writes teamId plus derived departmentId together. Re-sending an unchanged team skips revalidation, so existing members of inactive teams remain editable. List accepts teamId and departmentId filters.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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
    "companyId": "670000000000000000000001",
    "teamId": "670000000000000000000020",
    "departmentId": "670000000000000000000003"
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.

### Validation declarations

**Params: deleteQueryManagerSchema** — `server/src/modules/query-manager/validation.ts`

```typescript
export const deleteQueryManagerSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.delete(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteQueryManagerSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const item = await deleteById(String(req.params.id ?? ''), getTenantScope(req.user));
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/query-manager/api.ts - /:id`);
      }
      if (item.avatar) await deleteLocal(item.avatar);
      successResponse(res, { data: item, message: 'Query manager deleted successfully' });
    }
  )
```

## GET /api/v1/sessions

**Source:** `server/src/modules/session/api.ts:91`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Conversation and session. Tags need the brand vocabulary; assignees need eligible staff/departments. Status reporting requires manager access; SLA depends on settings.

**Business logic:** Wrap-up records the outcome; notes stay internal. hold/unresolved/resolved stop resolution, and pending resumes it. A customer message reopens unresolved work; a qualifying agent reply ends hold. A same-status save does not append history. Status changes mirror the latest session onto Conversation. Session merging is removed; status changes require status and optional reason.

**Implementation entry points:** `server/src/modules/session/api.ts; session/service.ts; session/status-log.ts; session/status-history.ts; session/sla.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Query: listSessionsSchema** — `server/src/modules/session/validation.ts`

```typescript
export const listSessionsSchema = cursorListQuerySchema.extend({
  conversationId: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/',
    authenticate,
    authorize(...READ_ROLES),
    validateQuery(listSessionsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const conversationId = String(req.query.conversationId ?? '');
      // The parent thread carries the access decision — its brand must be visible to the caller.
      await loadVisibleConversation(conversationId, req.user, `${comingFrom} - GET /`);
      const data = await listSessions(conversationId, req.query);
      paginatedSuccessResponse(res, { data });
    }
  )
```

## GET /api/v1/sessions/assignees

**Source:** `server/src/modules/session/api.ts:112`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Conversation and session. Tags need the brand vocabulary; assignees need eligible staff/departments. Status reporting requires manager access; SLA depends on settings.

**Business logic:** Wrap-up records the outcome; notes stay internal. hold/unresolved/resolved stop resolution, and pending resumes it. A customer message reopens unresolved work; a qualifying agent reply ends hold. A same-status save does not append history. Status changes mirror the latest session onto Conversation. Session merging is removed; status changes require status and optional reason.

**Implementation entry points:** `server/src/modules/session/api.ts; session/service.ts; session/status-log.ts; session/status-history.ts; session/sla.ts`

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
    "queryManagers": [],
    "teams": [
      {
        "id": "670000000000000000000020",
        "name": "Night shift",
        "departmentName": "Support"
      }
    ]
  }
}
```

- Record visibility and tenant checks still apply; a valid role alone does not grant access.
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.
- Includes departments, teams and queryManagers. Team entries include departmentName; inactive teams or departments take no new assignments.

### Validation declarations

**Query: assigneesQuerySchema** — `server/src/modules/session/validation.ts`

```typescript
export const assigneesQuerySchema = z.object({
  brandId: idSchema,
});
```

### Error examples

- HTTP 404: Brand not found

### Handler code

```typescript
router.get(
    '/assignees',
    authenticate,
    authorize(...READ_ROLES),
    validateQuery(assigneesQuerySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const brandId = String(req.query.brandId ?? '');
      // getBrandScope gates a query manager to brands assigned to them / their department.
      const brand = await getBrandById(brandId, getBrandScope(req.user));
      if (!brand) {
        throw new NotFoundError('Brand not found', `${comingFrom} - GET /assignees`);
      }
      const data = await listBrandAssignees(brand, getTenantScope(req.user));
      successResponse(res, { data });
    }
  )
```

## GET /api/v1/sessions/:id

**Source:** `server/src/modules/session/api.ts:133`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Conversation and session. Tags need the brand vocabulary; assignees need eligible staff/departments. Status reporting requires manager access; SLA depends on settings.

**Business logic:** Wrap-up records the outcome; notes stay internal. hold/unresolved/resolved stop resolution, and pending resumes it. A customer message reopens unresolved work; a qualifying agent reply ends hold. A same-status save does not append history. Status changes mirror the latest session onto Conversation. Session merging is removed; status changes require status and optional reason.

**Implementation entry points:** `server/src/modules/session/api.ts; session/service.ts; session/status-log.ts; session/status-history.ts; session/sla.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(sessionIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { session } = await ensureVisibleSession(String(req.params.id ?? ''), req.user);
      successResponse(res, { data: session });
    }
  )
```

## GET /api/v1/sessions/:id/sla

**Source:** `server/src/modules/session/api.ts:149`

**Access:** Any authenticated inbox read role with visible session/conversation; personal ownership is not required for this read.

**Prerequisites:** Visible session. Usage is null before the first customer message or when no SLA snapshot exists.

**Business logic:** slaUsage reads the historical business schedule at firstCustomerMessageAt. First-response usage ends at firstResponseAt, otherwise resolvedAt, otherwise asOf. Resolution usage adds finished usedMs to business time since waitingSince when running. It reads usage without mutating the stored SLA.

**Implementation entry points:** `server/src/modules/session/api.ts; server/src/modules/session/sla.ts:slaUsage`

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/sessions/670000000000000000000006/sla" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "asOf": "2026-10-19T04:30:00.000Z",
    "timezone": "Asia/Dhaka",
    "firstResponseMs": 300000,
    "resolutionUsedMs": 1800000
  }
}
```

- Example assumes 10:00 Dhaka customer start, 10:05 response and 10:30 read, without pauses on a working day.
- data is null without a start or snapshot. Each unmeasured/disabled clock has null usage independently. Values are milliseconds of business time, not wall-clock duration.
- The inbox detail view polls this read every 60 seconds while enabled. Badge state derives from the session snapshot; it does not require this request.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/sla',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(sessionIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { session } = await ensureVisibleSession(String(req.params.id ?? ''), req.user);
      successResponse(res, { data: await slaUsage(session) });
    }
  )
```

## PATCH /api/v1/sessions/:id/status

**Source:** `server/src/modules/session/api.ts:164`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Conversation and session. Tags need the brand vocabulary; assignees need eligible staff/departments. Status reporting requires manager access; SLA depends on settings.

**Business logic:** ensureVisibleSession checks visibility and action permission. changeStatus writes the required status and optional reason through the revision-guarded writer, then refreshes summary/SLA state. Same-status saves do not append status history. mergeWithPrevious is no longer accepted.

**Implementation entry points:** `server/src/modules/session/api.ts; session/service.ts; session/status-log.ts; session/status-history.ts; session/sla.ts`

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/sessions/670000000000000000000006/status" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"status":"hold","reason":"Waiting for warehouse confirmation"}'
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
    "status": "hold",
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
- Optional reason is trimmed and limited to 500 characters. Only a real status transition appends a log; re-saving the same status does not replace its reason.
- hold, unresolved and resolved stop resolution time. First-response time is independent of these pauses.
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.
- The strict body requires status and accepts optional reason. mergeWithPrevious is an unsupported key and returns 400.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

**Body: changeStatusSchema** — `server/src/modules/session/validation.ts`

```typescript
export const changeStatusSchema = z.strictObject({
  status: z.enum(SESSION_STATUSES),
  reason: statusReasonSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.patch(
    '/:id/status',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(sessionIdSchema),
    validateBody(changeStatusSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      await ensureVisibleSession(id, req.user, { act: true });

      const { status, reason } = req.body as ChangeStatusInput;
      const updated = await changeStatus(id, { status, statusChangedBy: req.user?.id, reason });
      successResponse(res, { data: updated, message: 'Session status updated' });
    }
  )
```

## GET /api/v1/sessions/:id/status-log

**Source:** `server/src/modules/session/api.ts:185`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant and brand visibility checks still apply.

**Prerequisites:** Conversation and session. Tags need the brand vocabulary; assignees need eligible staff/departments. Status reporting requires manager access; SLA depends on settings.

**Business logic:** After manager-role and record-visibility checks, explicitly read the hidden statusLog and resolve actor names. Comment replies resolve to their thread root. Return oldest first; unknown actors/reasons are null and deleted users retain their ID with name null.

**Implementation entry points:** `server/src/modules/session/api.ts; session/service.ts; session/status-log.ts; session/status-history.ts; session/sla.ts`

### Request example

```sh
curl -i "${BASE_URL}/api/v1/sessions/670000000000000000000006/status-log" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "status": "hold",
      "at": "2026-10-17T04:10:00.000Z",
      "cause": "agent",
      "by": {
        "id": "670000000000000000000002",
        "name": "Amina Rahman",
        "role": "company_admin"
      },
      "reason": "Waiting for warehouse confirmation"
    },
    {
      "status": "pending",
      "at": "2026-10-17T04:40:00.000Z",
      "cause": "reply",
      "by": {
        "id": "670000000000000000000002",
        "name": "Amina Rahman",
        "role": "company_admin"
      },
      "reason": null
    }
  ]
}
```

- History is oldest first; no history returns an empty array.
- by is null for an unknown actor; a deleted user retains id with name null. Missing reason is null.
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.
- Named actors now include role, resolved at read time with the current name. Deleted users retain id with name and role null; neither field is a historical snapshot.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

- HTTP 403: You do not have permission to access this resource

### Handler code

```typescript
router.get(
    '/:id/status-log',
    authenticate,
    authorize(...MANAGER_ROLES),
    validateParams(sessionIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      await ensureVisibleSession(id, req.user);
      successResponse(res, { data: await namedStatusLog(await readStatusLog(SessionModel, id)) });
    }
  )
```

## GET /api/v1/sessions/:id/assignment-log

**Source:** `server/src/modules/session/api.ts:202`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant/brand visibility still applies. Query managers receive 403.

**Prerequisites:** Company, brand visibility and eligible organizational membership.

**Business logic:** Explicitly read the hidden assignmentLog from the visible session or comment root, resolve actors and return oldest first. Assignee names are stored snapshots, actor name/role are current read-time labels; cleared assignments are null.

**Implementation entry points:** `server/src/modules/session/status-history.ts:readAssignmentLog, namedAssignmentLog`

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/sessions/670000000000000000000006/assignment-log" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "assignee": {
        "kind": "team",
        "id": "670000000000000000000020",
        "name": "Night shift"
      },
      "at": "2026-10-19T04:15:00.000Z",
      "cause": "forwarded",
      "by": {
        "id": "670000000000000000000002",
        "name": "Amina Rahman",
        "role": "query_manager"
      },
      "note": "Please check the warehouse delivery update"
    }
  ]
}
```

- Causes are routed, claimed or forwarded. Missing actor/note is null. Empty history returns [].
- This is an embedded history, not a separate collection or a reconstruction of all legacy assignments. Comment reply IDs resolve to their root.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/assignment-log',
    authenticate,
    authorize(...MANAGER_ROLES),
    validateParams(sessionIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      await ensureVisibleSession(id, req.user);
      const log = await readAssignmentLog(SessionModel, id);
      successResponse(res, { data: await namedAssignmentLog(log) });
    }
  )
```

## GET /api/v1/sessions/:id/wrap-up-log

**Source:** `server/src/modules/session/api.ts:220`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant/brand visibility still applies. Query managers receive 403.

**Prerequisites:** Company, brand visibility and eligible organizational membership.

**Business logic:** Read hidden wrapUpLog and resolve actors plus current tag names. Return oldest-first entries containing before/after changes for sentiment, tags, summary and sessionType (sessions only). Status changes are read through status-log.

**Implementation entry points:** `server/src/modules/session/wrap-up-log.ts; server/src/modules/session/status-history.ts:readWrapUpLog, namedWrapUpLog`

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/sessions/670000000000000000000006/wrap-up-log" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "at": "2026-10-19T04:20:00.000Z",
      "by": {
        "id": "670000000000000000000002",
        "name": "Amina Rahman",
        "role": "query_manager"
      },
      "changes": [
        {
          "field": "sentiment",
          "from": "NEUTRAL",
          "to": "POSITIVE"
        },
        {
          "field": "resolutionSummary",
          "from": null,
          "to": "Confirmed the delivery update"
        }
      ]
    }
  ]
}
```

- Missing scalar values become null; missing tags become []. Tag changes return current names, with Deleted tag for a missing ID.
- Actor name and role are current labels. The history records actual edits, including standalone tag/sentiment changes, not just pressing the wrap-up button.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/wrap-up-log',
    authenticate,
    authorize(...MANAGER_ROLES),
    validateParams(sessionIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      await ensureVisibleSession(id, req.user);
      const log = await readWrapUpLog(SessionModel, id);
      successResponse(res, { data: await namedWrapUpLog(log) });
    }
  )
```

## PATCH /api/v1/sessions/:id/sentiment

**Source:** `server/src/modules/session/api.ts:237`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Conversation and session. Tags need the brand vocabulary; assignees need eligible staff/departments. Status reporting requires manager access; SLA depends on settings.

**Business logic:** Wrap-up records the outcome; notes stay internal. hold/unresolved/resolved stop resolution, and pending resumes it. A customer message reopens unresolved work; a qualifying agent reply ends hold. A same-status save does not append history. Status changes mirror the latest session onto Conversation. Session merging is removed; status changes require status and optional reason.

**Implementation entry points:** `server/src/modules/session/api.ts; session/service.ts; session/status-log.ts; session/status-history.ts; session/sla.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.
- Actual sentiment, type (sessions), tag or summary changes append wrapUpLog with before/after values; reordered tags and equivalent empty/absent summaries do not produce edits. Status transitions use the separate statusLog.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

**Body: setSentimentSchema** — `server/src/modules/session/validation.ts`

```typescript
export const setSentimentSchema = z.strictObject({
  sentiment: z.enum(SESSION_SENTIMENTS),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.patch(
    '/:id/sentiment',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(sessionIdSchema),
    validateBody(setSentimentSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      await ensureVisibleSession(id, req.user, { act: true });

      const { sentiment } = req.body as {
        sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED';
      };
      const updated = await setSentiment(id, sentiment, {}, req.user?.id);

      successResponse(res, { data: updated, message: 'Session sentiment updated' });
    }
  )
```

## PATCH /api/v1/sessions/:id/wrap-up

**Source:** `server/src/modules/session/api.ts:262`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Conversation and session. Tags need the brand vocabulary; assignees need eligible staff/departments. Status reporting requires manager access; SLA depends on settings.

**Business logic:** Wrap-up records the outcome; notes stay internal. hold/unresolved/resolved stop resolution, and pending resumes it. A customer message reopens unresolved work; a qualifying agent reply ends hold. A same-status save does not append history. Status changes mirror the latest session onto Conversation. Session merging is removed; status changes require status and optional reason.

**Implementation entry points:** `server/src/modules/session/api.ts; session/service.ts; session/status-log.ts; session/status-history.ts; session/sla.ts`

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
- Optional reason is trimmed and limited to 500 characters. Only a real status transition appends a log; re-saving the same status does not replace its reason.
- hold, unresolved and resolved stop resolution time. First-response time is independent of these pauses.
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.
- Actual sentiment, type (sessions), tag or summary changes append wrapUpLog with before/after values; reordered tags and equivalent empty/absent summaries do not produce edits. Status transitions use the separate statusLog.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

**Body: wrapUpSchema** — `server/src/modules/session/validation.ts`

```typescript
export const wrapUpSchema = z.strictObject({
  status: z.enum(['unresolved', 'resolved', 'hold']),
  reason: statusReasonSchema,
  sentiment: z.enum(SESSION_SENTIMENTS),
  sessionType: z.enum(SESSION_TYPES),
  resolutionSummary: z.string().trim().max(8000, 'Resolution summary is too long').optional(),
  tagIds: z
    .array(idSchema)
    .max(MAX_TAGS_PER_RECORD, `A record can carry at most ${MAX_TAGS_PER_RECORD} tags`),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.patch(
    '/:id/wrap-up',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(sessionIdSchema),
    validateBody(wrapUpSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      const { brand } = await ensureVisibleSession(id, req.user, { act: true });

      const { status, reason, sentiment, sessionType, resolutionSummary, tagIds } =
        req.body as WrapUpInput;
      const tags = await resolveTagIds(brand._id, tagIds, `${comingFrom} - PATCH /:id/wrap-up`);

      const updated = await wrapUp(id, {
        status,
        sentiment,
        sessionType,
        resolutionSummary,
        tags,
        statusChangedBy: req.user?.id,
        reason,
      });

      successResponse(res, { data: updated, message: 'Session wrapped up' });
    }
  )
```

## PATCH /api/v1/sessions/:id/assignment

**Source:** `server/src/modules/session/api.ts:297`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant and brand visibility checks still apply.

**Prerequisites:** Conversation and session. Tags need the brand vocabulary; assignees need eligible staff/departments. Status reporting requires manager access; SLA depends on settings.

**Business logic:** Owners/admins route a non-resolved session or comment root after brand visibility and target validation. Conversation routes resolve the latest session; comment reply IDs resolve the thread root. A conditional open-only write prevents routing a query resolved concurrently. Update the conversation mirror where relevant and emit assignment:changed.

**Implementation entry points:** `server/src/modules/session/api.ts; session/service.ts; session/status-log.ts; session/status-history.ts; session/sla.ts`

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
- Use {"assigneeType":null} to clear; response message becomes Session unassigned.
- assigneeType accepts query_manager, team, department or null (clear). The target must be eligible for this brand; inactive teams/departments take no new work.
- Resolved work rejects assignment changes with 409. Routing and claiming preserve status, including hold.
- A real assignment write appends assignmentLog in the same document update. An already-matching target produces no write/log; comments report Assignment unchanged.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

**Body: assignSessionSchema** — `server/src/modules/session/validation.ts`

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

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.patch(
    '/:id/assignment',
    authenticate,
    authorize(...MANAGER_ROLES),
    validateParams(sessionIdSchema),
    validateBody(assignSessionSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      // ensureVisibleSession already resolved (and access-checked) the brand — reuse it to validate
      // the assignee below rather than fetching the brand a second time.
      const { session, brand } = await ensureVisibleSession(id, req.user);
      const choice = req.body as AssigneeChoice;
      const updated = await routeSession(
        session,
        brand,
        choice,
        req.user as Express.User,
        `${comingFrom} - PATCH /:id/assignment`
      );
      successResponse(res, {
        data: updated,
        message: choice.assigneeType === null ? 'Session unassigned' : 'Session assigned',
      });
    }
  )
```

## PUT /api/v1/sessions/:id/tags

**Source:** `server/src/modules/session/api.ts:329`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Conversation and session. Tags need the brand vocabulary; assignees need eligible staff/departments. Status reporting requires manager access; SLA depends on settings.

**Business logic:** Wrap-up records the outcome; notes stay internal. hold/unresolved/resolved stop resolution, and pending resumes it. A customer message reopens unresolved work; a qualifying agent reply ends hold. A same-status save does not append history. Status changes mirror the latest session onto Conversation. Session merging is removed; status changes require status and optional reason.

**Implementation entry points:** `server/src/modules/session/api.ts; session/service.ts; session/status-log.ts; session/status-history.ts; session/sla.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.
- Actual sentiment, type (sessions), tag or summary changes append wrapUpLog with before/after values; reordered tags and equivalent empty/absent summaries do not produce edits. Status transitions use the separate statusLog.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

**Body: setSessionTagsSchema** — `server/src/modules/session/validation.ts`

```typescript
export const setSessionTagsSchema = z.strictObject({
  tagIds: z
    .array(idSchema)
    .max(MAX_TAGS_PER_RECORD, `A record can carry at most ${MAX_TAGS_PER_RECORD} tags`),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.put(
    '/:id/tags',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(sessionIdSchema),
    validateBody(setSessionTagsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      // Reuse the brand ensureVisibleSession already resolved (and access-checked) to validate ids.
      const { brand } = await ensureVisibleSession(id, req.user, { act: true });

      const { tagIds } = req.body as { tagIds: string[] };
      const tags = await resolveTagIds(brand._id, tagIds, `${comingFrom} - PUT /:id/tags`);

      const updated = await setTags(id, tags, {}, req.user?.id);
      successResponse(res, { data: updated, message: 'Session tags updated' });
    }
  )
```

## GET /api/v1/sessions/:id/notes

**Source:** `server/src/modules/session/api.ts:352`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Conversation and session. Tags need the brand vocabulary; assignees need eligible staff/departments. Status reporting requires manager access; SLA depends on settings.

**Business logic:** Wrap-up records the outcome; notes stay internal. hold/unresolved/resolved stop resolution, and pending resumes it. A customer message reopens unresolved work; a qualifying agent reply ends hold. A same-status save does not append history. Status changes mirror the latest session onto Conversation. Session merging is removed; status changes require status and optional reason.

**Implementation entry points:** `server/src/modules/session/api.ts; session/service.ts; session/status-log.ts; session/status-history.ts; session/sla.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/notes',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(sessionIdSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { session } = await ensureVisibleSession(String(req.params.id ?? ''), req.user);
      const notes = await listNotes(session.id);
      successResponse(res, { data: notes });
    }
  )
```

## POST /api/v1/sessions/:id/notes

**Source:** `server/src/modules/session/api.ts:368`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin, query_manager.

**Prerequisites:** Conversation and session. Tags need the brand vocabulary; assignees need eligible staff/departments. Status reporting requires manager access; SLA depends on settings.

**Business logic:** Wrap-up records the outcome; notes stay internal. hold/unresolved/resolved stop resolution, and pending resumes it. A customer message reopens unresolved work; a qualifying agent reply ends hold. A same-status save does not append history. Status changes mirror the latest session onto Conversation. Session merging is removed; status changes require status and optional reason.

**Implementation entry points:** `server/src/modules/session/api.ts; session/service.ts; session/status-log.ts; session/status-history.ts; session/sla.ts`

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
- Query-manager mutations require personal assignment. Department/team pools permit claiming, not direct modification. Page-authored comment threads are the documented exception for reply/moderation.

### Validation declarations

**Params: sessionIdSchema** — `server/src/modules/session/validation.ts`

```typescript
export const sessionIdSchema = z.object({
  id: idSchema,
});
```

**Body: addNoteSchema** — `server/src/modules/session/validation.ts`

```typescript
export const addNoteSchema = z.strictObject({
  text: z.string().trim().min(1, 'Note text is required').max(8000, 'Note is too long'),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post(
    '/:id/notes',
    authenticate,
    authorize(...READ_ROLES),
    validateParams(sessionIdSchema),
    validateBody(addNoteSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { session } = await ensureVisibleSession(String(req.params.id ?? ''), req.user, {
        act: true,
      });
      const { text } = req.body as { text: string };

      const note = await addNote({
        sessionId: session.id,
        conversationId: session.conversationId,
        companyId: session.companyId,
        authorId: req.user!.id,
        authorName: req.user?.name,
        text,
      });

      successResponse(res, { statusCode: 201, data: note, message: 'Note added' });
    }
  )
```

## GET /api/v1/brands/:brandId/settings/:type

**Source:** `server/src/modules/settings/api.ts:33`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Visible brand and permitted role. Settings and fixed replies do not require conversations, sessions or comments, and can be learned independently of each other.

**Business logic:** FixedReply stores reusable local text; it is not a provider-approved WhatsApp template. Settings append immutable versions. baseVersion prevents silent overwrites, and the unique scope/type/version index resolves concurrent saves. Virtual version zero provides defaults without inserting a row. SLA later uses the settings in force at clock start.

**Implementation entry points:** `server/src/modules/fixed-reply/service.ts; modules/settings/service.ts; modules/settings/definitions.ts`

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

**Params: settingParamsSchema** — `server/src/modules/settings/validation.ts`

```typescript
export const settingParamsSchema = z.object({
  brandId: idSchema,
  type: z.enum(SETTING_TYPES),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:type',
    authenticate,
    authorize(...settingRoles),
    validateParams(settingParamsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const type = req.params.type as SettingType;
      const current = await getCurrent(await brandOwner(req), type);
      successResponse(res, { data: { ...current, ...definitionOf(type).extras?.() } });
    }
  )
```

## PUT /api/v1/brands/:brandId/settings/:type

**Source:** `server/src/modules/settings/api.ts:49`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Visible brand and permitted role. Settings and fixed replies do not require conversations, sessions or comments, and can be learned independently of each other.

**Business logic:** FixedReply stores reusable local text; it is not a provider-approved WhatsApp template. Settings append immutable versions. baseVersion prevents silent overwrites, and the unique scope/type/version index resolves concurrent saves. Virtual version zero provides defaults without inserting a row. SLA later uses the settings in force at clock start.

**Implementation entry points:** `server/src/modules/fixed-reply/service.ts; modules/settings/service.ts; modules/settings/definitions.ts`

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

**Params: settingParamsSchema** — `server/src/modules/settings/validation.ts`

```typescript
export const settingParamsSchema = z.object({
  brandId: idSchema,
  type: z.enum(SETTING_TYPES),
});
```

**Body: saveSettingSchema** — `server/src/modules/settings/validation.ts`

```typescript
export const saveSettingSchema = z.strictObject({
  // The version the edit started from; 0 when nothing has been saved yet.
  baseVersion: z.number().int().min(0),
  value: z.unknown(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.put(
    '/:type',
    authenticate,
    authorize(...settingRoles),
    validateParams(settingParamsSchema),
    validateBody(saveSettingSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const type = req.params.type as SettingType;
      const { baseVersion, value } = req.body as { baseVersion: number; value: unknown };

      const parsed = definitionOf(type).valueSchema.safeParse(value);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue?.path.length ? `${issue.path.join('.')}: ` : '';
        throw new BadRequestError(`${path}${issue?.message ?? 'Invalid value'}`, comingFrom);
      }

      const user = req.user!;
      const saved = await save(await brandOwner(req), type, baseVersion, parsed.data, {
        id: user.id,
        name: user.name || user.email,
      });
      successResponse(res, { data: saved, message: `Saved as version ${saved.version}` });
    }
  )
```

## GET /api/v1/brands/:brandId/settings/:type/history

**Source:** `server/src/modules/settings/api.ts:79`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Visible brand and permitted role. Settings and fixed replies do not require conversations, sessions or comments, and can be learned independently of each other.

**Business logic:** FixedReply stores reusable local text; it is not a provider-approved WhatsApp template. Settings append immutable versions. baseVersion prevents silent overwrites, and the unique scope/type/version index resolves concurrent saves. Virtual version zero provides defaults without inserting a row. SLA later uses the settings in force at clock start.

**Implementation entry points:** `server/src/modules/fixed-reply/service.ts; modules/settings/service.ts; modules/settings/definitions.ts`

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

**Params: settingParamsSchema** — `server/src/modules/settings/validation.ts`

```typescript
export const settingParamsSchema = z.object({
  brandId: idSchema,
  type: z.enum(SETTING_TYPES),
});
```

**Query: historyQuerySchema** — `server/src/modules/settings/validation.ts`

```typescript
export const historyQuerySchema = z.strictObject({
  cursor: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:type/history',
    authenticate,
    authorize(...settingRoles),
    validateParams(settingParamsSchema),
    validateQuery(historyQuerySchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const type = req.params.type as SettingType;
      const { cursor, limit = 20 } = req.query as { cursor?: number; limit?: number };
      const { items, hasNext, nextCursor } = await listHistory(await brandOwner(req), type, {
        cursor,
        limit,
      });
      paginatedSuccessResponse(res, {
        data: { items, pagination: { limit, hasNext, nextCursor } },
      });
    }
  )
```

## GET /api/v1/users

**Source:** `server/src/modules/user/api.ts:94`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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
- Generic user bodies no longer accept departmentId. Changes into or out of query_manager role are rejected; use Query managers for team membership.

### Validation declarations

**Query: listUsersSchema** — `server/src/modules/user/validation.ts`

```typescript
export const listUsersSchema = listQuerySchema.extend({
  role: z.enum(ROLE_VALUES).optional(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateQuery(listUsersSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const data = await search(req.query, getTenantScope(req.user));
      paginatedSuccessResponse(res, { data });
    }
  )
```

## POST /api/v1/users

**Source:** `server/src/modules/user/api.ts:109`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/users" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"Amina Rahman","email":"amina@example.com","password":"ExamplePassword1!","role":"company_admin"}'
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
- For a super_admin creating a tenant resource, also supply companyId where the schema permits it. Tenant callers use their own company; role assignment is additionally restricted.
- This example requires company_owner or super_admin. Create query managers through /query-managers with teamId. Company-admin calls to POST /users resolve to query_manager and are rejected with 400.
- Generic user bodies no longer accept departmentId. Changes into or out of query_manager role are rejected; use Query managers for team membership.

### Validation declarations

**Body: createUserSchema** — `server/src/modules/user/validation.ts`

```typescript
export const createUserSchema = z.strictObject({
  name: z.string({}).min(1, 'Name is required'),
  email: z.email('Invalid email format').min(1, 'Email is required'),
  password: passwordPolicy,
  role: z.enum(ROLE_VALUES).optional(),
  // Only honoured for super_admin; for company_admin the server forces its own company.
  companyId: idSchema.optional(),
});
```

### Error examples

- HTTP 400: Please provide name, email, password, and role
- HTTP 400: companyId is required

### Handler code

```typescript
router.post(
    '/',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateBody(createUserSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        throw new BadRequestError(
          'Please provide name, email, password, and role',
          `module/user/api.ts - /`
        );
      }

      const isSuperAdmin = req.user?.role === ROLES.SUPER_ADMIN;
      const role = resolveCreateRole(req.user?.role, req.body.role);
      if (role === ROLES.QUERY_MANAGER) {
        throw new BadRequestError(QUERY_MANAGERS_ELSEWHERE, `module/user/api.ts - /`);
      }
      const companyId = isSuperAdmin ? req.body.companyId : req.user?.companyId;

      // Every role except super_admin must belong to a company.
      if (role !== ROLES.SUPER_ADMIN && !companyId) {
        throw new BadRequestError('companyId is required', `module/user/api.ts - /`);
      }

      const item = await create({
        name,
        email,
        password,
        role,
        companyId: role === ROLES.SUPER_ADMIN ? undefined : companyId,
      });
      successResponse(res, { data: item });
    }
  )
```

## GET /api/v1/users/me

**Source:** `server/src/modules/user/api.ts:150`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension).

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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
- Generic user bodies no longer accept departmentId. Changes into or out of query_manager role are rejected; use Query managers for team membership.

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get('/me', authenticate, logRequest({}), async (req: Request, res: Response) => {
    const user = await getCurrent(req?.user?.id || '');
    if (!user) {
      throw new NotFoundError(`${model} not found`, `domain/user/api.ts - /me`);
    }
    successResponse(res, { data: user });
  })
```

## GET /api/v1/users/:id

**Source:** `server/src/modules/user/api.ts:164`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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
- Generic user bodies no longer accept departmentId. Changes into or out of query_manager role are rejected; use Query managers for team membership.

### Validation declarations

**Params: deleteUserSchema** — `server/src/modules/user/validation.ts`

```typescript
export const deleteUserSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteUserSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const user = await getById(String(req.params.id ?? ''), getTenantScope(req.user));
      if (!user) {
        throw new NotFoundError(`${model} not found`, `module/user/api.ts - GET /:id`);
      }
      successResponse(res, { data: user });
    }
  )
```

## PATCH /api/v1/users/me

**Source:** `server/src/modules/user/api.ts:182`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension).

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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
- Generic user bodies no longer accept departmentId. Changes into or out of query_manager role are rejected; use Query managers for team membership.

### Validation declarations

**Body: updateMeSchema** — `server/src/modules/user/validation.ts`

```typescript
export const updateMeSchema = z.strictObject({
  name: z.string().optional(),
});
```

### Error examples

- HTTP 400: Please provide at least one field to update

### Handler code

```typescript
router.patch(
    '/me',
    authenticate,
    validateBody(updateMeSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name } = req.body;
      if (!name) {
        throw new BadRequestError(
          'Please provide at least one field to update',
          `module/user/api.ts - /me`
        );
      }
      const user = await getById(req?.user?.id || '');
      if (!user) {
        throw new NotFoundError(`${model} not found`, `module/user/api.ts - /me`);
      }
      const item = await updateById(req?.user?.id || '', { name });
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/user/api.ts - /me`);
      }
      successResponse(res, { data: item });
    }
  )
```

## PATCH /api/v1/users/me/change-password

**Source:** `server/src/modules/user/api.ts:210`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension).

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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
- Generic user bodies no longer accept departmentId. Changes into or out of query_manager role are rejected; use Query managers for team membership.

### Validation declarations

**Body: changePasswordSchema** — `server/src/modules/user/validation.ts`

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

### Error examples

- HTTP 400: Please provide oldPassword and newPassword
- HTTP 400: Old password does not match

### Handler code

```typescript
router.patch(
    '/me/change-password',
    authenticate,
    validateBody(changePasswordSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) {
        throw new BadRequestError(
          'Please provide oldPassword and newPassword',
          `module/user/api.ts - /me/change-password`
        );
      }
      // `getById` no longer carries the hash; comparePassword throws without it.
      const user = await getByIdWithPassword(req?.user?.id || '');
      if (!user) {
        throw new NotFoundError(`${model} not found`, `module/user/api.ts - /me/change-password`);
      }

      const isPasswordMatch = await user.comparePassword(oldPassword);
      if (!isPasswordMatch) {
        throw new BadRequestError(
          'Old password does not match',
          `module/user/api.ts - /me/change-password`
        );
      }
      const item = await updateById(req?.user?.id || '', { password: newPassword });
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/user/api.ts - /me/change-password`);
      }
      successResponse(res, { data: item });
    }
  )
```

## PATCH /api/v1/users/:id

**Source:** `server/src/modules/user/api.ts:247`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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
- Generic user bodies no longer accept departmentId. Changes into or out of query_manager role are rejected; use Query managers for team membership.

### Validation declarations

**Body: updateUserSchema** — `server/src/modules/user/validation.ts`

```typescript
export const updateUserSchema = z.strictObject({
  name: z.string().optional(),
  email: z.email('Invalid email format').optional(),
  role: z.enum(ROLE_VALUES).optional(),
});
```

### Error examples

- HTTP 400: Invalid request body

### Handler code

```typescript
router.patch(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateBody(updateUserSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, email, role } = req.body;
      if (!name && !email && !role) {
        throw new BadRequestError('Invalid request body', `module/user/api.ts - /:id`);
      }

      const scope = getTenantScope(req.user);
      assertCanAssignRole(req.user?.role, role);

      const user = await getById(String(req.params.id ?? ''), scope);
      if (!user) {
        throw new NotFoundError(`${model} not found`, `module/user/api.ts - /:id`);
      }
      assertCanActOnUser(req.user?.role, user.role);

      // No role change into or out of query manager: in, they'd have no team; out, they'd keep one.
      if (role && role !== user.role && [role, user.role].includes(ROLES.QUERY_MANAGER)) {
        throw new BadRequestError(QUERY_MANAGERS_ELSEWHERE, `module/user/api.ts - /:id`);
      }

      const item = await updateById(String(req.params.id ?? ''), { name, email, role }, scope);
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/user/api.ts - /:id`);
      }
      successResponse(res, { data: item });
    }
  )
```

## DELETE /api/v1/users/:id

**Source:** `server/src/modules/user/api.ts:284`

**Access:** Access-token cookie or Bearer token; active company required (super_admin bypasses company suspension). Allowed roles: super_admin, company_owner, company_admin.

**Prerequisites:** Authenticated permitted role and company scope. Create Department before Team, then use Query managers for agents with a required team.

**Business logic:** Query managers are Users filtered by role, not another collection. Tenant filters limit reads and writes. Password creation runs the save hook; direct password updates explicitly hash. Department membership later grants one of the brand-access and assignment paths.

**Implementation entry points:** `server/src/modules/user/service.ts; modules/department/service.ts; modules/query-manager/service.ts; auth/tenant.ts`

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
- Generic user bodies no longer accept departmentId. Changes into or out of query_manager role are rejected; use Query managers for team membership.

### Validation declarations

**Params: deleteUserSchema** — `server/src/modules/user/validation.ts`

```typescript
export const deleteUserSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.delete(
    '/:id',
    authenticate,
    authorize(ROLES.SUPER_ADMIN, ROLES.COMPANY_OWNER, ROLES.COMPANY_ADMIN),
    validateParams(deleteUserSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const scope = getTenantScope(req.user);
      // Read before deleting: the target's role is what decides whether this is allowed, and
      // `deleteById` returns the document only once it is already gone.
      const target = await getById(String(req.params.id ?? ''), scope);
      if (!target) {
        throw new NotFoundError(`${model} not found`, `module/user/api.ts - /:id`);
      }
      assertCanActOnUser(req.user?.role, target.role);

      const item = await deleteById(String(req.params.id ?? ''), scope);
      if (!item) {
        throw new NotFoundError(`${model} not found`, `module/user/api.ts - /:id`);
      }
      successResponse(res, { data: item });
    }
  )
```

## GET /api/v1/webhooks/facebook

**Source:** `server/src/modules/webhook/index.ts:14`

**Access:** Provider verification token must match the configured token.

**Prerequisites:** Operational connected brand, signature/verification configuration, Redis queue and worker. Browser login is not the provider authentication mechanism.

**Business logic:** Verification and signature checks precede queue work. The worker translates provider identities into domain input. Incoming message persistence updates conversation preview, chooses a session, inserts Message, applies status rules and recomputes SLA before emitting. Sparse unique provider IDs prevent duplicate records, but earlier cross-document writes are not one transaction.

**Implementation entry points:** `server/src/modules/webhook/index.ts; webhook/queue.ts; webhook/facebook.ts; webhook/whatsapp.ts; modules/conversation/service.ts`

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/webhooks/facebook?hub.mode=subscribe&hub.verify_token=VERIFY_TOKEN&hub.challenge=12345"
```

### Example response — HTTP 200

```text
12345
```

- Read the route-specific authentication requirement below.

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get('/facebook', verify)
```

## POST /api/v1/webhooks/facebook

**Source:** `server/src/modules/webhook/index.ts:15`

**Access:** X-Hub-Signature-256: sha256=<HMAC of exact raw body using the app secret>.

**Prerequisites:** Operational connected brand, signature/verification configuration, Redis queue and worker. Browser login is not the provider authentication mechanism.

**Business logic:** Verification and signature checks precede queue work. The worker translates provider identities into domain input. Incoming message persistence updates conversation preview, chooses a session, inserts Message, applies status rules and recomputes SLA before emitting. Sparse unique provider IDs prevent duplicate records, but earlier cross-document writes are not one transaction.

**Implementation entry points:** `server/src/modules/webhook/index.ts; webhook/queue.ts; webhook/facebook.ts; webhook/whatsapp.ts; modules/conversation/service.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post('/facebook', logRequest({}), receive)
```

## POST /api/v1/webhooks/facebook/relay

**Source:** `server/src/modules/webhook/index.ts:18`

**Access:** X-Relay-Token must match FACEBOOK_RELAY_TOKEN.

**Prerequisites:** Operational connected brand, signature/verification configuration, Redis queue and worker. Browser login is not the provider authentication mechanism.

**Business logic:** Verification and signature checks precede queue work. The worker translates provider identities into domain input. Incoming message persistence updates conversation preview, chooses a session, inserts Message, applies status rules and recomputes SLA before emitting. Sparse unique provider IDs prevent duplicate records, but earlier cross-document writes are not one transaction.

**Implementation entry points:** `server/src/modules/webhook/index.ts; webhook/queue.ts; webhook/facebook.ts; webhook/whatsapp.ts; modules/conversation/service.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post('/facebook/relay', logRequest({}), receiveRelay)
```

## GET /api/v1/webhooks/whatsapp

**Source:** `server/src/modules/webhook/index.ts:22`

**Access:** Provider verification token must match the configured token.

**Prerequisites:** Operational connected brand, signature/verification configuration, Redis queue and worker. Browser login is not the provider authentication mechanism.

**Business logic:** Verification and signature checks precede queue work. The worker translates provider identities into domain input. Incoming message persistence updates conversation preview, chooses a session, inserts Message, applies status rules and recomputes SLA before emitting. Sparse unique provider IDs prevent duplicate records, but earlier cross-document writes are not one transaction.

**Implementation entry points:** `server/src/modules/webhook/index.ts; webhook/queue.ts; webhook/facebook.ts; webhook/whatsapp.ts; modules/conversation/service.ts`

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=VERIFY_TOKEN&hub.challenge=12345"
```

### Example response — HTTP 200

```text
12345
```

- Read the route-specific authentication requirement below.

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get('/whatsapp', verifyWhatsApp)
```

## POST /api/v1/webhooks/whatsapp

**Source:** `server/src/modules/webhook/index.ts:23`

**Access:** X-Hub-Signature-256: sha256=<HMAC of exact raw body using the app secret>.

**Prerequisites:** Operational connected brand, signature/verification configuration, Redis queue and worker. Browser login is not the provider authentication mechanism.

**Business logic:** Verification and signature checks precede queue work. The worker translates provider identities into domain input. Incoming message persistence updates conversation preview, chooses a session, inserts Message, applies status rules and recomputes SLA before emitting. Sparse unique provider IDs prevent duplicate records, but earlier cross-document writes are not one transaction.

**Implementation entry points:** `server/src/modules/webhook/index.ts; webhook/queue.ts; webhook/facebook.ts; webhook/whatsapp.ts; modules/conversation/service.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.post('/whatsapp', logRequest({}), receiveWhatsApp)
```

## GET /health

**Source:** `server/src/routes.ts:35`

**Access:** Public; no JWT middleware.

**Prerequisites:** No business record prerequisite. Learn MongoDB identities, references, indexes, response envelopes and API/worker health first.

**Business logic:** A healthy request process is not evidence that queued work is being consumed. /health checks process dependencies; /health/queue reports stalled or flooded work.

**Implementation entry points:** `server/src/routes.ts; server/src/libraries/db/index.ts; server/src/libraries/utils/sendResponse.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
expressApp.get('/health', (_req: Request, res: Response) => {
    const mongo = getConnectionStatus();
    const redis = getRedisState();
    const realtime = getIO() ? 'up' : 'down';

    const healthy = mongo === 'connected' && redis === 'connected' && realtime === 'up';
    res.status(mongo === 'connected' ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      components: { mongo, redis, realtime },
    });
  })
```

## GET /health/queue

**Source:** `server/src/routes.ts:56`

**Access:** Public; no JWT middleware.

**Prerequisites:** No business record prerequisite. Learn MongoDB identities, references, indexes, response envelopes and API/worker health first.

**Business logic:** A healthy request process is not evidence that queued work is being consumed. /health checks process dependencies; /health/queue reports stalled or flooded work.

**Implementation entry points:** `server/src/routes.ts; server/src/libraries/db/index.ts; server/src/libraries/utils/sendResponse.ts`

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

### Validation declarations

See handler and service validation.

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
expressApp.get('/health/queue', async (_req: Request, res: Response) => {
    try {
      const stats = await queueStats();
      // A queue can be both; stalled wins because it is the more actionable of the two.
      const stalled =
        stats.oldestWaitingAgeSec !== null && stats.oldestWaitingAgeSec > QUEUE_STALL_AGE_SEC;
      const flooded = stats.waiting > QUEUE_BACKLOG_LIMIT;

      let status = 'ok';
      if (stalled) status = 'stalled';
      else if (flooded) status = 'flooded';

      res.status(status === 'ok' ? 200 : 503).json({
        status,
        ...stats,
        thresholds: { stallAgeSec: QUEUE_STALL_AGE_SEC, backlogLimit: QUEUE_BACKLOG_LIMIT },
      });
    } catch (error) {
      // Its own state, never an empty queue — "nothing waiting" and "cannot see it" must differ.
      logger.error('/health/queue: could not read queue stats', { error });
      res.status(503).json({ status: 'unavailable' });
    }
  })
```

## GET /api/v1/teams

**Source:** `server/src/modules/team/api.ts:39`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant and brand visibility checks still apply.

**Prerequisites:** Existing company and department; creation/joining requires an active department. Team administration requires a manager role.

**Business logic:** Search tenant-scoped teams, then withStats decorates the page with departmentName, departmentStatus, query-manager memberCount and brandCount from direct team/department grants. Individual member grants do not count; a brand granted both ways counts once. Existing offset pagination is preserved.

**Implementation entry points:** `server/src/modules/team/api.ts; server/src/modules/team/stats.ts`

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/teams" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "_id": "670000000000000000000020",
      "name": "Night shift",
      "status": "active",
      "departmentId": "670000000000000000000003",
      "companyId": "670000000000000000000001",
      "departmentName": "Support",
      "departmentStatus": "active",
      "memberCount": 3,
      "brandCount": 2
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalCount": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false,
    "startIndex": 1,
    "endIndex": 1
  }
}
```

- Creation and activation reject an inactive department (400). PATCH rejects departmentId as an unknown field; an empty patch is 400.
- Deactivation prevents new assignments/memberships but preserves existing records and claimable pools. No DELETE route exists.

### Validation declarations

**Query: listTeamsSchema** — `server/src/modules/team/validation.ts`

```typescript
export const listTeamsSchema = listQuerySchema.extend({
  departmentId: idSchema.optional(),
  status: z.enum(TEAM_STATUS).optional(),
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/',
    authenticate,
    authorize(...MANAGE_ROLES),
    validateQuery(listTeamsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const page = await search(req.query, getTenantScope(req.user));
      paginatedSuccessResponse(res, { data: { ...page, items: await withStats(page.items) } });
    }
  )
```

## POST /api/v1/teams

**Source:** `server/src/modules/team/api.ts:54`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant and brand visibility checks still apply.

**Prerequisites:** Existing company and department; creation/joining requires an active department. Team administration requires a manager role.

**Business logic:** Tenant-scoped Team CRUD with no DELETE. Derive companyId from a visible department. Names are unique per department using English strength-2 collation; duplicate writes become 409. Department is immutable; rename or deactivate instead of moving/deleting.

**Implementation entry points:** `server/src/modules/team/api.ts`

### Request example

```sh
curl -i -X POST "${BASE_URL}/api/v1/teams" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"Night shift","departmentId":"670000000000000000000003"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Team created successfully",
  "data": {
    "_id": "670000000000000000000020",
    "name": "Night shift",
    "status": "active",
    "departmentId": "670000000000000000000003",
    "companyId": "670000000000000000000001"
  }
}
```

- Creation and activation reject an inactive department (400). PATCH rejects departmentId as an unknown field; an empty patch is 400.
- Deactivation prevents new assignments/memberships but preserves existing records and claimable pools. No DELETE route exists.

### Validation declarations

**Body: createTeamSchema** — `server/src/modules/team/validation.ts`

```typescript
export const createTeamSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(100),
  departmentId: idSchema,
  status: z.enum(TEAM_STATUS).optional(),
});
```

### Error examples

- HTTP 409: A team with this name already exists in this department

### Handler code

```typescript
router.post(
    '/',
    authenticate,
    authorize(...MANAGE_ROLES),
    validateBody(createTeamSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, departmentId, status } = req.body as CreateTeamInput;
      // The department is read within the caller's tenant scope, so another company's department
      // is a plain miss. The team takes its company from the department, never from the body.
      const department = await getDepartmentById(departmentId, getTenantScope(req.user));
      if (!department) {
        throw new BadRequestError('Department not found', `${comingFrom} - POST /`);
      }
      if (department.status !== 'active') {
        throw new BadRequestError('That department is inactive', `${comingFrom} - POST /`);
      }
      const item = await create({
        name,
        status,
        departmentId: department._id as Types.ObjectId,
        companyId: department.companyId,
      });
      successResponse(res, { data: item, message: 'Team created successfully' });
    }
  )
```

## GET /api/v1/teams/:id

**Source:** `server/src/modules/team/api.ts:84`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant and brand visibility checks still apply.

**Prerequisites:** Existing company and department; creation/joining requires an active department. Team administration requires a manager role.

**Business logic:** Tenant-scoped Team CRUD with no DELETE. Derive companyId from a visible department. Names are unique per department using English strength-2 collation; duplicate writes become 409. Department is immutable; rename or deactivate instead of moving/deleting.

**Implementation entry points:** `server/src/modules/team/api.ts`

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/teams/670000000000000000000020" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": {
    "_id": "670000000000000000000020",
    "name": "Night shift",
    "status": "active",
    "departmentId": "670000000000000000000003",
    "companyId": "670000000000000000000001"
  }
}
```

- Creation and activation reject an inactive department (400). PATCH rejects departmentId as an unknown field; an empty patch is 400.
- Deactivation prevents new assignments/memberships but preserves existing records and claimable pools. No DELETE route exists.

### Validation declarations

**Params: teamIdParamsSchema** — `server/src/modules/team/validation.ts`

```typescript
export const teamIdParamsSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id',
    authenticate,
    authorize(...MANAGE_ROLES),
    validateParams(teamIdParamsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const item = await getById(String(req.params.id), getTenantScope(req.user));
      if (!item) {
        throw new NotFoundError(`${model} not found`, `${comingFrom} - GET /:id`);
      }
      successResponse(res, { data: item });
    }
  )
```

## GET /api/v1/teams/:id/brands

**Source:** `server/src/modules/team/api.ts:103`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant/brand visibility still applies. Query managers receive 403.

**Prerequisites:** Tenant-visible Team.

**Business logic:** Load a tenant-scoped team, then getTeamBrands queries same-company brands granted directly to the team or its department. Sort case-insensitively A–Z and return each once with the applicable grants. Individual member grants are excluded.

**Implementation entry points:** `server/src/modules/team/stats.ts:getTeamBrands`

### Request example

```sh
curl -i -X GET "${BASE_URL}/api/v1/teams/670000000000000000000020/brands" \
  -b cookies.txt -c cookies.txt
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "success",
  "data": [
    {
      "id": "670000000000000000000004",
      "name": "Example Brand",
      "status": "active",
      "logoUrl": null,
      "grants": [
        "team",
        "department"
      ]
    }
  ]
}
```

- Returns an array, not an offset page. grants contains team, department or both.
- GET /teams/:id remains an ordinary Team read; the list endpoint supplies enriched counts.

### Validation declarations

**Params: teamIdParamsSchema** — `server/src/modules/team/validation.ts`

```typescript
export const teamIdParamsSchema = z.object({
  id: idSchema,
});
```

### Error examples

Shared authentication, validation and service errors apply.

### Handler code

```typescript
router.get(
    '/:id/brands',
    authenticate,
    authorize(...MANAGE_ROLES),
    validateParams(teamIdParamsSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const team = await getById(String(req.params.id), getTenantScope(req.user));
      if (!team) {
        throw new NotFoundError(`${model} not found`, `${comingFrom} - GET /:id/brands`);
      }
      successResponse(res, { data: await getTeamBrands(team) });
    }
  )
```

## PATCH /api/v1/teams/:id

**Source:** `server/src/modules/team/api.ts:121`

**Access:** Authenticated super_admin, company_owner or company_admin; tenant and brand visibility checks still apply.

**Prerequisites:** Existing company and department; creation/joining requires an active department. Team administration requires a manager role.

**Business logic:** Tenant-scoped Team CRUD with no DELETE. Derive companyId from a visible department. Names are unique per department using English strength-2 collation; duplicate writes become 409. Department is immutable; rename or deactivate instead of moving/deleting.

**Implementation entry points:** `server/src/modules/team/api.ts`

### Request example

```sh
curl -i -X PATCH "${BASE_URL}/api/v1/teams/670000000000000000000020" \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  --data '{"name":"Evening shift"}'
```

### Example response — HTTP 200

```json
{
  "success": true,
  "message": "Team updated successfully",
  "data": {
    "_id": "670000000000000000000020",
    "name": "Evening shift",
    "status": "active",
    "departmentId": "670000000000000000000003",
    "companyId": "670000000000000000000001"
  }
}
```

- Creation and activation reject an inactive department (400). PATCH rejects departmentId as an unknown field; an empty patch is 400.
- Deactivation prevents new assignments/memberships but preserves existing records and claimable pools. No DELETE route exists.

### Validation declarations

**Params: teamIdParamsSchema** — `server/src/modules/team/validation.ts`

```typescript
export const teamIdParamsSchema = z.object({
  id: idSchema,
});
```

**Body: updateTeamSchema** — `server/src/modules/team/validation.ts`

```typescript
export const updateTeamSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  status: z.enum(TEAM_STATUS).optional(),
});
```

### Error examples

- HTTP 409: A team with this name already exists in this department

### Handler code

```typescript
router.patch(
    '/:id',
    authenticate,
    authorize(...MANAGE_ROLES),
    validateParams(teamIdParamsSchema),
    validateBody(updateTeamSchema),
    logRequest({}),
    async (req: Request, res: Response) => {
      const { name, status } = req.body as UpdateTeamInput;
      if (!name && !status) {
        throw new BadRequestError('Nothing to update', `${comingFrom} - PATCH /:id`);
      }
      // Same rule as create: no active team under an inactive department.
      if (status === 'active') {
        const scope = getTenantScope(req.user);
        const team = await getById(String(req.params.id), scope);
        if (!team) {
          throw new NotFoundError(`${model} not found`, `${comingFrom} - PATCH /:id`);
        }
        const department = await getDepartmentById(String(team.departmentId), scope);
        if (department?.status !== 'active') {
          throw new BadRequestError('That department is inactive', `${comingFrom} - PATCH /:id`);
        }
      }
      const item = await updateById(
        String(req.params.id),
        { ...(name && { name }), ...(status && { status }) },
        getTenantScope(req.user)
      );
      if (!item) {
        throw new NotFoundError(`${model} not found`, `${comingFrom} - PATCH /:id`);
      }
      successResponse(res, { data: item, message: 'Team updated successfully' });
    }
  )
```
