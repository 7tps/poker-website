const socket = io();
socket.on('updateGameState', (data) => {
  console.log('Game updated:', data);
});