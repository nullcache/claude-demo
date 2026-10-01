# 极乐迪斯科 MAD：选曲调研

方法：从若干极乐迪斯科相关视频出发，爬取 B 站"相关推荐"接口，共 220 次请求，收集到 689 个相关视频，
筛出 111 个同人、混剪、手书作品，再用 yt-dlp 读取简介和标签确认 BGM。爬虫脚本见 `crawl.py`。
YouTube 在本环境被反爬拦截，只能通过网页搜索结果拿到标题。

## 已被用过的曲目（避免复用）

| 作品 | 类型 | 播放量 | BGM |
|---|---|---|---|
| BV1Jj411z7UH 警探到场（Oblivionblade 混剪搬运） | 混剪 | 29.4 万 | Alt-J – Intro |
| BV1aYzMBgET8 总有一天我会回到你身边【极乐迪斯科X真探】 | 混剪 | 16.2 万 | Alt-J – Tessellate (Live) |
| BV1384y1N7ET Baby Hotline | 手书 | 28.5 万 | Jack Stauber – Baby Hotline |
| BV17u411p793 Судно | 手书 | 4.3 万 | Molchat Doma – Судно (Борис Рыжий) |
| BV1Gr4y117ap 1000 People | GMV | 2.8 万 | 1000 People |
| BV1km421p71g 我和金 | 手书 | 1.6 万 | Five for Fighting – 100 Years |
| BV1DhgezxEKA 群像混剪/台词向 | 混剪 | 1.9 万 | Jo Blankenburg – History Repeating |
| BV1cZYZzvEoJ 一个叫苍鹭的男人决定去死 | 手书 | 2.3 万 | Motorama – Normandy |
| BV1NY8B6FEcK 群像｜步履不歇 | 手书 | 1.0 万 | Glass Animals – On the Run |
| BV1rC4y1D7zp 后朋克 Ceremony | 图片向 | – | New Order – Ceremony |
| BV1ujNAetECY 你并不是想死 | 混剪 | – | 犬儒乐队 – 志铭 |
| BV1MN4y1D7sW 鬼 | 手书 | – | 草东没有派对 – 鬼 |
| BV1DY411u7jf 哈里×朵拉 | 影视混剪 | 3.8 万 | Sea Power – Poznan |
| BV1A2GWzpEDv TEQUILA SUNSET | 混剪 | – | Sunset |
| BV1nq4y1w7BH 温柔至极的警督 | 混剪 | – | Rachael Yamagata – Dealbreaker |
| YouTube | edit | – | Paul Looney – God Please / Bo Burnham – All Eyes On Me / Big Thief – Paul / Just the Two of Us |

## 结论

1. 播放量最高的两个**混剪**都用 Alt-J：节奏推进型、音色冷、有点怪。这类歌忧郁和荒诞兼有，又能逐拍卡点。
   抒情慢歌基本只出现在手书里，而且播放量普遍偏低。
2. 第二大类是**东欧/苏联系后朋克、冷潮**（Molchat Doma、Motorama、New Order）。
   开发商 ZA/UM 来自爱沙尼亚，瑞瓦肖本身就是后苏联、后革命的废墟。这类音乐和世界观是同构的，所以"有深度"。
3. 深度高的混剪都会**跨媒介互文**：真探 X 极乐迪斯科（真探/双峰/火线），哈里×朵拉（性本恶/小丑/乡愁/冷战）。
   素材不局限于游戏本体。
4. 未被使用、且符合以上规律的候选：Кино – Пачка сигарет、万能青年旅店 – 杀死那个石家庄人、Talking Heads – Once in a Lifetime。
