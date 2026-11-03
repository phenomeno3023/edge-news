export function isValidWebUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function canonicalUrl(value) {
  if (!isValidWebUrl(value)) return null;
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm(?:_.+)?|fbclid|gclid|msclkid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  url.searchParams.sort();
  return url.toString();
}

export function isSixDigitSymbol(value) {
  return typeof value === 'string' && /^\d{6}$/.test(value.trim());
}

// Keep correction/follow-up wording in the key so similar notices are not collapsed.
export function exactTitleKey(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]/gu, '')
    : '';
}

export function parseSourceLinks(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function disclosureProvider(record) {
  const source = String(record?.source || '').trim();
  if (/^DART$/i.test(source) || /opendart\.fss\.or\.kr/i.test(source)) return 'DART';
  if (/kind\.krx\.co\.kr|^KIND$/i.test(source)) return 'KIND';
  return 'OTHER';
}

export function isDisclosureRecord(record) {
  const provider = disclosureProvider(record);
  return provider !== 'OTHER' || record?.is_disclosure === 1 || record?.is_disclosure === '1' || record?.is_disclosure === true;
}

export function getDartReceiptNumber(urlValue) {
  if (!isValidWebUrl(urlValue)) return null;
  const url = new URL(urlValue);
  for (const key of ['rcpNo', 'rcept_no', 'receipt_no', 'receiptNo']) {
    const value = url.searchParams.get(key);
    if (value && /^\d{14}$/.test(value)) return value;
  }
  return null;
}

export function stableSort(items, compare) {
  return items.map((value, index) => ({value, index}))
    .sort((a, b) => compare(a.value, b.value) || a.index - b.index)
    .map(({value}) => value);
}
