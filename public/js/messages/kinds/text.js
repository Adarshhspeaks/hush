// Text message kind handler
import { registerKind } from '../registry.js';

export const textKind = {
  snippet: (data) => data.x || '',
  render: (body, { data }) => {
    const textNode = document.createElement('div');
    textNode.textContent = (data.x || '').slice(0, 1000);
    body.append(textNode);
  },
};

registerKind('text', textKind);
