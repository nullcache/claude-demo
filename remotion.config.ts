import {Config} from '@remotion/cli/config';
import fs from 'node:fs';

// 云端环境预装了 Chromium headless shell；本地若无此路径则走 Remotion 自带浏览器
const LOCAL_SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
if (fs.existsSync(LOCAL_SHELL)) Config.setBrowserExecutable(LOCAL_SHELL);

// 纯色块画面：PNG 中间帧避免 JPEG 色块噪点；高码率 H.264 + bt709
Config.setVideoImageFormat('png');
Config.setCodec('h264');
Config.setCrf(14);
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
Config.setX264Preset('slow');
Config.setConcurrency(4);
