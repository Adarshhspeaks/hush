// Sticker definitions and category constants for Hush built-in sticker packs
export const BUILTIN_STICKERS = [
  // Reactions
  { id: 'react_mind_blown', name: 'Mind Blown', cat: 'reactions', keywords: ['shocked', 'mind blown', 'explosion', 'brain', 'wow', 'omg', 'insane'] },
  { id: 'react_fire', name: 'Fire', cat: 'reactions', keywords: ['fire', 'flame', 'lit', 'hype', 'hot', 'shades', 'cool'] },
  { id: 'react_party', name: 'Party', cat: 'reactions', keywords: ['party', 'celebrate', 'popper', 'confetti', 'yay', 'congrats'] },
  { id: 'react_facepalm', name: 'Facepalm', cat: 'reactions', keywords: ['facepalm', 'ugh', 'sigh', 'smh', 'disbelief', 'oops'] },
  { id: 'react_eyes', name: 'Shifty Eyes', cat: 'reactions', keywords: ['eyes', 'side eye', 'suspicious', 'looking', 'drama', 'tea'] },
  { id: 'react_skull', name: 'Skull', cat: 'reactions', keywords: ['skull', 'dead', 'dying', 'lmao', 'rip', 'skeleton'] },

  // Love
  { id: 'love_heart_sparkle', name: 'Sparkle Heart', cat: 'love', keywords: ['heart', 'love', 'sparkle', 'crush', 'pink', 'romance'] },
  { id: 'love_cat_hearts', name: 'Heart Eyes Cat', cat: 'love', keywords: ['cat', 'heart eyes', 'love', 'adorable', 'kitty', 'crush'] },
  { id: 'love_bear_hug', name: 'Bear Hug', cat: 'love', keywords: ['bear', 'hug', 'comfort', 'warm', 'love', 'care', 'sweet'] },
  { id: 'love_kiss_wink', name: 'Blowing Kiss', cat: 'love', keywords: ['kiss', 'wink', 'flirt', 'love', 'sweet', 'xoxo'] },
  { id: 'love_heart_lock', name: 'Heart Lock', cat: 'love', keywords: ['lock', 'secret', 'key', 'promise', 'heart', 'secure', 'hush'] },
  { id: 'love_blushing_star', name: 'Blushing Star', cat: 'love', keywords: ['star', 'blush', 'cute', 'sweet', 'shy', 'sparkle'] },

  // Funny
  { id: 'fun_vibing_cat', name: 'Vibing Cat', cat: 'funny', keywords: ['vibing', 'cat', 'music', 'headphones', 'jamming', 'bop', 'chill'] },
  { id: 'fun_blob_popcorn', name: 'Popcorn Drama', cat: 'funny', keywords: ['popcorn', 'blob', 'drama', 'watching', 'tea', 'movie', 'eating'] },
  { id: 'fun_doge_shades', name: 'Deal With It', cat: 'funny', keywords: ['dog', 'doge', 'shades', 'deal with it', 'pixel', 'cool', 'swag'] },
  { id: 'fun_tea_sip', name: 'Sipping Tea', cat: 'funny', keywords: ['tea', 'sip', 'kermit', 'frog', 'none of my business', 'drama'] },
  { id: 'fun_ghost_boo', name: 'Ghost Boo', cat: 'funny', keywords: ['ghost', 'boo', 'scary', 'cute', 'spooky', 'surprise'] },
  { id: 'fun_potato_king', name: 'Potato King', cat: 'funny', keywords: ['potato', 'couch potato', 'crown', 'king', 'lazy', 'cute'] },

  // Words
  { id: 'word_omg', name: 'OMG!', cat: 'words', keywords: ['omg', 'oh my god', 'wow', 'comic', 'shock', 'badge'] },
  { id: 'word_lol', name: 'LOL!', cat: 'words', keywords: ['lol', 'laugh', 'haha', 'lmao', 'funny', 'tears'] },
  { id: 'word_noice', name: 'NOICE!', cat: 'words', keywords: ['noice', 'nice', 'sweet', 'cool', 'approved', 'stamp'] },
  { id: 'word_hush', name: 'HUSH 🤫', cat: 'words', keywords: ['hush', 'shh', 'secret', 'quiet', 'private', 'lock'] },
  { id: 'word_rip', name: 'R.I.P.', cat: 'words', keywords: ['rip', 'dead', 'grave', 'tombstone', 'over', 'rest in peace'] },
  { id: 'word_yass', name: 'YAAAS!', cat: 'words', keywords: ['yass', 'yaaas', 'yes', 'slay', 'rainbow', 'hype', 'celebrate'] },
];

export const ALLOWED_STICKER_IDS = new Set(BUILTIN_STICKERS.map((s) => s.id));

export const STICKER_CATEGORIES = [
  { id: 'my', label: '⭐ My Stickers' },
  { id: 'reactions', label: '😮 Reactions' },
  { id: 'love', label: '❤️ Love' },
  { id: 'funny', label: '😂 Funny' },
  { id: 'words', label: '💬 Words' },
];
