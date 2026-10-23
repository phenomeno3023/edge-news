const DEFAULT_ALIASES = new Map([
  ['LS일렉트릭',{ticker:'010120',company:'LS ELECTRIC'}],
  ['LS ELECTRIC',{ticker:'010120',company:'LS ELECTRIC'}],
  ['삼성바이오',{ticker:'207940',company:'삼성바이오로직스'}],
  ['SK하닉',{ticker:'000660',company:'SK하이닉스'}],
]);

function findAt(text,name) {
  if (/^[A-Za-z0-9 .&-]+$/.test(name)) {
    const escaped=String(name).replace(/[.*+?^$()|[\]\\]/g,'\\$&');
    const match=new RegExp('(^|[^A-Za-z0-9])('+escaped+')($|[^A-Za-z0-9])','i').exec(text);
    return match ? match.index + match[1].length : -1;
  }
  return text.indexOf(name);
}

function earliestMatch(text, entries) {
  const matches=[];
  for (const [name,entry] of entries) {
    const index=findAt(text,String(name));
    if (index>=0) matches.push({name:String(name),entry,index});
  }
  matches.sort((a,b)=>a.index-b.index||b.name.length-a.name.length);
  return matches[0]?.entry;
}

export function matchSymbol(title, author='', symbolEntries=[]) {
  const entries=[...DEFAULT_ALIASES,...symbolEntries];
  const titleMatch=earliestMatch(String(title||''),entries);
  if (titleMatch) return titleMatch;
  return earliestMatch(String(author||''),entries)||{};
}
