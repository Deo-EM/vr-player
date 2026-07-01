import { VRPlayer } from '../src/index';

// 接入 vConsole，方便手机端排查问题（console/network/存储等）
const VConsoleCtor = (window as unknown as { VConsole?: new () => undefined }).VConsole;
if (VConsoleCtor) {
  new VConsoleCtor();
}

const playerEl = document.getElementById('player');
if (!playerEl) throw new Error('demo: #player element not found');
const container: HTMLElement = playerEl;
const srcInput = document.getElementById('src') as HTMLInputElement;
const loadBtn = document.getElementById('load') as HTMLButtonElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
const gyroBtn = document.getElementById('gyro') as HTMLButtonElement;
const fovSlider = document.getElementById('fov') as HTMLInputElement;
const fovValue = document.getElementById('fovValue') as HTMLSpanElement;
const webglSelect = document.getElementById('webgl') as HTMLSelectElement;
const renderScaleSlider = document.getElementById('renderScale') as HTMLInputElement;
const renderScaleValue = document.getElementById('renderScaleValue') as HTMLSpanElement;
const seekSlider = document.getElementById('seek') as HTMLInputElement;
const timeLabel = document.getElementById('time') as HTMLSpanElement;

let player: VRPlayer;
let currentSrc = '';
/** 用户正在拖动进度条时为 true，避免 timeupdate 反向覆盖 */
let seeking = false;

/** 秒数格式化为 mm:ss（不足 1 小时）或 h:mm:ss */
function formatTime(sec: number): string {
  const clamped = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const s = Math.floor(clamped % 60);
  const m = Math.floor((clamped / 60) % 60);
  const h = Math.floor(clamped / 3600);
  const ss = String(s).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 根据版本创建播放器实例 */
function createPlayer(webglVersion: 1 | 2): void {
  const renderScale = Number.parseFloat(renderScaleSlider.value);
  player = new VRPlayer({
    container,
    fov: 75,
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

  // 视频元数据就绪：设置总时长显示
  const video = player.video;
  video.addEventListener('loadedmetadata', () => {
    timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  });
  // 播放进度更新：同步滑块与时间文本（拖动中不覆盖）
  video.addEventListener('timeupdate', () => {
    if (seeking) return;
    const dur = video.duration;
    if (Number.isFinite(dur) && dur > 0) {
      seekSlider.value = String(Math.round((video.currentTime / dur) * 1000));
    }
    timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  });
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

// 陀螺仪开关：需在用户手势内调用以通过 iOS 13+ 权限请求
gyroBtn.addEventListener('click', async () => {
  const target = !player.isGyroscopeEnabled();
  const ok = await player.setGyroscope(target);
  if (target && !ok) {
    alert('陀螺仪开启失败（设备不支持或权限被拒绝）');
    gyroBtn.textContent = '陀螺仪: 关';
    return;
  }
  gyroBtn.textContent = `陀螺仪: ${player.isGyroscopeEnabled() ? '开' : '关'}`;
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
  seeking = false;
  seekSlider.value = '0';
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

// 进度条：拖动中实时跳转，松开后清除标志位
seekSlider.addEventListener('input', () => {
  const dur = player.video.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  seeking = true;
  const t = (Number.parseFloat(seekSlider.value) / 1000) * dur;
  player.video.currentTime = t;
  timeLabel.textContent = `${formatTime(t)} / ${formatTime(dur)}`;
});
seekSlider.addEventListener('change', () => {
  seeking = false;
});

// 清理
window.addEventListener('beforeunload', () => {
  player.destroy();
});
