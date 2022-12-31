const express = require('express');
const app = express();
let PORT = process.env.PORT || 4001;
const http = require('http').Server(app);
const cors = require('cors');
const SOCKET_TYPES = require('./utils/types');
const { getUserFromData } = require('./utils/users');
const { POINTS } = require('./utils/game');
const socketIO = require('socket.io')(http, {
  cors: {
    origin: 'https://main--draw-and-guess-client.netlify.app/',
  },
});

app.use(cors());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/', (request, response, next) => {
  response.json({ message: 'Hey! This is your server response!' });
  next();
});

let users = new Map();
let guessUserIdsQueue = [];
let drawersUserIdsQueue = [];
// { id, drawerUser, guestUser, selectedWord, canvas }
let activeGames = new Map();
let oldGames = [];

const getMessasge = (message) => {
  return {
    time: new Date(),
    ...message,
  };
};

const sendMessageToUser = (userId, messageType, message) => {
  socketIO.to(userId).emit(messageType, getMessasge(message));
};
const sendMessageToUsersInGame = (gameId, messageType, message) => {
  const game = activeGames.get(gameId);
  if (!game) {
    console.log('game not found, messages not sent!');
    return;
  }
  const messageToDeliver = getMessasge(message);
  socketIO.to(game.guessUser.id).emit(messageType, messageToDeliver);
  socketIO.to(game.drawerUser.id).emit(messageType, messageToDeliver);
};

const createNewGame = (drawerUser, guessUser) => {
  //Creating new game session
  const gameId = Math.random().toString(36).substr(2, 9);
  const newGame = {
    id: gameId,
    guessUser,
    drawerUser,
    selectedWord: '',
    difficullty: '',
    canvas: '',
    startedTime: new Date(),
  };
  activeGames.set(gameId, newGame);
  //update new game id in each user
  users.set(guessUser.id, { ...guessUser, gameId });
  users.set(drawerUser.id, { ...drawerUser, gameId });
  return newGame;
};

const checkForMatch = () => {
  if (guessUserIdsQueue.length && drawersUserIdsQueue.length) {
    //Getting the game users
    const guessUser = users.get(guessUserIdsQueue.shift());
    const drawerUser = users.get(drawersUserIdsQueue.shift());
    const newGame = createNewGame(drawerUser, guessUser);
    const matchedMessage = {
      gameId: newGame.id,
      guessUserName: guessUser.userName,
      drawerUserName: drawerUser.userName,
      startedTime: newGame.startedTime,
    };
    //sending a matched message to both users
    sendMessageToUsersInGame(newGame.id, SOCKET_TYPES.MATCHED, matchedMessage);
    return newGame;
  }
  return false;
};

// const finishGame = (activeGame) => {
//   if (!activeGame) return;
//   //send user to both message the game finished.
//   // remove users
//   // users.delete(activeGame.guessUser.id);
//   // users.delete(activeGame.drawerUser.id);
//   //remove game
//   activeGames.delete(activeGame.id);
// };
const finishGameAndRemoveUsers = (userId) => {
  const user = users.get(userId);
  if (user) {
    if (user.gameId) {
      const activeGame = activeGames.get(user.gameId);
      users.delete(activeGame.guessUser.id);
      users.delete(activeGame.drawerUser.id);
      activeGames.delete(activeGame.id);
    } else {
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
      socket.emit(SOCKET_TYPES.WAITING_FOR_PLAYER_TO_JOIN, new Date());
    }
    printState('draweUser');
  });

  socket.on('guessUser', (data) => {
    const user = getUserFromData(data, socket.id, 'guess');
    users.set(user.id, user);
    guessUserIdsQueue.push(user.id);
    const newGame = checkForMatch(socket);
    if (!newGame) {
      socket.emit(SOCKET_TYPES.WAITING_FOR_PLAYER_TO_JOIN, new Date());
    }
    printState('guessUser');
  });

  socket.on('disconnect', (data) => {
    const user = users.get(socket.id);
    if (user) finishGameAndRemoveUsers(user.id);
    printState('disconnect');
  });

  socket.on(SOCKET_TYPES.WORD_SELECTED, (data) => {
    const selectedWord = data.selectedWord;
    const difficullty = data.difficullty;
    const drawerUser = users.get(socket.id);
    console.log(SOCKET_TYPES.WORD_SELECTED, data);
    if (!drawerUser?.gameId) return;
    const game = activeGames.get(drawerUser.gameId);
    activeGames.set(game.id, { ...game, selectedWord, difficullty });
    sendMessageToUsersInGame(game.id, SOCKET_TYPES.GAME_STARTED, {});
  });

  socket.on(SOCKET_TYPES.CANVAS_UPDATED, (data) => {
    //update canvas in game
    const canvas = data.canvas;
    const user = users.get(socket.id);
    if (!user) {
      console.log('user is not found');
    }
    const game = activeGames.get(user?.gameId);
    if (!game) {
      console.log('game is not found');
    }
    activeGames.set(game.id, { ...game, canvas: canvas });
    //send updated canvas to guess user
    sendMessageToUser(game.guessUser.id, SOCKET_TYPES.CANVAS_UPDATED, {
      canvas,
    });
  });

  socket.on(SOCKET_TYPES.GUSSING_WORD, (data) => {
    //update canvas in game
    const guessingWord = data.guessingWord;
    const user = users.get(socket.id);
    if (!user) {
      console.log('user is not found');
    }
    const game = activeGames.get(user.gameId);
    if (!game) {
      console.log('no game found');
      return;
    }
    if (guessingWord === game.selectedWord) {
      const gameDuration = (new Date() - game.startedTime) / 1000;
      const points = ((POINTS[game.difficullty] || 1) * 1000) / gameDuration;
      oldGames.push({ ...game, gameDuration, points });
      sendMessageToUsersInGame(game.id, SOCKET_TYPES.GAME_FINISHED, {
        gameDuration,
        points,
      });
      finishGameAndRemoveUsers(socket.id);
    } else {
      console.log(SOCKET_TYPES.GUSSING_WORD, guessingWord, 'FAILED');
      sendMessageToUser(user.id, SOCKET_TYPES.GUSSING_INCORRECT, {});
    }
  });
});

http.listen(PORT, () => {
  console.log(`Listening on port: ${PORT}`);
});
