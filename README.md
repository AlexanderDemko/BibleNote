# BibleNote

BibleNote is organized as a single repository with two top-level projects:

- `Api` - the .NET BibleNote application, domain services, providers, modules, and tests.
- `Web` - the TypeScript/Electron desktop shell, OneNote cache UI, MCP server, and packaging scripts.

## Build

Build the API solution:

```powershell
cd Api
dotnet build BibleNote.sln -p:GenerateCode=False
```

Build the Web project:

```powershell
cd Web
npm install
npm run build
```

Create Windows desktop artifacts from `Web`:

```powershell
cd Web
npm run dist:win
```

The Web packaging flow stages the .NET API from `Api/Application` and bundles it into the desktop application resources.
