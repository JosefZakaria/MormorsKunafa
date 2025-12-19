# Backend

This directory is reserved for the backend API server.

## Purpose

The backend will serve as the **single source of truth** for all business logic, data persistence, and API endpoints. Both the web and mobile frontends will consume this API.

## Future Implementation

When implementing the backend, consider:

- **Framework**: Node.js with Express, Fastify, or NestJS
- **Database**: PostgreSQL
- **Authentication**: JWT-based auth shared across web and mobile clients
- **API Design**: RESTful or GraphQL endpoints

## Structure (Suggested)

```
backend/
├── src/
│   ├── controllers/    # Route handlers
│   ├── services/       # Business logic
│   ├── models/         # Database models
│   ├── middleware/     # Auth, validation, etc.
│   └── routes/         # API route definitions
├── package.json
├── tsconfig.json
└── README.md
```

## Notes

- Backend logic must be UI-agnostic
- Shared types and validation should be imported from `/shared`
- Do not add any UI framework dependencies here

