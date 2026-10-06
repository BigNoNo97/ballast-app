// עבודה מול Apple בשם "Sign in with Apple": יצירת client secret (JWT חתום במפתח ה-.p8) וביטול טוקן.
// הסודות מגיעים מ-secrets של הפונקציות: APPLE_PRIVATE_KEY (תוכן קובץ ה-.p8), APPLE_KEY_ID,
// APPLE_TEAM_ID, APPLE_SERVICES_ID. ה-JWT נוצר מחדש בכל קריאה, אז אין לו תאריך תפוגה לחדש.

function base64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function appleConfigured(): boolean {
  return ['APPLE_PRIVATE_KEY', 'APPLE_KEY_ID', 'APPLE_TEAM_ID', 'APPLE_SERVICES_ID'].every((k) => !!Deno.env.get(k));
}

async function appleClientSecret(): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(Deno.env.get('APPLE_PRIVATE_KEY')!),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: Deno.env.get('APPLE_KEY_ID') }));
  const payload = base64url(
    JSON.stringify({
      iss: Deno.env.get('APPLE_TEAM_ID'),
      iat: now,
      exp: now + 300,
      aud: 'https://appleid.apple.com',
      sub: Deno.env.get('APPLE_SERVICES_ID'),
    })
  );
  // WebCrypto מחזיר חתימת ECDSA בפורמט r||s - בדיוק מה ש-ES256 ב-JWT דורש
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${base64url(signature)}`;
}

/** מבטל את ההרשאה שהמשתמש נתן לאפליקציה ב-Apple. זורק אם Apple החזירה שגיאה. */
export async function revokeAppleToken(refreshToken: string): Promise<void> {
  const body = new URLSearchParams({
    client_id: Deno.env.get('APPLE_SERVICES_ID')!,
    client_secret: await appleClientSecret(),
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  const res = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Apple revoke failed: ${res.status} ${await res.text()}`);
}
