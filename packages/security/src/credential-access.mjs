/**
 * Server-only credential facade for future provider adapters.
 * WHY: a caller must identify the provider owning the API key; a public
 * metadata ID cannot silently be repurposed to authorize another provider.
 * The raw key is delivered only to a trusted in-process callback. Never pass
 * the callback result to an HTTP handler without response sanitization.
 */
export function createCredentialAccess(vault) {
  if(!vault||typeof vault.list!=='function'||typeof vault.getSecret!=='function')throw new Error('VAULT_REQUIRED');
  return Object.freeze({
    /** @param {{credentialId:string,providerId:string}} ref @param {(secret:string)=>Promise<any>} invoke */
    async withCredential(ref,invoke) {
      if(!ref||typeof ref.credentialId!=='string'||typeof ref.providerId!=='string'||typeof invoke!=='function')
        throw Object.assign(new Error('INVALID_CREDENTIAL_REFERENCE'),{code:'INVALID_CREDENTIAL_REFERENCE'});
      const rows=await vault.list();
      const owned=rows.find(row=>row.id===ref.credentialId);
      if(!owned||owned.providerId!==ref.providerId)
        throw Object.assign(new Error('CREDENTIAL_PROVIDER_MISMATCH'),{code:'CREDENTIAL_PROVIDER_MISMATCH'});
      // Read only after ownership check. Vault refuses when locked.
      const apiKey=await vault.getSecret(ref.credentialId);
      return invoke(apiKey);
    }
  });
}
