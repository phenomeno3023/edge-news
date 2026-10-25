function normalized(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").slice(0, 500);
}

function safeProviderCode(value) {
  const code = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{1,32}$/.test(code) ? code : null;
}

export function classifyKisProviderMessage(message) {
  const text = normalized(message);
  if (/권한|미신청|신청되지|이용할 수 없|권한이 없|permission|not authorized|not entitled/.test(text)) return "KIS_PERMISSION_DENIED";
  if (/미지원|지원하지 않|지원되지 않|유효하지 않은 (tr|시장|거래소)|잘못된 (tr|시장|거래소)|not supported|unsupported|invalid market|invalid tr/.test(text)) return "KIS_API_NOT_SUPPORTED";
  if (/app.?key|app.?secret|인증키|시크릿|인증 실패|token|인증 오류|unauthorized|invalid credential/.test(text)) return "KIS_AUTH_REJECTED";
  if (/초당|호출 한도|요청 한도|과도한 요청|rate limit|too many requests/.test(text)) return "KIS_RATE_LIMITED";
  return "KIS_PROVIDER_REJECTED";
}

export function safeKisError(error, phase = "unknown") {
  const message = String(error?.message ?? "");
  const providerCode = safeProviderCode(error?.providerCode ?? message.match(/(?:REST_PROVIDER_ERROR:|KIS_PROVIDER_ERROR:)([A-Za-z0-9_-]{1,32})/)?.[1]);
  let code = null;

  if (error?.providerMessage) code = classifyKisProviderMessage(error.providerMessage);
  if (!code && /NXT_COLLECTION_DISABLED/.test(message)) code = "NXT_COLLECTION_DISABLED";
  if (!code && /NXT_CREDENTIALS_UNCONFIGURED/.test(message)) code = "KIS_CREDENTIALS_UNCONFIGURED";
  if (!code && /KIS_TOKEN_RESPONSE_INVALID|KIS_WS_APPROVAL_RESPONSE_INVALID/.test(message)) code = "KIS_AUTH_RESPONSE_INVALID";
  if (!code && /(?:KIS_AUTH|KIS_REST)_HTTP_401\b/.test(message)) code = "KIS_AUTH_REJECTED";
  if (!code && /(?:KIS_AUTH|KIS_REST)_HTTP_403\b/.test(message)) code = "KIS_PERMISSION_DENIED";
  if (!code && /KIS_AUTH_HTTP_400\b/.test(message)) code = "KIS_AUTH_REJECTED";
  if (!code && /KIS_REST_HTTP_400\b/.test(message)) code = "KIS_REST_REQUEST_REJECTED";
  if (!code && /(?:KIS_AUTH|KIS_REST)_HTTP_404\b/.test(message)) code = "KIS_API_ENDPOINT_NOT_FOUND";
  if (!code && /(?:KIS_AUTH|KIS_REST)_HTTP_429\b/.test(message)) code = "KIS_RATE_LIMITED";
  if (!code && /(?:KIS_AUTH|KIS_REST)_HTTP_5\d\d\b/.test(message)) code = "KIS_PROVIDER_UNAVAILABLE";
  if (!code && /REST_PROVIDER_ERROR:/.test(message)) code = "KIS_PROVIDER_REJECTED";
  if (!code && /REST_RESPONSE_NOT_OBJECT|REST_OUTPUT_NOT_ARRAY|WS_APPROVAL_RESPONSE_INVALID|KIS_RESPONSE_INVALID/.test(message)) code = "KIS_PROVIDER_RESPONSE_INVALID";
  if (!code && (error?.name === "AbortError" || /KIS_REQUEST_TIMEOUT/.test(message))) code = "KIS_REQUEST_TIMEOUT";
  if (!code && /fetch failed|network error|econnreset|econnrefused|enotfound|eai_again|etimedout|socket hang up/i.test(message)) code = "KIS_NETWORK_ERROR";
  if (!code) code = "KIS_CHECK_FAILED";

  return { ok: false, code, phase, ...(providerCode ? { providerCode } : {}) };
}
