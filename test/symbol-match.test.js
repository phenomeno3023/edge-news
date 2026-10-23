import test from 'node:test';
import assert from 'node:assert/strict';
import {matchSymbol} from '../src/symbol-match.js';

const symbols=new Map([
  ['버넥트',{ticker:'438700',company:'버넥트'}],
  ['HD한국조선해양',{ticker:'009540',company:'HD한국조선해양'}],
  ['현대중공업',{ticker:'329180',company:'HD현대중공업'}],
  ['SK',{ticker:'034730',company:'SK'}],
  ['SK하이닉스',{ticker:'000660',company:'SK하이닉스'}],
  ['삼성전자',{ticker:'005930',company:'삼성전자'}],
]);

test('headline subject match prefers first-mentioned company over later partners',()=>{
  assert.equal(matchSymbol('버넥트, HD한국조선해양·현대중공업과 협약', '', symbols).ticker,'438700');
});

test('known headline shorthand does not fall through to ticker SK',()=>{
  assert.equal(matchSymbol('반도체주 약세…SK하닉, 솔리다임 상장 중단에도 약세','',symbols).ticker,'000660');
  assert.equal(matchSymbol('SK 실적 발표','',symbols).ticker,'034730');
});

test('Samsung E&A shorthand resolves to its listed issuer code',()=>{
  assert.deepEqual(matchSymbol('영업익 예상치 두 배 삼성E&A 자사주 매입'),{ticker:'028050',company:'삼성E&A'});
});

test('DART corporation name can be used when the report title omits the issuer',()=>{
  assert.equal(matchSymbol('단일판매·공급계약 체결','삼성전자',symbols).ticker,'005930');
});

test('unmatched general news remains unlinked to an issuer',()=>{
  assert.deepEqual(matchSymbol('코스피, 기술주 약세에 하락','',symbols),{});
});
