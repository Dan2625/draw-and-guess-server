const checkForMatch = () => {
  if (guessUserIdsQueue.length && drawersUserIdsQueue.length) {
    //Getting the game users
    const guessUser = users.get(guessUserIdsQueue.shift());
    const drawerUser = users.get(drawersUserIdsQueue.shift());
    //Creating new game session
    const gameId = Math.random().toString(36).substr(2, 9);
    const newGame = {
      id: gameId,
      guessUser,
      drawerUser,
      selectedWord: '',
      paint: '',
      startedTime: new Date(),
    };
    activeGames.set(gameId, newGame);
    //update new game id in each user
    users.set(guessUser.id, { ...guessUser, gameId });
    users.set(drawerUser.id, { ...drawerUser, gameId });
    //sending a matched message to both users
    socketIO.to(guessUser.id).emit(SOCKET_TYPES.MATCHED, newGame);
    socketIO.to(drawerUser.id).emit(SOCKET_TYPES.MATCHED, newGame);
    return newGame;
  }
  return false;
};

module.exports = { checkForMatch };
