# Architecture

FormStorm Lab separates browser-safe domain logic from Node.js adapters.

```text
JSON Schema or HTML form
          |
          v
      Form model
          |
          v
Deterministic boundary cases
          |
          v
Allowlist policy -> Playwright runner -> outcome classifier
                                  |             |
                               axe-core     minimizer
                                  |             |
                                  +---- evidence+
```

The domain core owns models, schema extraction, deterministic generation, expected validity, result classification, minimization, and redaction. Adapters own files, HTTP, browser execution, fixtures, and artifact storage. Reporters serialize stable JSON and standalone HTML. The static web interface reuses the browser-safe core and never pretends to run Playwright inside GitHub Pages.

The v0.1.0 scope is Chromium, native form controls, and the common JSON Schema object/property constraint subset. Unsupported recursive or remote schema references fail with an explicit diagnostic.
