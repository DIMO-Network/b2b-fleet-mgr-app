# V2 Design Router Setup

## Required Dependency

You'll need to install the Lit router library:

```bash
npm install @lit-labs/router
```

## Files Created

- `src/elements/app-root-v2.ts` - Main app root with sidebar and routing
- `src/views/home-view.ts` - Home dashboard
- `src/views/vehicles-view.ts` - Vehicles & fleets
- `src/views/vehicle-detail-view.ts` - Individual vehicle detail
- `src/views/users-view.ts` - User lookup
- `src/views/reports-view.ts` - Reports page
- `src/views/onboarding-view.ts` - Onboarding page (placeholder for now)

## Usage

To test the V2 design, update your `index.html` to use:
```html
<app-root-v2></app-root-v2>
```

instead of:
```html
<app-root></app-root>
```

## Routes

The router uses hash-based routing:
- `#/` or `#/home` - Home dashboard
- `#/vehicles` - Vehicles list
- `#/vehicle/:id` - Vehicle detail
- `#/users` - User lookup
- `#/reports` - Reports
- `#/onboarding` - Onboarding

