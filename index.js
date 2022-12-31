const express = require('express');
const app = express();
let PORT = process.env.PORT || 4001;
const http = require('http').Server(app);
const cors = require('cors');
const SOCKET_TYPES = require('./utils/types');
const { getUserFromData } = require('./utils/users');
const socketIO = require('socket.io')(http, {
  cors: {
    origin: 'http://localhost:3000',
  },
});

app.use(cors());

app.get('/', (request, response, next) => {
  response.json({ message: 'Hey! This is your server response!' });
  next();
});

let users = new Map();
let guessUserIdsQueue = [];
let drawersUserIdsQueue = [];
// { id, drawerUser, guestUser, selectedWord, canvas }
let activeGames = new Map();

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
      canvas: '',
      startedTime: new Date(),
    };
    activeGames.set(gameId, newGame);
    //update new game id in each user
    users.set(guessUser.id, { ...guessUser, gameId });
    users.set(drawerUser.id, { ...drawerUser, gameId });
    const matchedMessage = {
      gameId,
      guessUserName: guessUser.userName,
      drawerUserName: drawerUser.userName,
      startedTime: newGame.startedTime,
    };
    //sending a matched message to both users
    socketIO.to(guessUser.id).emit(SOCKET_TYPES.MATCHED, matchedMessage);
    socketIO.to(drawerUser.id).emit(SOCKET_TYPES.MATCHED, matchedMessage);
    return newGame;
  }
  return false;
};

const finishGame = (activeGame) => {
  if (!activeGame) return;
  //send user to both message the game finished.
  // remove users
  users.delete(activeGame.guessUser.id);
  users.delete(activeGame.drawerUser.id);
  //remove game
  activeGames.delete(activeGame.id);
};
const onUserDisconnected = (userId) => {
  const user = users.get(userId);
  if (user) {
    if (user.gameId) {
      const activeGame = activeGames.get(user.gameId);
      finishGame(activeGame);
    } else {
      if (user.type === 'guess') {
        guessUserIdsQueue = guessUserIdsQueue.filter(
          (guessUserId) => guessUserId !== userId
        );
      }
      if (user.type === 'drawer') {
        drawersUserIdsQueue = drawersUserIdsQueue.filter(
          (drawerUserId) => drawerUserId !== userId
        );
      }
      users.delete(userId);
    }
  }
};
const printState = (functionName) => {
  console.log(functionName, {
    users,
    guessUserIdsQueue,
    drawersUserIdsQueue,
  });
};

socketIO.on('connection', (socket) => {
  console.log(`${socket.id} user connected`);
  printState('connection');
  socket.on('drawerUser', (data) => {
    const user = getUserFromData(data, socket.id, 'drawer');
    users.set(user.id, user);
    drawersUserIdsQueue.push(user.id);
    const newGame = checkForMatch(socket);
    if (!newGame) {
      socket.emit(SOCKET_TYPES.WAITING, new Date());
    }
    printState('draweUser');
  });

  socket.on('guessUser', (data) => {
    const user = getUserFromData(data, socket.id, 'guess');
    users.set(user.id, user);
    guessUserIdsQueue.push(user.id);
    const newGame = checkForMatch(socket);
    if (!newGame) {
      socket.emit(SOCKET_TYPES.WAITING, new Date());
    }
    printState('guessUser');
  });

  socket.on('disconnect', (data) => {
    const user = users.get(socket.id);
    if (user) onUserDisconnected(user.id);
    printState('disconnect');
  });

  socket.on(SOCKET_TYPES.WORD_SELECTED, (data) => {
    const selectedWord = data.selectedWord;
    console.log({ selectedWord });
    const drawerUser = users.get(socket.id);
    const game = activeGames.get(drawerUser.gameId);
    activeGames.set(game.id, { ...game, selectedWord });
    socketIO.to(game.guessUser.id).emit(SOCKET_TYPES.GAME_STARTED, new Date());
    socketIO.to(drawerUser.id).emit(SOCKET_TYPES.GAME_STARTED, new Date());

    printState('word selected');
    // send the guess the word is choosed and display in FE the canvas.
  });
  socket.on(SOCKET_TYPES.CANVAS_UPDATED, (data) => {
    //update canvas in game
    const canvas = data.canvas;
    const user = users.get(socket.id);
    const game = activeGames.get(user.gameId);
    activeGames.set(game.id, { ...game, canvas: canvas });
    //send updated canvas to guess user
    const guessUser = game.guessUser;
    socketIO.to(guessUser.id).emit(SOCKET_TYPES.CANVAS_UPDATED, data);
    printState('updated canvas');
  });
});

http.listen(PORT, () => {
  console.log(`Listening on port: ${PORT}`);
});
