const rules = [
 ['주주환원', /주주환원|자사주|자기주식|소각|특별배당|배당 확대|기업가치 제고/i],
 ['수주·계약', /수주|공급계약|계약 체결|프로젝트 수주|독점계약/i],
 ['실적', /영업이익|실적|흑자전환|매출액|가이던스|전망치/i],
 ['기술·사업', /임상|신약|승인|반도체|AI|로봇|방산|원전|증설|신사업/i],
 ['정책·해외', /정책|규제 완화|미국|투자 확대|수혜/i],
];
const amountRx = /(?:\d[\d,.]*\s*(?:조|억|만)?\s*원|\d+(?:\.\d+)?\s*%|\d[\d,.]*\s*(?:달러|유로))/g;
export function analyze(item) {
 const text = `${item.title} ${item.content || ''}`;
 const category = rules.find(([,re])=>re.test(text))?.[0] || '기타';
 const strong = /자사주.{0,12}(?:매입|소각)|자기주식.{0,12}(?:취득|소각)|영업이익.{0,20}\d|흑자전환|대규모.{0,12}(?:수주|공급계약)|임상.{0,12}(?:성공|승인)|FDA.{0,12}승인/i.test(text);
 const medium = /상향|급증|증가|호실적|실적 호조|수주|계약|승인|배당|투자|증설/i.test(text);
 const adverse = /감소|하락|급락|하향|적자|부진|리콜|취소|철회|정정|우려|경고|손실|수주 공백|목표가 하향|파업|소송|내렸다|뚝|위축/i.test(text);
 const amounts = [...new Set(text.match(amountRx) || [])];
 const grade = strong && amounts.length && !adverse ? 'A' : (strong||medium) && !adverse ? 'B' : 'C';
 const risks = adverse ? '부정·혼재 표현이 있어 호재로 단정하지 않습니다. 원문과 공시 확인이 필요합니다.' : /유상증자|전환사채|BW|계약 해지/i.test(text) ? '희석·계약 위험 표현이 포함되어 원문 확인이 필요합니다.' : '본문에서 명시적 위험 표현을 찾지 못했습니다. 미확인 위험이 없다는 뜻은 아닙니다.';
 return {category, grade, amounts, risks, summary:(item.content||item.title).replace(/\s+/g,' ').slice(0,420), facts:['원문에 기재된 제목과 본문만 추출했습니다.'], impact:grade==='A'?'수치가 확인된 중대한 기업 이벤트로 추가 검증 가치가 높습니다.':'긍정 관련 표현이 있으나 기업 규모 대비 영향은 추가 확인이 필요합니다.'};
}
export function stableId(url,title) {
 if(!url)return title.trim().toLowerCase();
 try{const u=new URL(url);for(const k of [...u.searchParams.keys()])if(/^(utm(?:_.+)?|fbclid|gclid|ref|source)$/i.test(k))u.searchParams.delete(k);u.hash='';u.searchParams.sort();return u.toString();}catch{return url.split('#')[0];}
}
export function normalizeTitle(title='') { return title.toLocaleLowerCase('ko-KR').replace(/^\s*\[(?:속보|단독|종합|정정)\]\s*/,'').replace(/\[[^\]]+\]\s*/g,'').replace(/[\s\p{P}\p{S}]/gu,''); }
