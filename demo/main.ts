import { VRPlayer } from '../src/index';

// 仅在 URL 带 ?debug 时按需加载 vConsole，方便手机端排查问题（避免公共 Demo 多加载 200 KB）
if (new URLSearchParams(window.location.search).has('debug')) {
  const script = document.createElement('script');
  script.src = `${import.meta.env.BASE_URL}vconsole.js`;
  script.onload = () => {
    const VConsoleCtor = (window as unknown as { VConsole?: new () => undefined }).VConsole;
    if (VConsoleCtor) new VConsoleCtor();
  };
  document.head.appendChild(script);
}

/** 按 id + 标签名获取元素并断言类型，缺失或标签不符时抛错 */
function $<K extends keyof HTMLElementTagNameMap>(id: string, tag: K): HTMLElementTagNameMap[K] {
  const el = document.getElementById(id);
  if (!el || el.tagName.toLowerCase() !== tag)
    throw new Error(`demo: expected <${tag} id="${id}">`);
  return el as HTMLElementTagNameMap[K];
}

const container = $('player', 'div');
const srcInput = $('src', 'input');
// 默认视频源放在 public/ 下，随构建产物一起发布；BASE_URL 兼容 dev('/') 与 Pages('/vr-player/')
srcInput.value = `${import.meta.env.BASE_URL}vr.mp4`;
const loadBtn = $('load', 'button');
const playBtn = $('play', 'button');
const pauseBtn = $('pause', 'button');
const gyroBtn = $('gyro', 'button');
const fovSlider = $('fov', 'input');
const fovValue = $('fovValue', 'span');
const webglSelect = $('webgl', 'select');
const renderScaleSlider = $('renderScale', 'input');
const renderScaleValue = $('renderScaleValue', 'span');
const seekSlider = $('seek', 'input');
const timeLabel = $('time', 'span');

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

/** 上下文恢复后重建播放器，并重新加载当前视频源 */
function rebuildPlayer(): void {
  const version = Number.parseInt(webglSelect.value, 10) as 1 | 2;
  const src = currentSrc || `${import.meta.env.BASE_URL}vr.mp4`;

  player.destroy();
  seeking = false;
  seekSlider.value = '0';
  createPlayer(version);

  player
    .load(src)
    .then(() => player.play())
    .catch((e) => console.error('Reload after context restore failed:', e));
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

  // WebGL 上下文丢失时库内部只会 console.warn 并停止渲染循环，不会自行恢复，
  // 表现就是「黑屏且控制台没有报错」。这里在恢复事件里重建播放器实现自愈：
  // 上下文丢失后 program / geometry / texture 全部失效，只能整体重建。
  const canvasEl = container.querySelector('canvas');
  if (canvasEl) {
    canvasEl.addEventListener('webglcontextlost', () => {
      console.warn('[demo] WebGL context lost. Waiting for the browser to restore it…');
    });
    canvasEl.addEventListener('webglcontextrestored', () => {
      console.warn('[demo] WebGL context restored. Rebuilding the player…');
      rebuildPlayer();
    });
  }

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

/**
 * 首次打开自动加载示例视频。
 * 直接落在页面上的访客若只看到纯黑，会以为 Demo 坏了——实测这正是
 * README 链接过来的第一印象。浏览器只允许「静音自动播放」，
 * 因此这次自动播放临时静音；用户手动点 Load 时恢复有声播放。
 */
async function autoLoadSample(): Promise<void> {
  const src = `${import.meta.env.BASE_URL}vr.mp4`;
  currentSrc = src;
  try {
    player.video.muted = true;
    await player.load(src);
    await player.play();
    console.log('Sample video autoloaded');
  } catch {
    // 自动加载或自动播放被拦截时不打扰用户：首帧通常已渲染，手动点 Load 即可
  }
}

void autoLoadSample();

loadBtn.addEventListener('click', async () => {
  const src = srcInput.value.trim();
  if (!src) {
    alert('Please enter a video URL');
    return;
  }
  currentSrc = src;
  player.video.muted = false; // 手动加载恢复有声播放
  try {
    await player.load(src);
    await player.play();
    console.log('Video loaded');
  } catch (e) {
    console.error('Load failed:', e);
    alert(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

playBtn.addEventListener('click', async () => {
  try {
    await player.play();
  } catch (e) {
    console.error('Play failed:', e);
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
    alert('Failed to enable gyroscope (unsupported device or permission denied)');
    gyroBtn.textContent = 'Gyro: off';
    return;
  }
  gyroBtn.textContent = `Gyro: ${player.isGyroscopeEnabled() ? 'on' : 'off'}`;
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
      console.log(`Switched to WebGL ${version} and reloaded video`);
    } catch (e) {
      console.error('Reload after switch failed:', e);
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
