// sockets/poker.js

const { PokerGame } = require('../utils/pokerUtils');
const { getUserChips, setUserChips } = require('../models/userModel');

let game = null;
let socketIdToPlayerIndex = {};
let disconnectTimeouts = {};
let showChoices = {};
let lastShowdownInfo = null;
let lastAggressorIndex = null;
let showdownTimeout = null; // Timeout for auto-reset after showdown
let actionLog = [];

function allPlayersActed(game) {
  // Simple check: all active players have matched currentBet or folded
  return game.players.every(p => p.folded || p.currentBet === game.currentBet);
}

module.exports = (io, socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('joinGame', async (username) => {
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
      // Emit remove notice to clear disconnect notification on frontend for all players
      io.emit('playerRemoveNotice', { username });
      // Re-emit gameState to ensure all players see the correct cards
      io.emit('gameState', {
        players: game.players.map(p => {
          const holeCards = (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit }));
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
        actionLog,
      });
    }

    // Check if this username is already in the game
    let playerIndex = game.players.findIndex(p => p.name === username);
    if (playerIndex !== -1) {
      // Username exists, update socket mapping to this player
      socketIdToPlayerIndex[socket.id] = playerIndex;
    } else {
      // Avoid duplicate joins by socket
      if (socketIdToPlayerIndex[socket.id] !== undefined) return;
      // Load chips from DB
      let chips = 1000;
      try {
        const dbChips = await getUserChips(username);
        if (typeof dbChips === 'number') chips = dbChips;
      } catch (e) {
        console.error('Error loading chips from DB for', username, e);
      }
      // Add new player
      game.players.push({
        name: username,
        chips,
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

    // On new game, reset action log
    if (game.players.length === 0) actionLog = [];
    actionLog.push(`${username} joined the game.`);

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
      actionLog,
    });
  });

  socket.on('playerAction', async (action) => {
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
        actionLog.push(`${player.name} folded.`);
        // Check if only one player remains unfolded
        const activePlayers = game.players.filter(p => !p.folded);
        if (activePlayers.length === 1) {
          // Award pot to the last remaining player
          activePlayers[0].chips += game.pot;
          actionLog.push(`${activePlayers[0].name} wins the pot of ${game.pot} chips!`);
          // Persist chips to DB
          try { await setUserChips(activePlayers[0].name, activePlayers[0].chips); } catch (e) { console.error('Error saving chips to DB:', e); }
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
        const diff = betAmount - player.currentBet;
        if (diff === 0) {
          actionLog.push(`${player.name} checked.`);
        } else if (betAmount === game.currentBet) {
          actionLog.push(`${player.name} called (${betAmount} chips).`);
        } else {
          actionLog.push(`${player.name} raised to ${betAmount} chips.`);
        }
        game.playerBet(playerIndex, diff);
        lastAggressorIndex = playerIndex;
        // Persist chips to DB after bet
        try { await setUserChips(player.name, player.chips); } catch (e) { console.error('Error saving chips to DB:', e); }
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
          // Instead of determining winners now, defer until all show/muck
          // Prepare showdown info for all players
          const showdownPlayers = game.players.map(p => {
            const holeCards = (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit }));
            return {
              name: p.name,
              holeCards: holeCards,
              hand: p.hand ? p.hand.name : null,
              folded: p.folded
            };
          });
          const showdownInfo = {
            winners: [], // No winners yet
            showdownPlayers,
            lastAggressor: lastAggressorIndex !== null ? game.players[lastAggressorIndex]?.name : null
          };
          io.emit('showdown', showdownInfo);
          lastShowdownInfo = showdownInfo;
          showChoices = {};

          // Set timeout to auto-reset after 30 seconds if players don't show/muck
          if (showdownTimeout) clearTimeout(showdownTimeout);
          showdownTimeout = setTimeout(() => {
            console.log('Auto-resetting game state after showdown timeout');
            // If not all have acted, force all remaining to muck
            if (lastShowdownInfo) {
              lastShowdownInfo.showdownPlayers.forEach(p => {
                if (!p.folded && !showChoices[p.name]) {
                  showChoices[p.name] = 'muck';
                }
              });
              io.emit('showChoicesUpdate', showChoices);
              checkAndResetGameState();
            }
          }, 30000); // 30 seconds
          // Do NOT reset game/player state here. Wait until all players are ready.
          actionLog.push(`Showdown! Waiting for all players to show or muck.`);
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
        actionLog,
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
          actionLog,
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
        actionLog,
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
    // Only consider non-folded players
    const eligible = lastShowdownInfo.showdownPlayers.filter(p => !p.folded);
    const allActed = eligible.every(p => showChoices[p.name] === 'show' || showChoices[p.name] === 'muck');
    if (!allActed) return;

    // Determine who showed
    const showed = eligible.filter(p => showChoices[p.name] === 'show');
    let winners = [];
    let splitPot = false;
    if (showed.length > 0) {
      // Evaluate hands only for those who showed
      const { Hand } = require('pokersolver');
      const playerHands = showed.map(player => {
        const combinedCards = [
          ...(game.players.find(p => p.name === player.name)?.holeCards || []),
          ...game.communityCards
        ];
        // Convert to pokersolver format
        const rankMap = { 'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', '10': 'T', '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2' };
        const suitMap = { '♠': 's', '♣': 'c', '♥': 'h', '♦': 'd' };
        const formatted = combinedCards.map(c => rankMap[c.rank] + suitMap[c.suit]);
        const hand = Hand.solve(formatted);
        // Save for later use
        const playerObj = game.players.find(p => p.name === player.name);
        if (playerObj) playerObj.hand = hand;
        return hand;
      });
      const winningHands = Hand.winners(playerHands);
      winners = showed.filter((player, idx) => winningHands.includes(game.players.find(p => p.name === player.name)?.hand));
    } else {
      // No one showed: split pot among all eligible (non-folded) players
      winners = eligible;
      splitPot = true;
    }
    // Award pot
    const potValue = game.pot;
    const potShare = Math.floor(game.pot / winners.length);
    winners.forEach(w => {
      const playerObj = game.players.find(p => p.name === w.name);
      if (playerObj) playerObj.chips += potShare;
    });
    game.pot = 0;
    // Persist chips for all players after showdown
    (async () => {
      for (const p of game.players) {
        try { await setUserChips(p.name, p.chips); } catch (e) { console.error('Error saving chips to DB:', e); }
      }
    })();
    // Action log
    if (splitPot) {
      actionLog.push(`No one showed. Pot of ${potValue} chips split between: ${winners.map(w => w.name).join(', ')}`);
    } else if (winners.length === 1) {
      actionLog.push(`${winners[0].name} wins the pot of ${potValue} chips!`);
    } else {
      actionLog.push(`Pot of ${potValue} chips is split between: ${winners.map(w => w.name).join(', ')}`);
    }
    // Prepare showdown info for review phase
    const showdownPlayers = game.players.map(p => {
      const holeCards = (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit }));
      return {
        name: p.name,
        holeCards: holeCards,
        hand: p.hand ? (p.hand.name || p.hand) : null,
        folded: p.folded
      };
    });
    const showdownInfo = {
      winners: winners.map(w => ({
        name: w.name,
        chips: game.players.find(p => p.name === w.name)?.chips,
        hand: game.players.find(p => p.name === w.name)?.hand?.name || null,
      })),
      showdownPlayers,
      lastAggressor: lastAggressorIndex !== null ? game.players[lastAggressorIndex]?.name : null
    };
    io.emit('showdown', showdownInfo);
    lastShowdownInfo = showdownInfo;
    startReviewPhase();
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
        actionLog,
      });
    }
  }

  // Add rebuy event
  socket.on('rebuy', async () => {
    const playerIndex = socketIdToPlayerIndex[socket.id];
    if (playerIndex === undefined || !game) {
      socket.emit('errorMessage', 'You are not part of the game');
      return;
    }
    const player = game.players[playerIndex];
    if (player.chips > 0) {
      socket.emit('errorMessage', 'You can only rebuy when you have 0 chips.');
      return;
    }
    player.chips += 1000;
    // Persist chips to DB after rebuy
    try { await setUserChips(player.name, player.chips); } catch (e) { console.error('Error saving chips to DB:', e); }
    actionLog.push(`${player.name} rebuys for 1000 chips.`);
    io.emit('gameState', {
      players: game.players.map(p => {
        const holeCards = (p.holeCards || []).filter(c => c).map(c => ({ rank: c.rank, suit: c.suit }));
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
      actionLog,
    });
  });

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
            actionLog,
          });
        }
        // Notify all clients of removal
        io.emit('playerRemoveNotice', { username });
      }
      delete disconnectTimeouts[username];
    }, 60000); // 60 seconds
  });
};
