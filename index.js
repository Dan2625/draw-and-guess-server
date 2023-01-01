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
    origin: 'https://draw-and-guess-client.netlify.app',
    methods: ['GET', 'POST'],
  },
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content, Accept, Content-Type, Authorization'
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, PATCH, OPTIONS'
  );
  next();
});

app.use(cors());

app.get('/', (request, response, next) => {
  response.json({ message: 'Hey! This is your server response to you' });
  next();
});

let users = new Map();
let guessUserIdsQueue = [];
let drawersUserIdsQueue = [];
// { id, drawerUser, guestUser, selectedWord, canvas }
let activeGames = new Map();
let oldGames = [];

const getMessage = (message) => {
  return {
    time: new Date(),
    ...message,
  };
};

const sendMessageToUser = (userId, messageType, message) => {
  socketIO.to(userId).emit(messageType, getMessage(message));
};

const createNewGame = (drawerUser, guessUser) => {
  //Creating new game session
  const gameId = Math.random().toString(36);
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

const sendMessageToUsersInGame = (gameId, messageType, message) => {
  const game = activeGames.get(gameId);
  if (!game) {
    console.log('game not found, messages not sent!');
    return;
  }
  const messageToDeliver = getMessage(message);
  socketIO.to(game.guessUser.id).emit(messageType, messageToDeliver);
  socketIO.to(game.drawerUser.id).emit(messageType, messageToDeliver);
};

const checkForMatch = () => {
  if (guessUserIdsQueue.length > 0 && drawersUserIdsQueue.length > 0) {
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
  } else {
    return null;
  }
};

const deleteUser = (user) => {
  if (user.type === 'drawer') {
    let index_to_delete = drawersUserIdsQueue.indexOf(user.id);
    if (index_to_delete > -1) {
      drawersUserIdsQueue.splice(index_to_delete, 1);
    }
  } else {
    let index_to_delete = guessUserIdsQueue.indexOf(user);
    if (index_to_delete > -1) {
      guessUserIdsQueue.splice(index_to_delete, 1);
    }
  }
  users.delete(user.userId);
};
const finishGameAndRemoveUsers = (userId) => {
  const user = users.get(userId);
  if (user) {
    if (user.gameId) {
      const activeGame = activeGames.get(user.gameId);
      users.delete(activeGame.guessUser.id);
      users.delete(activeGame.drawerUser.id);
      activeGames.delete(activeGame.id);
    } else {
      deleteUser(user);
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
  socket.data['socket_status'] = SOCKET_TYPES.CONNECTED;
  //printState('connection');
  socket.on('drawerUser', (data) => {
    const user = getUserFromData(data, socket.id, 'drawer');
    users.set(user.id, user);
    drawersUserIdsQueue.push(user.id);
    const newGame = checkForMatch(socket);
    if (!newGame) {
      socket.data['socket_status'] = SOCKET_TYPES.WAITING_FOR_PLAYER_TO_JOIN;
      socket.emit(SOCKET_TYPES.WAITING_FOR_PLAYER_TO_JOIN, new Date());
    } else {
      socket.data['socket_status'] = SOCKET_TYPES.MATCHED;
    }
    printState('drawerUser');
  });

  socket.on('guessUser', (data) => {
    if (socket['data']['socket_status'] === SOCKET_TYPES.CONNECTED) {
      const user = getUserFromData(data, socket.id, 'guess');
      users.set(user.id, user);
      guessUserIdsQueue.push(user.id);
      const newGame = checkForMatch(socket);
      if (!newGame) {
        socket.data['socket_status'] = SOCKET_TYPES.WAITING_FOR_PLAYER_TO_JOIN;
        socket.emit(SOCKET_TYPES.WAITING_FOR_PLAYER_TO_JOIN, new Date());
      } else {
        socket.data['socket_status'] = SOCKET_TYPES.MATCHED;
      }
      printState('guessUser');
    }
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
    socket.data['socket_status'] = SOCKET_TYPES.GAME_STARTED;
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
    socket.data['socket_status'] = SOCKET_TYPES.CANVAS_UPDATED;
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
      socket.data['socket_status'] = SOCKET_TYPES.GAME_FINISHED;
      sendMessageToUsersInGame(game.id, SOCKET_TYPES.GAME_FINISHED, {
        gameDuration,
        points,
      });
      finishGameAndRemoveUsers(socket.id);
    } else {
      console.log(SOCKET_TYPES.GUSSING_WORD, guessingWord, 'FAILED');
      socket.data['socket_status'] = SOCKET_TYPES.GUSSING_INCORRECT;
      sendMessageToUser(user.id, SOCKET_TYPES.GUSSING_INCORRECT, {});
    }
  });
});

http.listen(PORT, () => {
  console.log(`Listening on port: ${PORT}`);
});
