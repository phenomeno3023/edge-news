import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,stableId} from '../src/analyze.js';

test('classifies self-share purchase news and extracts only stated values',()=>{
 const a=analyze({title:'삼성E&A, 자사주 6900억원 매입·소각 결정',content:'영업이익 5006억원, 전년 대비 183.6% 증가'});
 assert.equal(a.category,'주주환원');
 assert.equal(a.grade,'A');
 assert.ok(a.amounts.includes('6900억원'));
 assert.match(a.risks,/미확인/);
});
test('unknown positive language stays low confidence and no invented amounts',()=>{
 const a=analyze({title:'기업가치 제고 기대감 확대'});
 assert.equal(a.grade,'C');
 assert.deepEqual(a.amounts,[]);
});
test('unquantified repurchase stays B and adverse wording prevents a positive grade',()=>{
 assert.equal(analyze({title:'자기주식 취득 결정'}).grade,'B');
 assert.equal(analyze({title:'호실적에도 연간 전망 하향'}).grade,'C');
});
test('mixed earnings and shareholder-return headlines prefer the shareholder-return category',()=>{
 assert.equal(analyze({title:"삼성E&A, 호실적·주주환원 소식에 급등"}).category,'주주환원');
});
test('stable article identity ignores fragments and tracking query parameters',()=>{
 assert.equal(stableId('https://example.com/story?utm=x#top','title'),'https://example.com/story');
 assert.notEqual(stableId('https://dart.fss.or.kr/view?rcpNo=1',''),stableId('https://dart.fss.or.kr/view?rcpNo=2',''));
});
