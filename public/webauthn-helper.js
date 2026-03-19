// Debug: Log that script loaded
console.log('[WebAuthnHelper] Script loaded');

try {
  const RP_NAME = 'BITE Confidential Wallet';
  const urlParams = new URLSearchParams(window.location.search);
  const operation = urlParams.get('op');
  const label = urlParams.get('label') || 'Viewer Key';
  const existingCredentialId = urlParams.get('credentialId');
  
  console.log('[WebAuthnHelper] Params:', { operation, label, existingCredentialId: existingCredentialId ? 'yes' : 'no' });
  
  let hasPlatformAuth = false;
  
  // Update UI for auth operation
  if (operation === 'auth') {
    document.getElementById('title').textContent = 'Unlock Wallet';
    document.getElementById('subtitle').textContent = 'Authenticate to view your confidential balance.';
    document.getElementById('authButton').textContent = '🔓 Authenticate';
  }

  // Run diagnostics on load
  window.onload = async function() {
    document.getElementById('diagnostics').classList.remove('hidden');
    
    // Check 1: WebAuthn API
    const webauthnAvailable = typeof window.PublicKeyCredential !== 'undefined';
    updateCheck('check-webauthn', webauthnAvailable);
    
    if (!webauthnAvailable) {
      showError('WebAuthn is not supported in this browser. Please use Chrome, Edge, or Safari.');
      document.getElementById('authButton').disabled = true;
      return;
    }
    
    // Check 2: Platform authenticator
    try {
      hasPlatformAuth = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      updateCheck('check-platform', hasPlatformAuth);
      
      if (!hasPlatformAuth) {
        document.getElementById('subtitle').innerHTML = 
          '<strong style="color: #f59e0b;">⚠️ No biometric authenticator found</strong><br><br>' +
          'Please set up Face ID, Touch ID, Windows Hello, or a security key first.<br><br>' +
          '<small>macOS: System Settings → Touch ID & Password<br>' +
          'iOS: Settings → Face ID & Passcode<br>' +
          'Windows: Settings → Accounts → Sign-in options</small>';
        document.getElementById('authButton').textContent = '🔓 Try Anyway (Security Key)';
      }
    } catch (e) {
      updateCheck('check-platform', false);
    }
    
    // Check 3: User verification capability
    updateCheck('check-userverification', true);
  };
  
  function updateCheck(id, pass) {
    const el = document.getElementById(id);
    el.classList.add(pass ? 'pass' : 'fail');
  }

  function setLoading(isLoading) {
    const button = document.getElementById('authButton');
    const status = document.getElementById('status');
    
    if (isLoading) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span> Waiting for device...';
      status.innerHTML = '<span class="spinner"></span> Check for system prompt...<br><small>Look for Face ID / Touch ID / PIN dialog on your device</small>';
      status.classList.remove('hidden');
      document.getElementById('icon').textContent = '👆';
      document.getElementById('diagnostics').classList.add('hidden');
    } else {
      button.disabled = false;
      button.textContent = operation === 'auth' ? '🔓 Authenticate' : '🔓 Start Setup';
    }
  }

  function showError(message) {
    document.getElementById('error').innerHTML = message;
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('status').classList.add('hidden');
    document.getElementById('authButton').innerHTML = '🔄 Try Again';
    document.getElementById('authButton').disabled = false;
    document.getElementById('icon').textContent = '❌';
  }

  function showSuccess(message) {
    document.getElementById('success').textContent = message;
    document.getElementById('success').classList.remove('hidden');
    document.getElementById('status').classList.add('hidden');
    document.getElementById('authButton').classList.add('hidden');
    document.getElementById('cancelButton').classList.add('hidden');
    document.getElementById('icon').textContent = '✅';
    document.getElementById('title').textContent = 'Success!';
    document.getElementById('subtitle').classList.add('hidden');
    document.getElementById('diagnostics').classList.add('hidden');
  }

  function cancelAndClose() {
    if (window.opener) window.opener.postMessage({ type: 'WEBAUTHN_CANCELLED' }, '*');
    window.close();
  }

  function sendResult(type, data) {
    if (window.opener) window.opener.postMessage({ type: type, payload: data }, '*');
  }

  async function startWebAuthn() {
    console.log('[WebAuthnHelper] Starting WebAuthn process...');
    document.getElementById('error').classList.add('hidden');
    setLoading(true);

    try {
      if (operation === 'create') {
        await createCredential();
      } else if (operation === 'auth' && existingCredentialId) {
        await authenticateExisting(existingCredentialId);
      }
    } catch (error) {
      console.error('[WebAuthnHelper] Error in startWebAuthn:', error);
      setLoading(false);
      
      let errorMsg = error.message || 'Authentication failed';
      
      if (error.name === 'NotAllowedError') {
        errorMsg = 'Permission denied. You may have cancelled the prompt or it timed out.<br><br><small>Try again or check if your device requires screen lock (PIN/password) to be enabled.</small>';
      } else if (error.name === 'NotSupportedError') {
        errorMsg = 'Your device or browser does not support this type of authentication.<br><br><small>Try using a security key (YubiKey) instead, or ensure your device has Face ID/Touch ID set up.</small>';
      } else if (errorMsg.includes('cancelled')) {
        errorMsg += '<br><br><small>Make sure to respond to the system prompt quickly - it may timeout after a few seconds.</small>';
      }
      
      showError(errorMsg);
    }
  }
  
  // Make functions globally available
  window.startWebAuthn = startWebAuthn;
  window.cancelAndClose = cancelAndClose;

  async function createCredential() {
    console.log('[WebAuthnHelper] Creating credential...');
    
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    
    const publicKeyOptions = {
      challenge,
      rp: { name: RP_NAME },
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

    if (!hasPlatformAuth) {
      publicKeyOptions.authenticatorSelection.userVerification = 'preferred';
    }

    console.log('[WebAuthnHelper] Options:', publicKeyOptions);

    const credential = await navigator.credentials.create({ publicKey: publicKeyOptions });
    
    if (!credential) throw new Error('No credential returned - prompt may have timed out');

    console.log('[WebAuthnHelper] Created:', credential.id);
    
    document.getElementById('status').innerHTML = '<span class="spinner"></span> Completing setup...';
    const signature = await authenticate(credential.id);
    
    showSuccess('Passkey created successfully!');
    sendResult('WEBAUTHN_CREATE_SUCCESS', {
      credentialId: credential.id,
      signature: Array.from(signature),
      label: label
    });
    
    setTimeout(() => window.close(), 1500);
  }

  async function authenticateExisting(credId) {
    console.log('[WebAuthnHelper] Authenticating:', credId);
    
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    
    const publicKeyOptions = {
      challenge,
      allowCredentials: [{ type: 'public-key', id: base64UrlToBuffer(credId) }],
      userVerification: 'required',
    };

    const assertion = await navigator.credentials.get({ publicKey: publicKeyOptions });
    
    if (!assertion) throw new Error('Authentication failed');

    const signature = new Uint8Array(assertion.response.signature);
    
    showSuccess('Authentication successful!');
    sendResult('WEBAUTHN_AUTH_SUCCESS', { credentialId: credId, signature: Array.from(signature) });
    
    setTimeout(() => window.close(), 1500);
  }

  async function authenticate(credId) {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: base64UrlToBuffer(credId) }],
        userVerification: 'required',
      }
    });
    
    if (!assertion) throw new Error('Authentication failed');
    return new Uint8Array(assertion.response.signature);
  }

  function base64UrlToBuffer(base64url) {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    return buffer;
  }

  window.focus();
  console.log('[WebAuthnHelper] Initialization complete');
  
  // Attach event listeners
  document.addEventListener('DOMContentLoaded', function() {
    console.log('[WebAuthnHelper] DOM loaded, attaching listeners');
    document.getElementById('authButton').addEventListener('click', startWebAuthn);
    document.getElementById('cancelButton').addEventListener('click', cancelAndClose);
  });
  
} catch (e) {
  console.error('[WebAuthnHelper] Script initialization error:', e);
  document.body.innerHTML = '<div style="padding: 40px; text-align: center; font-family: sans-serif;"><h2>Error Loading</h2><p style="color: red;">' + e.message + '</p><p>Please check browser console for details.</p></div>';
}
