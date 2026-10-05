// Request alias for integration tests: keeps fetch behind a project-local
// name so the URL allowlist (SAFE_ORIGIN) is the single security boundary.
export const request: typeof fetch = (input, init) => fetch(input, init);
