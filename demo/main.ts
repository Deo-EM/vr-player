import { VRPlayer } from '../src/index';

const playerEl = document.getElementById('player');
if (!playerEl) throw new Error('demo: #player element not found');
const container: HTMLElement = playerEl;
const srcInput = document.getElementById('src') as HTMLInputElement;
const loadBtn = document.getElementById('load') as HTMLButtonElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
const fovSlider = document.getElementById('fov') as HTMLInputElement;
const fovValue = document.getElementById('fovValue') as HTMLSpanElement;
const webglSelect = document.getElementById('webgl') as HTMLSelectElement;
const renderScaleSlider = document.getElementById('renderScale') as HTMLInputElement;
const renderScaleValue = document.getElementById('renderScaleValue') as HTMLSpanElement;

let player: VRPlayer;
let currentSrc = '';

/** 根据版本创建播放器实例 */
function createPlayer(webglVersion: 1 | 2): void {
  const renderScale = Number.parseFloat(renderScaleSlider.value);
  player = new VRPlayer({
    container,
    fov: 120,
    muted: false,
    loop: true,
    webgl: webglVersion,
    renderScale,
  });

  // 同步滚轮/代码修改的 FOV 到 UI 滑块
  player.onFovChange((fov) => {
    fovSlider.value = String(fov);
    fovValue.textContent = `${Math.round(fov)}°`;
  });

  // 调试时暴露 player 到全局，方便控制台查看
  (window as unknown as { player: typeof player }).player = player;
}

createPlayer(Number.parseInt(webglSelect.value, 10) as 1 | 2);

loadBtn.addEventListener('click', async () => {
  const src = srcInput.value.trim();
  if (!src) {
    alert('请输入视频源 URL');
    return;
  }
  currentSrc = src;
  try {
    await player.load(src);
    await player.play();
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

// 切换 WebGL 版本：销毁旧实例并创建新实例（上下文版本在构造时确定，需重建）
webglSelect.addEventListener('change', async () => {
  const version = Number.parseInt(webglSelect.value, 10) as 1 | 2;
  player.destroy();
  createPlayer(version);

  // 如果之前已加载视频，自动重新加载
  if (currentSrc) {
    try {
      await player.load(currentSrc);
      await player.play();
      console.log(`已切换到 WebGL ${version} 并重新加载视频`);
    } catch (e) {
      console.error('切换后重新加载失败:', e);
    }
  }
});

// 超采样倍率调整（实时生效，无需重建）
renderScaleSlider.addEventListener('input', () => {
  const scale = Number.parseFloat(renderScaleSlider.value);
  player.setRenderScale(scale);
  renderScaleValue.textContent = `${scale.toFixed(2)}x`;
});

// 清理
window.addEventListener('beforeunload', () => {
  player.destroy();
});
