import {continueRender, delayRender, staticFile} from 'remotion';
import {F} from './core';

// 字体均为 SIL OFL 开源字体，经 scripts/dangan-fonts.py 按片中实际用字子集化
const FILES: Array<[string, string]> = [
  [F.sans, 'fonts/dangan/NotoSansSC-Black.ttf'],
  [F.serif, 'fonts/dangan/NotoSerifSC-Black.ttf'],
  [F.pop, 'fonts/dangan/ZCOOLQingKeHuangYou.ttf'],
  [F.latin, 'fonts/dangan/Anton.ttf'],
  [F.pixel, 'fonts/dangan/PressStart2P.ttf'],
  [F.mid, 'fonts/dangan/NotoSansSC-Medium.ttf'],
];

let loaded = false;
export function loadFonts() {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;
  const handle = delayRender('dangan fonts');
  Promise.all(
    FILES.map(async ([family, file]) => {
      const face = new FontFace(family, `url('${staticFile(file)}') format('truetype')`);
      await face.load();
      (document.fonts as unknown as {add: (f: FontFace) => void}).add(face);
    }),
  )
    .then(() => continueRender(handle))
    .catch(err => {
      console.error(err);
      continueRender(handle);
    });
}
