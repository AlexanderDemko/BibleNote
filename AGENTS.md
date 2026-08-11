# Repository instructions

## Versioning and release builds

- Do not bump the application version or build an installer, portable package, or other release artifact unless the user explicitly asks to build a release artifact.
- When the user explicitly asks to build an installer, portable package, or other release artifact, always bump the application to the next version before building. Never rebuild or overwrite an artifact for the current version. An explicitly requested version takes precedence.
- For local testing, rebuild only the required application code and update the changed files in the installed application when appropriate.

## UI test maintenance

- Do not mass-rewrite source-scraping tests or convert UI scripts to ES modules solely for testability.
- Replace a source-scraping test with a behavioral test when changing the corresponding functionality or when the test blocks a useful refactor.
