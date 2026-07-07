import './env.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PublicClientApplication, Configuration, AuthenticationResult } from '@azure/msal-node';

export type OneNoteAuthConfig = {
  clientId: string | undefined;
  tenantId: string;
  scopes: string[];
  cachePath: string;
};

export function oneNoteAuthConfig(): OneNoteAuthConfig {
  return {
    clientId: process.env.ONENOTE_CLIENT_ID,
    tenantId: process.env.ONENOTE_TENANT_ID ?? 'common',
    scopes: (process.env.ONENOTE_SCOPES ?? 'Notes.Read User.Read offline_access')
      .split(/\s+/)
      .filter(Boolean),
    cachePath: process.env.ONENOTE_TOKEN_CACHE
      ?? path.join(os.homedir(), '.codex-onenote-mcp', 'msal-cache.json')
  };
}

export const scopes = oneNoteAuthConfig().scopes;
export const cachePath = oneNoteAuthConfig().cachePath;

export function createMsalClient(): PublicClientApplication {
  const { clientId, tenantId } = oneNoteAuthConfig();
  if (!clientId || clientId === '00000000-0000-0000-0000-000000000000') {
    throw new Error('ONENOTE_CLIENT_ID is not set. Copy .env.example to .env or %USERPROFILE%\\.codex-onenote-mcp\\.env and fill your Azure app client ID.');
  }

  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`
    }
  };

  return new PublicClientApplication(config);
}

export async function loadCache(pca: PublicClientApplication): Promise<void> {
  const { cachePath } = oneNoteAuthConfig();
  try {
    const serialized = await fs.readFile(cachePath, 'utf8');
    pca.getTokenCache().deserialize(serialized);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export async function saveCache(pca: PublicClientApplication): Promise<void> {
  const { cachePath } = oneNoteAuthConfig();
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, pca.getTokenCache().serialize(), 'utf8');
}

export async function acquireTokenSilent(forceRefresh = false): Promise<AuthenticationResult> {
  const { scopes } = oneNoteAuthConfig();
  const pca = createMsalClient();
  await loadCache(pca);

  const accounts = await pca.getTokenCache().getAllAccounts();
  const account = accounts[0];
  if (!account) {
    throw new Error(
      'Not signed in. Run: npm run login. This will create a local MSAL token cache for the MCP server.'
    );
  }

  const result = await pca.acquireTokenSilent({ account, scopes, forceRefresh });
  if (!result?.accessToken) {
    throw new Error('Could not acquire Microsoft Graph access token silently. Run: npm run login');
  }

  await saveCache(pca);
  return result;
}

export async function acquireTokenByDeviceCode(): Promise<AuthenticationResult> {
  const { scopes } = oneNoteAuthConfig();
  const pca = createMsalClient();
  await loadCache(pca);

  const result = await pca.acquireTokenByDeviceCode({
    scopes,
    deviceCodeCallback: response => {
      console.log(response.message);
    }
  });

  if (!result?.accessToken) {
    throw new Error('Device-code login did not return an access token.');
  }
  await saveCache(pca);
  return result;
}
