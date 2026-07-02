import { acquireTokenByDeviceCode, cachePath, scopes } from './auth.js';

const result = await acquireTokenByDeviceCode();

console.log('Signed in successfully.');
console.log(`Account: ${result.account?.username ?? result.account?.homeAccountId ?? 'unknown'}`);
console.log(`Scopes: ${scopes.join(' ')}`);
console.log(`Token cache: ${cachePath}`);
