# Mormors Kunafa

A monorepo containing the web application and backend API for Mormors Kunafa.

## Project Structure

```
MormorsKunafa/
├── apps/
│   └── web/             # React (Vite) web application
├── backend/             # Express backend API server
├── shared/              # Shared code between the web frontend and backend
│   ├── types/           # TypeScript types and interfaces
│   ├── api/             # API helpers and configuration
│   ├── constants/       # Shared constants
│   ├── utils/           # Shared utility functions
│   └── validation/      # Validation logic
├── Docs/                # Project documentation
└── package.json         # Root monorepo configuration
```

## Architecture

### Web Frontend

The React web application in `apps/web` provides the customer ordering flow and
the restaurant administration interface. It consumes the backend API.

### Backend

The Express server in `backend` is the source of truth for business logic, data
persistence, authentication, and API endpoints.

### Shared Code

The `shared` directory contains types, API helpers, constants, utilities, and
validation logic. Keep this code independent of UI frameworks and use pure
TypeScript/JavaScript.

## Getting Started

### Prerequisites

- Node.js 24.22.1 or a later 24.x security release (see `.nvmrc`)
- npm 9+

### Installation

Install dependencies from the repository root:

```bash
npm install
```

### Running Locally

Start the web application:

```bash
npm run web
```

Start the backend API in a separate terminal:

```bash
npm run dev:backend
```

See `backend/README.md` for backend configuration.

## Development Guidelines

1. Keep UI components in the web application.
2. Keep business logic and data access in the backend.
3. Share only framework-independent types, validation, and utilities.
4. Use workspace commands from the repository root when possible.

## Scripts

- `npm run dev` or `npm run web`: start the web development server.
- `npm run dev:backend`: start the backend development server.
- `npm run web:build`: build the web application for production.
- `npm run web:preview`: preview the production web build.
