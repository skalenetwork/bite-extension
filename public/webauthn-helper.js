try {
  const DEBUG = true;
  function log(...args) {
    if (DEBUG) {
      console.log('[WebAuthnHelper]', ...args);
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const operation = urlParams.get('op');
  const label = urlParams.get('label') || 'MyBITE Wallet';
  const credentialId = urlParams.get('credentialId');
  const purpose = urlParams.get('purpose') || 'unlock';

  log('Initialized with params:', { operation, label, credentialId: credentialId?.slice(0, 20) + '...', purpose });

  const state = {
    hasPlatformAuth: false,
  };

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  function toggleHidden(id, hidden) {
    const element = document.getElementById(id);
    if (element) {
      element.classList.toggle('hidden', hidden);
    }
  }

  function updateCheck(id, passed) {
    const element = document.getElementById(id);
    if (!element) return;

    element.classList.remove('pass', 'fail');
    element.classList.add(passed ? 'pass' : 'fail');
  }

  function showError(message, details) {
    log('Showing error:', message, details);
    setText('error', message + (details ? `\n(${details})` : ''));
    toggleHidden('error', false);
    toggleHidden('status', true);
    setText('icon', 'X');
    setText('authButton', 'Try Again');
    document.getElementById('authButton').disabled = false;
    
    // Also send error to parent
    postError(message, details);
  }

  function showSuccess(message) {
    log('Showing success:', message);
    setText('success', message);
    toggleHidden('success', false);
    toggleHidden('status', true);
    toggleHidden('diagnostics', true);
    document.getElementById('authButton').classList.add('hidden');
    document.getElementById('cancelButton').classList.add('hidden');
    setText('icon', 'OK');
    setText('title', 'Success');
  }

  function setLoading(isLoading, message) {
    const button = document.getElementById('authButton');
    if (isLoading) {
      button.disabled = true;
      setText('authButton', 'Waiting for device...');
      setText('status', message);
      toggleHidden('status', false);
      toggleHidden('diagnostics', true);
      setText('icon', '...');
      return;
    }

    button.disabled = false;
    setText('authButton', operation === 'auth' ? 'Authenticate' : 'Start');
  }

  function postMessage(type, payload) {
    log('Posting message to parent:', type, payload);
    if (!window.opener) {
      log('ERROR: No window.opener available');
      return;
    }
    window.opener.postMessage({ type, payload }, window.location.origin);
  }

  function postError(error, details) {
    postMessage('WEBAUTHN_ERROR', { error, details });
  }

  function base64UrlToBuffer(base64url) {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer;
  }

  function prfInputFromPurpose(value) {
    const source = new TextEncoder().encode(`mybite:${value}`);
    const digest = crypto.subtle.digest('SHA-256', source);
    return digest.then((hash) => new Uint8Array(hash));
  }

  async function getPrfAssertion(existingCredentialId, reason) {
    log('Getting PRF assertion for credential:', existingCredentialId.slice(0, 20) + '...', 'purpose:', reason);
    
    try {
      const first = await prfInputFromPurpose(reason);
      log('PRF input hash generated');
      
      const allowCredentials = [{ type: 'public-key', id: base64UrlToBuffer(existingCredentialId) }];
      log('Allow credentials:', allowCredentials.map(c => ({ type: c.type, idLength: c.id.byteLength })));
      
      log('Calling navigator.credentials.get with PRF extension...');
      log('Waiting for system passkey prompt...');
      
      let assertion;
      try {
        assertion = await navigator.credentials.get({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            allowCredentials,
            userVerification: 'required',
            extensions: {
              prf: {
                evalByCredential: {
                  [existingCredentialId]: { first },
                },
              },
            },
          },
        });
      } catch (credentialError) {
        log('❌ navigator.credentials.get failed:', credentialError.name, credentialError.message);
        if (credentialError.name === 'NotAllowedError') {
          throw new Error('Authentication was cancelled or denied. Please try again.');
        } else if (credentialError.name === 'AbortError') {
          throw new Error('Authentication was aborted. This might happen if the window loses focus.');
        }
        throw credentialError;
      }

      if (!assertion) {
        throw new Error('Passkey assertion returned null');
      }

      log('✅ Assertion received:', { id: assertion.id, type: assertion.type });
      
      const results = assertion.getClientExtensionResults?.();
      log('Extension results:', results);
      
      const output = results?.prf?.results?.first;
      if (!output) {
        log('❌ PRF output not available in extension results');
        log('This means the authenticator supports passkeys but not the PRF extension');
        return null;
      }
      
      const outputArray = new Uint8Array(output);
      log('✅ PRF output received, length:', outputArray.length);
      return outputArray;
    } catch (err) {
      log('❌ Error in getPrfAssertion:', err.name, err.message);
      throw err;
    }
  }

  async function createCredential() {
    log('Creating new credential with label:', label);
    
    const publicKey = {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'MyBITE Wallet' },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: `viewer-key-${Date.now()}`,
        displayName: label,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
      attestation: 'none',
    };

    if (!state.hasPlatformAuth) {
      publicKey.authenticatorSelection.userVerification = 'preferred';
    }

    log('Calling navigator.credentials.create...');
    const credential = await navigator.credentials.create({ publicKey });
    if (!credential) {
      throw new Error('No passkey credential was created.');
    }

    log('Credential created:', { id: credential.id.slice(0, 20) + '...', type: credential.type });
    
    let prfSupported = false;

    try {
      log('Testing PRF capability...');
      const prfOutput = await getPrfAssertion(credential.id, 'capability-check');
      prfSupported = Boolean(prfOutput);
      log('PRF capability check:', prfSupported ? 'supported' : 'not supported');
    } catch (err) {
      log('PRF capability check failed:', err.message);
      prfSupported = false;
    }

    showSuccess('Passkey created successfully.');
    postMessage('WEBAUTHN_CREATE_SUCCESS', {
      credentialId: credential.id,
      prfSupported,
    });
    window.setTimeout(() => window.close(), 1200);
  }

  async function authenticateExisting(existingCredentialId) {
    log('Authenticating existing credential:', existingCredentialId.slice(0, 20) + '...');
    
    const allowCredentials = [{ type: 'public-key', id: base64UrlToBuffer(existingCredentialId) }];
    log('Allow credentials:', allowCredentials.map(c => ({ type: c.type, idLength: c.id.byteLength })));
    
    log('Calling navigator.credentials.get...');
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials,
        userVerification: 'required',
      },
    });

    if (!assertion) {
      throw new Error('Authentication returned null assertion');
    }

    log('Authentication successful, assertion:', { id: assertion.id, type: assertion.type });
    
    showSuccess('Authentication successful.');
    postMessage('WEBAUTHN_AUTH_SUCCESS', { ok: true, credentialId: existingCredentialId });
    window.setTimeout(() => window.close(), 1200);
  }

  async function authenticateForPrf(existingCredentialId) {
    log('PRF authentication for credential:', existingCredentialId.slice(0, 20) + '...', 'purpose:', purpose);
    
    try {
      log('Starting PRF assertion - this will prompt for your passkey password/PIN again');
      const prfOutput = await getPrfAssertion(existingCredentialId, purpose);
      
      if (!prfOutput) {
        log('PRF output is null - PRF not supported by this authenticator');
        showSuccess('Passkey PRF not available.');
        postMessage('WEBAUTHN_PRF_SUCCESS', {
          credentialId: existingCredentialId,
          prfOutput: null,
          prfSupported: false,
        });
      } else {
        log('✅ PRF authentication successful, output length:', prfOutput.length);
        showSuccess('✅ Wallet encrypted successfully!');
        postMessage('WEBAUTHN_PRF_SUCCESS', {
          credentialId: existingCredentialId,
          prfOutput: Array.from(prfOutput),
          prfSupported: true,
        });
      }
      
      log('Closing popup in 1.2 seconds...');
      window.setTimeout(() => window.close(), 1200);
    } catch (err) {
      log('❌ PRF authentication failed:', err.name, err.message);
      log('Error details:', err);
      showError(err.message || 'Failed to encrypt wallet. Please try again.', err.name);
      // Don't throw - we've already shown the error
    }
  }

  async function startWebAuthn() {
    log('startWebAuthn called for operation:', operation);
    toggleHidden('error', true);
    setLoading(true, 'Check your system passkey prompt.');

    try {
      if (operation === 'create') {
        await createCredential();
        return;
      }

      if (operation === 'auth') {
        if (!credentialId) {
          throw new Error('Missing credentialId for authentication operation');
        }
        await authenticateExisting(credentialId);
        return;
      }

      if (operation === 'prf') {
        if (!credentialId) {
          throw new Error('Missing credentialId for PRF operation');
        }
        await authenticateForPrf(credentialId);
        return;
      }

      throw new Error(`Unsupported passkey operation: ${operation}`);
    } catch (error) {
      log('startWebAuthn error:', error.name, error.message, error.stack);
      setLoading(false, '');
      const message = error instanceof Error ? error.message : 'Passkey operation failed.';
      showError(message, error.name);
    }
  }

  async function runDiagnostics() {
    log('Running diagnostics...');
    
    const webauthnAvailable = typeof window.PublicKeyCredential !== 'undefined';
    updateCheck('check-webauthn', webauthnAvailable);
    log('WebAuthn available:', webauthnAvailable);

    if (!webauthnAvailable) {
      showError('WebAuthn is not supported in this browser.');
      document.getElementById('authButton').disabled = true;
      return;
    }

    try {
      state.hasPlatformAuth = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      log('Platform authenticator available:', state.hasPlatformAuth);
    } catch (err) {
      log('Error checking platform authenticator:', err.message);
      state.hasPlatformAuth = false;
    }

    updateCheck('check-platform', state.hasPlatformAuth);
    updateCheck('check-userverification', true);

    if (operation === 'auth' || operation === 'prf') {
      if (operation === 'prf') {
        setText('title', 'Step 2: Finalize Setup');
        setText('subtitle', `Almost done! Click the button below to encrypt and secure your ${label}.`);
        setText('authButton', '🔐 Complete Setup (Authenticate Again)');
        // Show warning to not close window
        toggleHidden('warning-box', false);
        // Note: Removed auto-start to prevent popup crashes. User must click button.
        log('PRF operation ready - waiting for user to click button');
      } else {
        setText('title', 'Unlock Wallet');
        setText('subtitle', 'Authenticate with your passkey to continue.');
      }
    } else if (operation === 'create') {
      setText('title', 'Step 1: Create Passkey');
      setText('subtitle', `Create a secure passkey for ${label}. This will be used to protect your wallet.`);
      setText('authButton', '🔓 Create Passkey');
    }
    
    log('Diagnostics complete');
  }

  function cancelAndClose() {
    log('User cancelled operation');
    postMessage('WEBAUTHN_CANCELLED', {});
    window.close();
  }

  window.addEventListener('DOMContentLoaded', () => {
    log('DOMContentLoaded - setting up event listeners');
    document.getElementById('authButton').addEventListener('click', startWebAuthn);
    document.getElementById('cancelButton').addEventListener('click', cancelAndClose);
    
    // Signal to parent that we're ready
    log('Sending READY signal to parent');
    postMessage('WEBAUTHN_READY', {});
    
    runDiagnostics().catch((err) => {
      log('Diagnostics failed:', err);
      showError('Failed to initialize passkey helper.', err.message);
    });
  });
  
  log('Script loaded, waiting for DOMContentLoaded...');
} catch (error) {
  console.error('[WebAuthnHelper] Fatal error:', error);
  document.body.textContent = error instanceof Error ? error.message : 'Failed to load passkey helper.';
}
