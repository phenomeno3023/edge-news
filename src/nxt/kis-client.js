import { createNxtRestRequest, parseNxtRestRankingResponse } from "./provider.js";

export function createKisRestClient({ config, auth, fetchImpl = fetch, now = () => new Date().toISOString() }) {
  async function getNxtFluctuationRanking(overrides = {}) {
    if (!config.enabled) throw new Error("NXT_COLLECTION_DISABLED");
    if (!config.configured) throw new Error("NXT_CREDENTIALS_UNCONFIGURED");
    const request = createNxtRestRequest({ enabled: true, overrides });
    const accessToken = await auth.getAccessToken();
    const url = new URL(`${config.baseUrl}${request.path}`);
    for (const [key, value] of Object.entries(request.params)) url.searchParams.set(key, value);
    const response = await fetchImpl(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        appkey: config.appKey,
        appsecret: config.appSecret,
        tr_id: request.trId,
        custtype: "P"
      }
    });
    if (!response.ok) throw new Error(`KIS_REST_HTTP_${response.status}`);
    const payload = await response.json();
    return parseNxtRestRankingResponse(payload, now());
  }
  return Object.freeze({ getNxtFluctuationRanking });
}
