// Writes assets/ring.wav: a two-tone chime (880 Hz, then 660 Hz) and a pause, 1.5 s in all, so a
// looping player rings every 1.5 s. Run once: node scripts/make-ring.cjs
const fs = require('fs');
const path = require('path');

const rate = 22050;
const total = Math.round(rate * 1.5);
const samples = new Int16Array(total);
const tone = (start, seconds, hertz) => {
  const from = Math.round(start * rate);
  const length = Math.round(seconds * rate);
  for (let i = 0; i < length; i++) {
    // A soft start and end, so it chimes instead of clicking.
    const fade = Math.min(1, i / (rate * 0.01), (length - i) / (rate * 0.03));
    samples[from + i] = Math.round(Math.sin((2 * Math.PI * hertz * i) / rate) * 0.6 * fade * 32767);
  }
};
tone(0, 0.22, 880);
tone(0.27, 0.3, 660);

const data = Buffer.from(samples.buffer);
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16); // PCM chunk size
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28); // bytes per second
header.writeUInt16LE(2, 32); // bytes per frame
header.writeUInt16LE(16, 34); // bits per sample
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'ring.wav'), Buffer.concat([header, data]));
console.log('assets/ring.wav written');
