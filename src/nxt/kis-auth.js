const TOKEN_PATH = "/oauth2/tokenP";
const APPROVAL_PATH = "/oauth2/Approval";

async function postJson(fetchImpl, url, body) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`KIS_AUTH_HTTP_${response.status}`);
  return response.json();
}

export function createKisAuth({ config, fetchImpl = fetch, now = () => Date.now() }) {
  let token = null;
  let tokenExpiresAt = 0;
  let tokenPromise = null;
  let approvalKey = null;
  let approvalExpiresAt = 0;
  let approvalPromise = null;

  function assertReady() {
    if (!config.enabled) throw new Error("NXT_COLLECTION_DISABLED");
    if (!config.configured) throw new Error("NXT_CREDENTIALS_UNCONFIGURED");
  }

  async function getAccessToken() {
    assertReady();
    if (token && now() < tokenExpiresAt - 60_000) return token;
    if (tokenPromise) return tokenPromise;
    tokenPromise = (async () => {
      const data = await postJson(fetchImpl, `${config.baseUrl}${TOKEN_PATH}`, {
        grant_type: "client_credentials", appkey: config.appKey, appsecret: config.appSecret
      });
      if (!data.access_token || !Number.isFinite(Number(data.expires_in))) throw new Error("KIS_TOKEN_RESPONSE_INVALID");
      token = data.access_token;
      tokenExpiresAt = now() + Number(data.expires_in) * 1000;
      return token;
    })();
    try { return await tokenPromise; } finally { tokenPromise = null; }
  }

  async function getWebSocketApprovalKey() {
    assertReady();
    if (approvalKey && now() < approvalExpiresAt - 60_000) return approvalKey;
    if (approvalPromise) return approvalPromise;
    approvalPromise = (async () => {
      const data = await postJson(fetchImpl, `${config.baseUrl}${APPROVAL_PATH}`, {
        grant_type: "client_credentials", appkey: config.appKey, secretkey: config.appSecret
      });
      if (typeof data.approval_key !== "string" || !data.approval_key) throw new Error("KIS_WS_APPROVAL_RESPONSE_INVALID");
      approvalKey = data.approval_key;
      // KIS portal states the approval key is valid for 24 hours. Refresh early.
      approvalExpiresAt = now() + 23 * 60 * 60 * 1000;
      return approvalKey;
    })();
    try { return await approvalPromise; } finally { approvalPromise = null; }
  }

  return Object.freeze({ getAccessToken, getWebSocketApprovalKey });
}
