// sockets/poker.js

const { PokerGame } = require('../utils/pokerUtils');

let game = null;
let socketIdToPlayerIndex = {};
let disconnectTimeouts = {};
let showChoices = {};
let lastShowdownInfo = null;
let lastAggressorIndex = null;
let showdownTimeout = null; // Timeout for auto-reset after showdown

function allPlayersActed(game) {
  // Simple check: all active players have matched currentBet or folded
  return game.players.every(p => p.folded || p.currentBet === game.currentBet);
}

module.exports = (io, socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('joinGame', (username) => {
    if (!game) {
      game = new PokerGame([]);
      socketIdToPlayerIndex = {};
    }

    // Enforce a maximum of 12 players
    if (game.players.length >= 12 && game.players.findIndex(p => p.name === username) === -1) {
      socket.emit('errorMessage', 'The game is full (maximum 12 players).');
      return;
    }

    // If reconnecting, clear disconnect timeout
    if (disconnectTimeouts[username]) {
      clearTimeout(disconnectTimeouts[username]);
      delete disconnectTimeouts[username];
    }

    // Check if this username is already in the game
    let playerIndex = game.players.findIndex(p => p.name === username);
    if (playerIndex !== -1) {
      // Username exists, update socket mapping to this player
      socketIdToPlayerIndex[socket.id] = playerIndex;
    } else {
      // Avoid duplicate joins by socket
      if (socketIdToPlayerIndex[socket.id] !== undefined) return;
      // Add new player
      game.players.push({
        name: username,
        chips: 1000,
        holeCards: [],
        currentBet: 0,
        totalBet: 0,
        folded: false,
        isSmallBlind: false,
        isBigBlind: false,
        ready: false,
      });
      playerIndex = game.players.length - 1;
      socketIdToPlayerIndex[socket.id] = playerIndex;
    }

    console.log(`Player joined: ${username}`);

    io.emit('gameState', {
      players: game.players.map(p => {
        const holeCards = (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit }));
        console.log(`[SOCKET] Sending hole cards for ${p.name}:`, holeCards);
        
        // Validate each card before sending
        holeCards.forEach((card, index) => {
          if (!card || !card.rank || !card.suit) {
            console.error(`[SOCKET] ERROR: Invalid card at index ${index} for ${p.name}:`, card);
          }
        });
        
        // Evaluate current hand for this player
        const currentHand = game.evaluatePlayerHand(p.name);
        
        return {
          name: p.name,
          chips: p.chips,
          currentBet: p.currentBet,
          totalBet: p.totalBet,
          folded: p.folded,
          isSmallBlind: p.isSmallBlind,
          isBigBlind: p.isBigBlind,
          holeCards: holeCards,
          currentHand: currentHand
        };
      }),
      communityCards: game.communityCards.map(c => ({ rank: c.rank, suit: c.suit })),
      pot: game.pot,
      currentBet: game.currentBet,
      currentPlayer: game.players[game.currentPlayerIndex]?.name,
      round: game.round,
      dealer: game.getDealerName(),
    });
  });

  socket.on('playerAction', (action) => {
    const start = Date.now();
    try {
      const playerIndex = socketIdToPlayerIndex[socket.id];
      if (playerIndex === undefined) {
        socket.emit('errorMessage', 'You are not part of the game');
        return;
      }

      if (game.currentPlayerIndex !== playerIndex) {
        socket.emit('errorMessage', 'Not your turn');
        return;
      }

      const player = game.players[playerIndex];
      if (player.folded) {
        socket.emit('errorMessage', 'You have folded');
        return;
      }

      if (action.type === 'fold') {
        game.playerFold(playerIndex);
        // Check if only one player remains unfolded
        const activePlayers = game.players.filter(p => !p.folded);
        if (activePlayers.length === 1) {
          // Award pot to the last remaining player
          activePlayers[0].chips += game.pot;
          const showdownPlayers = game.players.map(p => ({
            name: p.name,
            holeCards: (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit })),
            hand: p.hand ? p.hand.name : null,
            folded: p.folded
          }));
          const showdownInfo = {
            winners: [{
              name: activePlayers[0].name,
              chips: activePlayers[0].chips,
              hand: null,
            }],
            showdownPlayers,
            lastAggressor: lastAggressorIndex !== null ? game.players[lastAggressorIndex]?.name : null
          };
          io.emit('showdown', showdownInfo);
          lastShowdownInfo = showdownInfo;

          // Set timeout to auto-reset after 30 seconds if players don't show/muck
          if (showdownTimeout) clearTimeout(showdownTimeout);
          showdownTimeout = setTimeout(() => {
            console.log('Auto-resetting game state after showdown timeout');
            resetGameState();
          }, 30000); // 30 seconds

          // Do NOT reset game/player state here. Wait until all players are ready.
          return;
        }
      } else if (action.type === 'bet') {
        const betAmount = action.amount;
        if (betAmount < game.currentBet) {
          socket.emit('errorMessage', `Bet must be at least current bet: ${game.currentBet}`);
          return;
        }
        if (betAmount > player.chips + player.currentBet) {
          socket.emit('errorMessage', 'Not enough chips');
          return;
        }
        game.playerBet(playerIndex, betAmount - player.currentBet); // bet difference
        lastAggressorIndex = playerIndex;
      } else {
        socket.emit('errorMessage', 'Unknown action');
        return;
      }

      // Advance turn to next active player
      game.nextPlayer();

      // Check if betting round is complete
      if (game.allActivePlayersActed() && game.players.filter(p => !p.folded).every(p => p.currentBet === game.currentBet)) {
        // Reset bets for next round
        game.players.forEach(p => p.currentBet = 0);
        game.currentBet = 0;

        if (game.round === 'pre-flop') {
          game.dealFlop();
          lastAggressorIndex = null;
        } else if (game.round === 'flop') {
          game.dealTurn();
          lastAggressorIndex = null;
        } else if (game.round === 'turn') {
          game.dealRiver();
          lastAggressorIndex = null;
        } else if (game.round === 'river') {
          // Showdown
          const winners = game.showdown();
          // Prepare showdown info for all players
          const showdownPlayers = game.players.map(p => {
            const holeCards = (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit }));
            console.log(`[SOCKET] Showdown hole cards for ${p.name}:`, holeCards);
            
            // Validate showdown cards
            holeCards.forEach((card, index) => {
              if (!card || !card.rank || !card.suit) {
                console.error(`[SOCKET] ERROR: Invalid showdown card at index ${index} for ${p.name}:`, card);
              }
            });
            
            return {
              name: p.name,
              holeCards: holeCards,
              hand: p.hand ? p.hand.name : null,
              folded: p.folded
            };
          });
          const showdownInfo = {
            winners: winners.map(w => ({
              name: w.name,
              chips: w.chips,
              hand: w.hand.name,
            })),
            showdownPlayers,
            lastAggressor: lastAggressorIndex !== null ? game.players[lastAggressorIndex]?.name : null
          };
          io.emit('showdown', showdownInfo);
          lastShowdownInfo = showdownInfo;

          // Set timeout to auto-reset after 30 seconds if players don't show/muck
          if (showdownTimeout) clearTimeout(showdownTimeout);
          showdownTimeout = setTimeout(() => {
            console.log('Auto-resetting game state after showdown timeout');
            resetGameState();
          }, 30000); // 30 seconds

          // Do NOT reset game/player state here. Wait until all players are ready.
          return;
        }
      }

      // Broadcast updated game state
      io.emit('gameState', {
        players: game.players.map(p => {
          const holeCards = (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit }));
          console.log(`[SOCKET] Sending hole cards for ${p.name}:`, holeCards);
          
          // Validate each card before sending
          holeCards.forEach((card, index) => {
            if (!card || !card.rank || !card.suit) {
              console.error(`[SOCKET] ERROR: Invalid card at index ${index} for ${p.name}:`, card);
            }
          });
          
          // Evaluate current hand for this player
          const currentHand = game.evaluatePlayerHand(p.name);
          
          return {
            name: p.name,
            chips: p.chips,
            currentBet: p.currentBet,
            totalBet: p.totalBet,
            folded: p.folded,
            isSmallBlind: p.isSmallBlind,
            isBigBlind: p.isBigBlind,
            holeCards: holeCards,
            currentHand: currentHand
          };
        }),
        communityCards: game.communityCards.map(c => ({ rank: c.rank, suit: c.suit })),
        pot: game.pot,
        currentBet: game.currentBet,
        currentPlayer: game.players[game.currentPlayerIndex]?.name,
        round: game.round,
        dealer: game.getDealerName(),
      });
      const end = Date.now();
      console.log(`[TIMING] playerAction '${action.type}' processed in ${end - start}ms`);
    } catch (err) {
      console.error(err);
      socket.emit('errorMessage', err.message);
    }
  });

  // Add new event for starting the round
  socket.on('startRound', () => {
    if (game && game.players.length >= 2 && game.round === 'pre-flop') {
      // Only start if all players are ready
      if (game.players.every(p => p.ready)) {
        // Reset game for next hand: keep players, reset ready, holeCards, bets, folded, blinds
        game.players.forEach(p => {
          p.ready = false;
          p.holeCards = [];
          p.currentBet = 0;
          p.totalBet = 0;
          p.folded = false;
          p.isSmallBlind = false;
          p.isBigBlind = false;
          p.hand = undefined;
        });
        game.communityCards = [];
        game.pot = 0;
        game.currentBet = 0;
        game.round = 'pre-flop';
        // Dealer index is already rotated in showdown()
        showChoices = {};
        lastAggressorIndex = null;
        // Now deal new hole cards and emit game state
        game.dealHoleCards();
        io.emit('gameState', {
          players: game.players.map(p => ({
            name: p.name,
            chips: p.chips,
            currentBet: p.currentBet,
            totalBet: p.totalBet,
            folded: p.folded,
            isSmallBlind: p.isSmallBlind,
            isBigBlind: p.isBigBlind,
            ready: p.ready,
            holeCards: (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit })),
          })),
          communityCards: game.communityCards,
          pot: game.pot,
          currentBet: game.currentBet,
          currentPlayer: game.players[game.currentPlayerIndex]?.name,
          round: game.round,
          dealer: game.getDealerName(),
        });
      }
    }
  });

  // Add event for player ready up
  socket.on('playerReady', () => {
    const playerIndex = socketIdToPlayerIndex[socket.id];
    if (playerIndex !== undefined && game) {
      game.players[playerIndex].ready = true;
      io.emit('gameState', {
        players: game.players.map(p => ({
          name: p.name,
          chips: p.chips,
          currentBet: p.currentBet,
          totalBet: p.totalBet,
          folded: p.folded,
          isSmallBlind: p.isSmallBlind,
          isBigBlind: p.isBigBlind,
          ready: p.ready,
          holeCards: (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit })),
        })),
        communityCards: game.communityCards,
        pot: game.pot,
        currentBet: game.currentBet,
        currentPlayer: game.players[game.currentPlayerIndex]?.name,
        round: game.round,
        dealer: game.getDealerName(),
      });
    }
  });

  // Show/Muck events after showdown
  socket.on('showHand', () => {
    console.log('showHand event received, lastShowdownInfo:', !!lastShowdownInfo);
    if (lastShowdownInfo) {
      const playerIndex = socketIdToPlayerIndex[socket.id];
      if (playerIndex === undefined || !lastShowdownInfo.showdownPlayers || !lastShowdownInfo.showdownPlayers[playerIndex]) {
        console.log('Invalid player index or showdown data');
        return;
      }
      const username = lastShowdownInfo.showdownPlayers[playerIndex].name;
      console.log(`${username} chose to show hand`);
      showChoices[username] = 'show';
      io.emit('showChoicesUpdate', showChoices);
      
      // Check if all non-winners have shown or mucked
      checkAndResetGameState();
    }
  });
  socket.on('muckHand', () => {
    console.log('muckHand event received, lastShowdownInfo:', !!lastShowdownInfo);
    if (lastShowdownInfo) {
      const playerIndex = socketIdToPlayerIndex[socket.id];
      if (playerIndex === undefined || !lastShowdownInfo.showdownPlayers || !lastShowdownInfo.showdownPlayers[playerIndex]) {
        console.log('Invalid player index or showdown data');
        return;
      }
      const username = lastShowdownInfo.showdownPlayers[playerIndex].name;
      console.log(`${username} chose to muck hand`);
      showChoices[username] = 'muck';
      io.emit('showChoicesUpdate', showChoices);
      
      // Check if all non-winners have shown or mucked
      checkAndResetGameState();
    }
  });

  // Helper function to check if all players have shown/mucked and reset game state
  function checkAndResetGameState() {
    if (!lastShowdownInfo) return;
    
    const nonWinners = lastShowdownInfo.showdownPlayers.filter(p => 
      !lastShowdownInfo.winners.some(w => w.name === p.name) && !p.folded
    );
    
    // If there are no non-winners (everyone is a winner or folded), start review phase
    if (nonWinners.length === 0) {
      startReviewPhase();
      return;
    }
    
    const allNonWinnersActed = nonWinners.every(p => 
      showChoices[p.name] === 'show' || showChoices[p.name] === 'muck'
    );
    
    if (allNonWinnersActed) {
      startReviewPhase();
    }
  }
  
  // Helper function to start review phase
  function startReviewPhase() {
    // Clear showdown timeout
    if (showdownTimeout) {
      clearTimeout(showdownTimeout);
      showdownTimeout = null;
    }
    
    // Emit review phase start
    io.emit('showdownReviewPhase', { duration: 15 }); // 15 second review phase
    
    // Set timeout for auto-reset after review phase
    showdownTimeout = setTimeout(() => {
      console.log('Auto-resetting game state after review phase timeout');
      resetGameState();
    }, 15000); // 15 seconds
  }
  
  // Helper function to reset game state
  function resetGameState() {
    if (game) {
      // Clear showdown timeout
      if (showdownTimeout) {
        clearTimeout(showdownTimeout);
        showdownTimeout = null;
      }
      
      // Reset all players for next hand
      game.players.forEach(p => {
        p.ready = false;
        p.holeCards = [];
        p.currentBet = 0;
        p.totalBet = 0;
        p.folded = false;
        p.isSmallBlind = false;
        p.isBigBlind = false;
        p.hand = undefined;
      });
      game.communityCards = [];
      game.pot = 0;
      game.currentBet = 0;
      game.round = 'pre-flop';
      game.currentPlayerIndex = 0; // Reset to first player
      
      // Clear showdown state
      lastShowdownInfo = null;
      showChoices = {};
      lastAggressorIndex = null;
      
      // Emit reset game state
      io.emit('gameState', {
        players: game.players.map(p => ({
          name: p.name,
          chips: p.chips,
          currentBet: p.currentBet,
          totalBet: p.totalBet,
          folded: p.folded,
          isSmallBlind: p.isSmallBlind,
          isBigBlind: p.isBigBlind,
          ready: p.ready,
          holeCards: (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit })),
        })),
        communityCards: game.communityCards,
        pot: game.pot,
        currentBet: game.currentBet,
        currentPlayer: game.players[game.currentPlayerIndex]?.name,
        round: game.round,
        dealer: game.getDealerName(),
      });
    }
  }

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    // Remove player after timeout if they don't reconnect
    const playerIndex = socketIdToPlayerIndex[socket.id];
    if (playerIndex === undefined || !game || !game.players[playerIndex]) {
      return; // Player already removed or invalid mapping
    }
    const username = game.players[playerIndex].name;
    // Notify all clients of disconnect and start timer
    io.emit('playerDisconnectNotice', { username, timeout: 60 });
    disconnectTimeouts[username] = setTimeout(() => {
      // Remove player from game
      if (game) {
        game.players = game.players.filter(p => p.name !== username);
        // Remove all socket mappings for this player
        for (const [sid, idx] of Object.entries(socketIdToPlayerIndex)) {
          if (idx === playerIndex) delete socketIdToPlayerIndex[sid];
        }
        // Broadcast updated game state
        if (game.players.length > 0) {
          io.emit('gameState', {
            players: game.players.map(p => ({
              name: p.name,
              chips: p.chips,
              currentBet: p.currentBet,
              totalBet: p.totalBet,
              folded: p.folded,
              isSmallBlind: p.isSmallBlind,
              isBigBlind: p.isBigBlind,
              ready: p.ready,
              holeCards: (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit })),
            })),
            communityCards: game.communityCards,
            pot: game.pot,
            currentBet: game.currentBet,
            currentPlayer: game.players[game.currentPlayerIndex]?.name,
            round: game.round,
            dealer: game.getDealerName(),
          });
        }
        // Notify all clients of removal
        io.emit('playerRemoveNotice', { username });
      }
      delete disconnectTimeouts[username];
    }, 60000); // 60 seconds
  });
};
