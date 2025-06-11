import { atom } from '@reatom/core';

export const soundEnabledAtom = atom(true).actions(target => ({
    toggle: () => target.set(prev => !prev),
    enable: () => target.set(true),
    disable: () => target.set(false)
}));

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext {
    if (!audioCtx) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new Ctx();
    }
    return audioCtx!;
}

function playTone(freq: number, duration: number) {
    if (!soundEnabledAtom()) return;
    const ctx = getCtx();
    ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

export const sounds = {
    move: () => playTone(600, 0.05),
    rotate: () => playTone(800, 0.05),
    drop: () => playTone(300, 0.1),
    clear: () => playTone(1000, 0.15),
    gameOver: () => playTone(200, 0.5)
};
