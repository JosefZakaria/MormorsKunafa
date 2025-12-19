# Mormors Kunafa

A monorepo containing the web and mobile applications for Mormors Kunafa.

## Project Structure

```
MormorsKunafa/
├── apps/
│   ├── mobile/          # Expo React Native mobile app
│   └── web/             # React (Vite) web application
├── backend/             # Backend API server (future)
├── shared/              # Shared code between frontends and backend
│   ├── types/           # TypeScript types and interfaces
│   ├── api/             # API helpers and configuration
│   └── validation/      # Validation logic
├── Docs/                # Project documentation
└── package.json         # Root monorepo configuration
```

## Architecture

### Frontend Clients

- **Mobile App** (`apps/mobile`): Expo/React Native app for iOS and Android
- **Web App** (`apps/web`): React web application for marketing and ordering

**Important**: Web and mobile are completely separate clients. They do NOT share UI components or framework-specific code.

### Backend (Single Source of Truth)

The `backend/` directory will contain the API server that serves as the single source of truth for:
- Business logic
- Data persistence
- Authentication
- All API endpoints

Both web and mobile frontends consume the same backend API.

### Shared Code

The `shared/` directory contains only **UI-agnostic** code that can be used by both frontends and the backend:
- **types/**: TypeScript interfaces and types
- **api/**: API client helpers and configuration
- **validation/**: Data validation functions

**Rules for shared code:**
- No React, React Native, or Expo dependencies
- No DOM APIs
- Pure TypeScript/JavaScript only

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Install all dependencies from root
npm install
```

### Running the Mobile App

```bash
# From root
npm run mobile

# Or from apps/mobile
cd apps/mobile
npm start
```

### Running the Web App

```bash
# From root
npm run web

# Or from apps/web
cd apps/web
npm run dev
```

## Development Guidelines

1. **Keep frontends separate**: Never share UI components between web and mobile
2. **Backend is the source of truth**: All business logic lives in the backend
3. **Share only pure logic**: Types, validation, and API helpers can be shared
4. **Follow monorepo conventions**: Use workspace commands from root when possible

## Scripts

| Command | Description |
|---------|-------------|
| `npm run mobile` | Start Expo mobile app |
| `npm run mobile:android` | Start mobile app on Android |
| `npm run mobile:ios` | Start mobile app on iOS |
| `npm run web` | Start web development server |
| `npm run web:build` | Build web app for production |
| `npm run web:preview` | Preview production web build |
