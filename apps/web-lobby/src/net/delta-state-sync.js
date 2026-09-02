export function applyDoudizhuStateMessage(previousState, message) {
  if (!message || typeof message !== 'object') return previousState || null;
  if (message.type === 'state' || message.type === 'state_snapshot') {
    return message.state || previousState || null;
  }
  if (message.type !== 'state_delta') return previousState || null;
  const next = {
    ...(previousState || {}),
    ...(message.patch || {}),
  };
  if (Array.isArray(message.patch?.recentEvents)) {
    next.recentEvents = [
      ...((previousState?.recentEvents || []).slice()),
      ...message.patch.recentEvents,
    ].slice(-12);
  }
  return next;
}

export function isDoudizhuStateMessage(message) {
  return message?.type === 'state'
    || message?.type === 'state_snapshot'
    || message?.type === 'state_delta';
}
