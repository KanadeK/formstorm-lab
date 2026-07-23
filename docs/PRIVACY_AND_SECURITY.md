# Privacy and Security

FormStorm Lab is local-first and deny-by-default.

- The bundled demo uses only synthetic, MIT-licensed fixture data.
- Every browser target must match an exact normalized origin in the allowlist.
- Redirects and subresources are checked against policy.
- Persistent browser profiles, saved authentication state, cookies, local storage, and existing form values are not collected.
- External state-changing requests are blocked by default.
- Fields whose names resemble passwords, tokens, keys, or secrets are redacted in reports.
- Replay files are validated data, not executable scripts.
- Generated filenames are represented as in-memory Playwright payloads so reserved filenames are never created on disk.

Users remain responsible for obtaining permission before testing a non-local target.
