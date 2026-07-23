# FormStorm Lab

FormStorm Lab turns form schemas and real HTML forms into deterministic boundary, internationalization, accessibility, and validation tests with replayable evidence.

Status: development toward `v0.1.0`.

## Safety boundary

The default target is a committed local fixture. External targets require an exact origin allowlist. FormStorm Lab does not read cookies, saved browser profiles, or existing field values, and it blocks state-changing network requests unless a future explicit live mode is introduced.

## Development

```bash
npm ci
npm run verify
```

The complete user guide, real screenshot, CLI examples, architecture, test evidence, and release links are added in the documentation milestone.

## License

[MIT](LICENSE)
