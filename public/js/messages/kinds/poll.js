// Poll message kind handler: renders interactive encrypted poll cards with live percentage tallies
import { registerKind } from '../registry.js';
import { getPollState, castVote } from '../../features/polls.js';

export const pollKind = {
  snippet: (data) => `📊 Poll: ${data.q || 'Anonymous poll'}`,
  render: (body, { msg, data, key, myUid, getMyName, socket, stick, toBottom }) => {
    const pollId = String(data.pollId || msg.id);
    const question = String(data.q || 'Poll');
    const options = Array.isArray(data.opts) ? data.opts : [];

    const state = getPollState(pollId);
    state.q = question;
    state.opts = options;

    const card = document.createElement('div');
    card.className = 'poll-card';

    // Header
    const head = document.createElement('div');
    head.className = 'poll-head';

    const qEl = document.createElement('div');
    qEl.className = 'poll-question';
    qEl.textContent = question;

    const badge = document.createElement('span');
    badge.className = 'poll-badge';
    badge.textContent = '📊 Poll';

    head.append(qEl, badge);

    // Options container
    const optsContainer = document.createElement('div');
    optsContainer.className = 'poll-options';

    // Footer
    const footer = document.createElement('div');
    footer.className = 'poll-footer';

    const countSpan = document.createElement('span');
    const hintSpan = document.createElement('span');
    hintSpan.textContent = '🔒 Anonymous & encrypted';
    footer.append(countSpan, hintSpan);

    card.append(head, optsContainer, footer);
    body.append(card);

    function updateView() {
      optsContainer.innerHTML = '';
      const totalVotes = state.votes.size;
      countSpan.textContent = `${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}`;

      // Calculate counts per option
      const tallies = new Array(options.length).fill(0);
      for (const [, chosenIdx] of state.votes) {
        if (chosenIdx >= 0 && chosenIdx < options.length) {
          tallies[chosenIdx]++;
        }
      }

      const myVote = state.votes.get(String(myUid));

      options.forEach((optText, idx) => {
        const count = tallies[idx] || 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isSelected = myVote === idx;

        const optBtn = document.createElement('div');
        optBtn.className = `poll-opt${isSelected ? ' voted' : ''}`;
        optBtn.setAttribute('role', 'button');
        optBtn.setAttribute('tabindex', '0');

        const bar = document.createElement('div');
        bar.className = 'poll-opt-bar';
        bar.style.width = `${pct}%`;

        const label = document.createElement('span');
        label.className = 'poll-opt-label';
        label.textContent = isSelected ? `✓ ${optText}` : optText;

        const pctSpan = document.createElement('span');
        pctSpan.className = 'poll-opt-pct';
        pctSpan.textContent = `${pct}% (${count})`;

        optBtn.append(bar, label, pctSpan);

        optBtn.onclick = () => {
          castVote({ socket, key, myUid, getMyName, pollId, optIdx: idx });
        };

        optsContainer.appendChild(optBtn);
      });
    }

    state.views.add(updateView);
    updateView();

    if (stick) toBottom();
  },
};

registerKind('poll', pollKind);
