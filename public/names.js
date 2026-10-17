const ADJ = ['Sleepy', 'Neon', 'Sneaky', 'Cosmic', 'Grumpy', 'Fuzzy', 'Spicy', 'Turbo', 'Mellow', 'Wobbly', 'Lucky', 'Salty', 'Zesty', 'Shy', 'Jolly', 'Cranky'];
const ANI = ['Panda', 'Fox', 'Otter', 'Yak', 'Gecko', 'Llama', 'Moth', 'Walrus', 'Koala', 'Newt', 'Owl', 'Crab', 'Bat', 'Lynx', 'Emu', 'Toad'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const randomName = () => `${pick(ADJ)} ${pick(ANI)}`;

// stable color and hue from a user id string
export function hueFor(uid) {
  let h = 0;
  for (const ch of String(uid || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function colorFor(uid) {
  return `hsl(${hueFor(uid)} 85% 78%)`;
}
