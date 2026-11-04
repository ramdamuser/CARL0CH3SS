// Downloaded CC0 recordings; see public/sounds/CREDITS.md.
export function soundForTransition(previous, next) {
  if (!previous || previous.id !== next.id) return null;
  if (next.result && !previous.result) return 'end';
  if (next.history.length <= previous.history.length) return null;
  if (next.check) return 'check';
  return next.lastMove?.captured ? 'capture' : 'move';
}

export function createSoundPlayer() {
  let context, loading;
  let muted = false;
  const buffers = new Map();
  const sources = new Set();
  async function unlock() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      context ||= new AudioContext();
      if (context.state === 'suspended') await context.resume();
      loading ||= Promise.all(['move', 'capture'].map(async name => {
        const response = await fetch(`/sounds/${name}.mp3`);
        if (!response.ok) throw new Error('Sound unavailable');
        buffers.set(name, await context.decodeAudioData(await response.arrayBuffer()));
      })).catch(() => { loading = null; });
      await loading;
    } catch { /* Audio support or autoplay permission must never block chess. */ }
  }
  return {
    unlock,
    setMuted(value) {
      muted = value;
      if (muted) for (const source of sources) { try { source.stop(); } catch { /* already stopped */ } }
    },
    play(event) {
      if (muted || !context || context.state !== 'running') return;
      const name = event === 'capture' ? 'capture' : 'move';
      const buffer = buffers.get(name);
      if (!buffer) return; // Never replay old moves once a download completes.
      const offsets = event === 'check' ? [0, .15] : event === 'end' ? [0, .18, .4] : [0];
      for (const offset of offsets) {
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        gain.gain.value = name === 'capture' ? .3 : .55;
        source.connect(gain).connect(context.destination);
        sources.add(source);
        source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); };
        source.start(context.currentTime + offset);
      }
    },
    dispose() {
      for (const source of sources) { try { source.stop(); } catch { /* already stopped */ } }
      sources.clear();
      context?.close().catch(() => {});
    },
  };
}
