const SOCKET_TYPES = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  MATCHED: 'matched-with-a-user',
  GAME_STARTED: 'game-started',
  GAME_FINISHED: 'game-finished',
  WAITING: 'waiting',
  WORD_SELECTED: 'word-selected',
  CANVAS_UPDATED: 'canvas-updated',
  GUESS: 'guessing-time',
};

module.exports = SOCKET_TYPES;
