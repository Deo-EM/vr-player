import { VRPlayer } from '../src/index';

const container = document.getElementById('player');
if (!container) throw new Error('demo: #player element not found');
const srcInput = document.getElementById('src') as HTMLInputElement;
const loadBtn = document.getElementById('load') as HTMLButtonElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
const fovSlider = document.getElementById('fov') as HTMLInputElement;
const fovValue = document.getElementById('fovValue') as HTMLSpanElement;

const player = new VRPlayer({
  container,
  fov: 75,
  autoPlay: true,
  muted: false,
  loop: true,
});

// 同步滚轮/代码修改的 FOV 到 UI 滑块
player.onFovChange((fov) => {
  fovSlider.value = String(fov);
  fovValue.textContent = `${Math.round(fov)}°`;
});

// 调试时暴露 player 到全局，方便控制台查看
(window as unknown as { player: typeof player }).player = player;

loadBtn.addEventListener('click', async () => {
  const src = srcInput.value.trim();
  if (!src) {
    alert('请输入视频源 URL');
    return;
  }
  try {
    await player.load(src);
    console.log('视频加载完成');
  } catch (e) {
    console.error('加载失败:', e);
    alert(`加载失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

playBtn.addEventListener('click', async () => {
  try {
    await player.play();
  } catch (e) {
    console.error('播放失败:', e);
  }
});

pauseBtn.addEventListener('click', () => {
  player.pause();
});

fovSlider.addEventListener('input', () => {
  const fov = Number.parseInt(fovSlider.value, 10);
  player.setFov(fov);
  fovValue.textContent = `${fov}°`;
});

// 清理
window.addEventListener('beforeunload', () => {
  player.destroy();
});
