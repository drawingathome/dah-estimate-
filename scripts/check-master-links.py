import re,sys
s=open(sys.argv[1] if len(sys.argv)>1 else 'master.md',encoding='utf-8').read()
i4=s.index('## 4-0.'); i4b=s.index('## 4-B.')
road=s[i4:i4b]
# 열린 항목: 표 행 중 ✅ 로 시작하는 상태가 아닌 것
ids=[]
for l in s.split('\n'):
    mm=re.match(r'^\| ((?:H|N|R|F|P)-\d+[a-z]?)\b',l)
    if not mm: continue
    k=mm.group(1)
    done = ('✅' in l and '⏳' not in l and '🟡' not in l)
    if not done: ids.append(k)
ids=list(dict.fromkeys(ids))
orph=[k for k in ids if k not in road and not re.search(r'\b'+re.escape(k)+r'\b',road)]
print('열린(미완료·일부) 항목 수:',len(ids))
print('실행 순서(로드맵)에 연결 안 된 항목 수:',len(orph))
print(' '.join(orph))
