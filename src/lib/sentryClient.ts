// The parts of Sentry Lumina uses. Importing them by name (instead of the
// whole package) keeps session replay, tracing and feedback out of the
// download. Loaded on demand by monitoring.ts.
export { init, captureException, setUser } from '@sentry/react';
