import requests,json,time,re,collections
UA={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36","Referer":"https://www.bilibili.com/"}
KW=re.compile(r"极乐|迪斯科|disco|elysium|哈里|金·?曷城|kitsuragi|du ?bois|瑞瓦肖|让彪|哈金|金哈",re.I)
seeds=["BV1wL4y167x4","BV136hR6pEff","BV1Mo4y1R7dt","BV1CS4y1S7Sd","BV1JP411J7Uy","BV1DQ4y1679k","BV1F64y1E7Dg","BV1q5411a7Fq","BV1ih411K7Dm","BV1iTUZBCE35"]
seen={};q=collections.deque(seeds);n=0
while q and n<220:
    b=q.popleft();n+=1
    try: d=requests.get("https://api.bilibili.com/x/web-interface/archive/related",params={"bvid":b},headers=UA,timeout=15).json()
    except Exception as e: print("err",e);continue
    for v in d.get("data") or []:
        t=v["title"]+" "+v.get("desc","")
        if not KW.search(t) or v["bvid"] in seen: continue
        seen[v["bvid"]]=dict(bvid=v["bvid"],title=v["title"],desc=v.get("desc","")[:300],dur=v["duration"],view=v["stat"]["view"],tname=v.get("tname"),owner=v["owner"]["name"])
        q.append(v["bvid"])
    time.sleep(0.4)
json.dump(list(seen.values()),open("bili.json","w"),ensure_ascii=False,indent=1)
print(len(seen),"found after",n)
