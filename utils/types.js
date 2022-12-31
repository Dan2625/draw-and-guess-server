const SOCKET_TYPES = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  MATCHED: 'matched-with-a-user',
  GAME_STARTED: 'game-started',
  GAME_FINISHED: 'game-finished',
  GAME_STOPPED: 'game-stopped',
  WAITING_FOR_PLAYER_TO_JOIN: 'waiting-for-player-to-join',
  WORD_SELECTED: 'word-selected',
  CANVAS_UPDATED: 'canvas-updated',
  GUSSING_WORD: 'guessing-word',
  GUSSING_INCORRECT: 'guessing-incorrect',
};

module.exports = SOCKET_TYPES;
