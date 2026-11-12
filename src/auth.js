import { timingSafeEqual } from 'node:crypto';

export function authorized(req, env) {
  if (env.AUTH_MODE === 'azure-easyauth') {
    // Trust only behind App Service Authentication, which replaces these headers.
    // Never expose this mode via a direct container port or an untrusted proxy.
    try {
      const value = req.headers['x-ms-client-principal'];
      if (!value || value.length > 32768) return false;
      const principal = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
      if (principal.auth_typ !== 'aad' || !Array.isArray(principal.claims)) return false;
      const claim = types => principal.claims.filter(item => types.includes(item.typ)).map(item => item.val?.toLowerCase());
      const tenants = claim(['tid', 'http://schemas.microsoft.com/identity/claims/tenantid']);
      if (!tenants.includes(env.MS_TENANT_ID?.toLowerCase())) return false;
      const emails = claim(['preferred_username', 'email', 'emails', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn']);
      const allowed = (env.ALLOWED_USER_EMAILS || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
      return emails.some(email => allowed.includes(email));
    } catch { return false; }
  }
  const token = env.DASHBOARD_TOKEN || '';
  if (!token) return true;
  const actual = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
