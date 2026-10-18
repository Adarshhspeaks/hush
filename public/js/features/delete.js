// Message deletion controller: action button rendering and socket dispatch
export function promptDelete(socket, id, getDelToken, adminToken) {
  if (!confirm('Delete this message for everyone?')) return;
  const token = getDelToken(id);
  socket.emit('msg:delete', { id, delToken: token, adminToken }, (res) => {
    if (res?.error) alert(res.error);
  });
}

export function createDeleteButton(socket, id, getDelToken, adminToken) {
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'act-btn danger';
  delBtn.title = 'Delete for everyone';
  delBtn.setAttribute('aria-label', 'Delete for everyone');
  delBtn.textContent = '🗑';
  delBtn.onclick = (e) => {
    e.stopPropagation();
    promptDelete(socket, id, getDelToken, adminToken);
  };
  return delBtn;
}

export function enableDelete(id, refs, socket, getDelToken, adminToken) {
  const r = refs.get(id);
  if (r?.actions && !r.actions.querySelector('.act-btn.danger')) {
    r.actions.append(createDeleteButton(socket, id, getDelToken, adminToken));
  }
}
