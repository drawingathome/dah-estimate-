#!/usr/bin/env node
// tests/schema-contract-check.js
// ══════════════════════════════════════════════════
// 2026-10-26(마스터 문서 누락 항목 "스키마 계약 시험", 10/23 평가 4번): 앱·구글 스크립트가 서버에 보내는 조회 주소 안의 표 이름과 열 이름이
// 실제 DB에 존재하는지 확인한다. 열 이름이 틀리면 서버가 400을 주는데, 이 앱은 오류를 조용히 넘기는 곳이 많아 한참 뒤에야 발견됐음
// (예: 존재하지 않는 값을 있다고 가정한 단계 이름 표시 오류가 9/15부터 방치).
// 기준 파일: tests/fixtures/db-columns.json (운영 DB information_schema에서 읽기 전용으로 뽑은 것. DB 열을 바꾸면 함께 갱신).
// 검사 범위: 문자열로 적힌 조회 주소 `표?select=열,열&order=열.desc&열=eq.값`의 표·열. (저장 본문 키는 검사하지 않음 — 한계)
// ══════════════════════════════════════════════════
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'db-columns.json'), 'utf8')).tables;
const files = fs.readdirSync(ROOT).filter(f => /\.js$/.test(f) && !/\.config\.js$/.test(f) && f !== 'html2pdf.bundle.min.js' && f !== 'sw.js');
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and', 'not', 'apikey', 'v', 'verify']);
let failed = 0; let checked = 0; const problems = [];
const tableRe = new RegExp('[\'"`/]((?:' + Object.keys(schema).join('|') + '))\\?([^\'"`]*)', 'g');
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }
files.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let m;
  while ((m = tableRe.exec(src))) {
    const table = m[1]; const qs = m[2]; const cols = new Set(schema[table]);
    const line = src.slice(0, m.index).split('\n').length;
    const bad = (col, where) => { problems.push(`${f}:${line} ${table}?${where} — 열 "${col}" 이(가) DB 표 ${table}에 없음`); };
    qs.split('&').forEach(part => {
      if (!part) return;
      const eq = part.indexOf('='); const key = eq < 0 ? part : part.slice(0, eq); const val = eq < 0 ? '' : part.slice(eq + 1);
      if (key === 'select') {
        splitTop(val).forEach(c => { c = c.trim(); if (!c || c === '*' || /['"+$]/.test(c) || c.includes('(')) return; c = c.replace(/^[a-z_]+:/, '').split('->')[0].split('::')[0]; if (!/^[a-z_]+$/.test(c)) return; checked++; if (!cols.has(c)) bad(c, 'select'); });
      } else if (key === 'order') {
        val.split(',').forEach(c => { c = c.split('.')[0].trim(); if (!c || /['"+$]/.test(c) || !/^[a-z_]+$/.test(c)) return; checked++; if (!cols.has(c)) bad(c, 'order'); });
      } else if (!RESERVED.has(key) && /^[a-z_]+$/.test(key) && /^(eq|neq|gt|gte|lt|lte|in|is|like|ilike)\./.test(val || '')) {
        checked++; if (!cols.has(key)) bad(key, '필터');
      }
    });
  }
});
console.log(`검사한 열 참조 ${checked}개 (파일 ${files.length}개)`);
if (problems.length) { problems.forEach(p => console.log('❌ ' + p)); failed = problems.length; }
else console.log('✅ 모든 조회 주소의 표·열 이름이 실제 DB에 존재');
if (checked < 40) { console.log('❌ 검사 대상이 너무 적음(' + checked + ') — 검사 패턴 이상'); failed++; }
process.exit(failed ? 1 : 0);
