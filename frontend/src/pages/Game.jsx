import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import "./Game.css"; // Ensure this CSS file exists

const socket = io();

function Card({ rank, suit }) {
    console.log(`[CARD] Rendering card: ${rank}${suit}`);
    
    // Validate card data
    if (!rank || !suit) {
      console.error(`[CARD] ERROR: Invalid card data - rank: ${rank}, suit: ${suit}`);
      return <div className="card-img-container">Invalid Card</div>;
    }
    
    const suitMap = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
    const suitNameMap = { "♠": "Spades", "♥": "Hearts", "♦": "Diamonds", "♣": "Clubs" };
    const rankMap = {
      A: "A", K: "K", Q: "Q", J: "J", "10": "10",
      9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2"
    };
    const rankNameMap = {
      A: "Ace", K: "King", Q: "Queen", J: "Jack", "10": "10",
      9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2"
    };
  
    const imageFile = `/cards/${rankMap[rank]}${suitMap[suit]}.png`;
    const cardName = `${rankNameMap[rank]} of ${suitNameMap[suit]}`;
  
    return (
      <div className="card-img-container">
        <img
          src={imageFile}
          alt={cardName}
          className="card-img"
        />
        <div className="card-subtitle">{cardName}</div>
      </div>
    );
}
  
export default function Game() {
  const [players, setPlayers] = useState([]);
  const [communityCards, setCommunityCards] = useState([]);
  const [pot, setPot] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [currentPlayer, setCurrentPlayer] = useState("");
  const [round, setRound] = useState("");
  const [username, setUsername] = useState("");
  const [myHoleCards, setMyHoleCards] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [betAmount, setBetAmount] = useState("");
  const [error, setError] = useState("");
  const [dealer, setDealer] = useState("");
  const [showRaiseInput, setShowRaiseInput] = useState(false);
  const [showdownInfo, setShowdownInfo] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [disconnectTimers, setDisconnectTimers] = useState({}); // { username: secondsLeft }
  const [showChoices, setShowChoices] = useState({});
  const [myHandName, setMyHandName] = useState("");
  const [canShowFirst, setCanShowFirst] = useState(null); // Track who can show first
  const [showdownCountdown, setShowdownCountdown] = useState(30); // Countdown for showdown phase
  const [reviewPhase, setReviewPhase] = useState(false); // Track if we're in review phase
  const [reviewCountdown, setReviewCountdown] = useState(15); // Countdown for review phase
  const [actionLog, setActionLog] = useState([]);

  useEffect(() => {
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
      socket.emit("joinGame", storedUsername);
    }

    function handleGameState(state) {
      console.log('[FRONTEND] Received game state:', state);
      setPlayers(state.players);
      setCommunityCards(state.communityCards);
      setPot(state.pot);
      setCurrentBet(state.currentBet);
      setCurrentPlayer(state.currentPlayer);
      setRound(state.round);
      setDealer(state.dealer || "");
      setError("");
      setStatusMessage("");
      setActionLog(state.actionLog || []);

      // Reset showdown-related state when starting a new round
      if (state.communityCards.length === 0) {
        setShowdownInfo(null);
        setShowChoices({});
        setCanShowFirst(null);
        setMyHandName("");
        setShowdownCountdown(30);
        setReviewPhase(false);
        setReviewCountdown(15);
      }

      const me = state.players.find(p => p.name === storedUsername);
      if (me) {
        console.log('[FRONTEND] My hole cards:', me.holeCards);
        // Validate my hole cards
        if (me.holeCards) {
          me.holeCards.forEach((card, index) => {
            if (!card || !card.rank || !card.suit) {
              console.error(`[FRONTEND] ERROR: Invalid hole card at index ${index}:`, card);
            }
          });
        }
        setMyHoleCards(me.holeCards);
      }
    }
    function handleShowdown(data) {
      const names = data.winners.map(w => w.name).join(", ");
      setStatusMessage(`Showdown! Winner(s): ${names}`);
      setShowdownInfo(data);
      // Set my hand name for display
      const me = data.showdownPlayers.find(p => p.name === username);
      setMyHandName(me && me.hand ? me.hand : "");
      
      // Start countdown timer
      setShowdownCountdown(30);
      
      // Determine who can show first based on last aggressor
      if (data.lastAggressor) {
        setCanShowFirst(data.lastAggressor);
      } else {
        // If no aggression, player left of dealer shows first
        // For now, we'll use the first non-winner player as fallback
        const nonWinners = data.showdownPlayers.filter(p => 
          !data.winners.some(w => w.name === p.name) && !p.folded
        );
        setCanShowFirst(nonWinners.length > 0 ? nonWinners[0].name : null);
      }
    }
    function handleShowChoicesUpdate(choices) {
      setShowChoices(choices);
    }
    function handleShowdownReviewPhase(data) {
      setReviewPhase(true);
      setReviewCountdown(data.duration);
    }
    function handleErrorMessage(msg) {
      setError(msg);
    }
    function handleDisconnectNotice({ username, timeout }) {
      setNotifications((prev) => [
        ...prev,
        { id: `${username}-disconnect`, message: `${username} disconnected. Removing in ${timeout} seconds.`, username }
      ]);
      setDisconnectTimers((prev) => ({ ...prev, [username]: timeout }));
    }
    function handleRemoveNotice({ username }) {
      setNotifications((prev) => prev.filter(n => n.username !== username));
      setDisconnectTimers((prev) => {
        const copy = { ...prev };
        delete copy[username];
        return copy;
      });
    }

    socket.on("gameState", handleGameState);
    socket.on("showdown", handleShowdown);
    socket.on("showChoicesUpdate", handleShowChoicesUpdate);
    socket.on("showdownReviewPhase", handleShowdownReviewPhase);
    socket.on("errorMessage", handleErrorMessage);
    socket.on("playerDisconnectNotice", handleDisconnectNotice);
    socket.on("playerRemoveNotice", handleRemoveNotice);

    return () => {
      socket.off("gameState", handleGameState);
      socket.off("showdown", handleShowdown);
      socket.off("showChoicesUpdate", handleShowChoicesUpdate);
      socket.off("showdownReviewPhase", handleShowdownReviewPhase);
      socket.off("errorMessage", handleErrorMessage);
      socket.off("playerDisconnectNotice", handleDisconnectNotice);
      socket.off("playerRemoveNotice", handleRemoveNotice);
    };
  }, []);

  // Timer countdown effect
  useEffect(() => {
    const interval = setInterval(() => {
      setDisconnectTimers((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((username) => {
          if (updated[username] > 0) updated[username] -= 1;
        });
        return updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Showdown countdown effect
  useEffect(() => {
    let interval;
    if (showdownInfo && showdownCountdown > 0) {
      interval = setInterval(() => {
        setShowdownCountdown((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showdownInfo, showdownCountdown]);

  // Review phase countdown effect
  useEffect(() => {
    let interval;
    if (reviewPhase && reviewCountdown > 0) {
      interval = setInterval(() => {
        setReviewCountdown((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [reviewPhase, reviewCountdown]);

  function handleRaise() {
    setShowRaiseInput(true);
  }

  function handleConfirmRaise() {
    const amountNum = Number(betAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Invalid raise amount");
      return;
    }
    setError("");
    socket.emit("playerAction", { type: "bet", amount: amountNum });
    setBetAmount("");
    setShowRaiseInput(false);
  }

  function handleCheckCall() {
    const me = players.find(p => p.name === username);
    if (!me) return;
    if (me.currentBet === currentBet) {
      // Check: bet 0 more
      socket.emit("playerAction", { type: "bet", amount: me.currentBet });
    } else {
      // Call: match current bet
      socket.emit("playerAction", { type: "bet", amount: currentBet });
    }
  }

  function handleFold() {
    socket.emit("playerAction", { type: "fold" });
  }

  function handleStartRound() {
    socket.emit("startRound");
  }

  function handleReady() {
    socket.emit("playerReady");
  }

  function handleShowHand() {
    socket.emit("showHand");
  }

  function handleMuckHand() {
    socket.emit("muckHand");
  }

  const shouldShowHand = (player) => {
    if (showdownInfo && showdownInfo.winners && showdownInfo.winners.some(w => w.name === player.name)) return true;
    if (showChoices[player.name] === 'show') return true;
    if (player.name === username) return true; // Always show your own hand
    return false;
  };

  return (
    <div className="casino-background">
      <div className="poker-table">

        <div className="table-center">
          <h2 className="table-title">Texas Hold'em Poker</h2>
          <p><b>Round:</b> {round}</p>
          <p><b>Pot:</b> {pot} chips | <b>Current Bet:</b> {currentBet}</p>
          <p><b>Current Turn:</b> {currentPlayer}</p>

          {/* Ready/Start Round Buttons */}
          {round === 'pre-flop' && communityCards.length === 0 && players.every(p => (p.holeCards || []).length === 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div>
                {players.map((player) => (
                  <span key={player.name} style={{ marginRight: 12, fontWeight: player.ready ? 'bold' : 'normal', color: player.ready ? '#4caf50' : '#fff' }}>
                    {player.name === username ? 'You' : player.name}: {player.ready ? 'Ready' : 'Not Ready'}
                  </span>
                ))}
              </div>
              <button
                onClick={handleReady}
                disabled={players.find(p => p.name === username)?.ready}
                style={{ padding: '10px 24px', fontSize: '1.1rem', fontWeight: 'bold', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer'}}>
                Ready
              </button>
              {players.length >= 2 && players.every(p => p.ready) && (
                <button onClick={handleStartRound} style={{ padding: '10px 24px', fontSize: '1.1rem', fontWeight: 'bold', background: '#2196f3', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer'}}>Start Round</button>
              )}
            </div>
          )}

          <div className="cards-section">
            <div className="cards-block">
              <h4>Community Cards</h4>
              <div className="cards-row">
              {communityCards.map((card, i) => (
                <div style={{ animationDelay: `${i * 0.15}s` }} key={i}>
                    <Card rank={card.rank} suit={card.suit} />
                </div>
                ))}
              </div>
            </div>
            <div className="cards-block">
              <h4>Your Hole Cards</h4>
              <div className="cards-row">
                {myHoleCards.filter(card => card && card.rank && card.suit).map((card, i) => (
                  <Card key={i} rank={card.rank} suit={card.suit} />
                ))}
              </div>
              {/* Current Hand Ranking */}
              {(() => {
                const me = players.find(p => p.name === username);
                if (me && me.currentHand && myHoleCards.length > 0) {
                  return (
                    <div className="current-hand-display">
                      <div className="current-hand-title">
                        Current Hand: {me.currentHand.name}
                      </div>
                      {me.currentHand.description && (
                        <div className="current-hand-description">
                          {me.currentHand.description}
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          <div className="players-list">
            <h4>Players</h4>
            <ul>
            {players.map((player) => {
              // Determine if we should show this player's cards
              let showCards = false;
              let playerHand = null;
              if (player.name === username) {
                showCards = true;
              } else if (showdownInfo && showdownInfo.showdownPlayers) {
                const sd = showdownInfo.showdownPlayers.find(p => p.name === player.name);
                if (sd) {
                  showCards = true;
                  playerHand = sd.hand;
                }
              }
              
              // Log card filtering for debugging
              if (player.holeCards && player.holeCards.length > 0) {
                const validCards = (player.holeCards || []).filter(card => card && card.rank && card.suit);
                const invalidCards = (player.holeCards || []).filter(card => !card || !card.rank || !card.suit);
                if (invalidCards.length > 0) {
                  console.error(`[FRONTEND] Player ${player.name} has invalid cards:`, invalidCards);
                }
                console.log(`[FRONTEND] Player ${player.name} cards - valid: ${validCards.length}, invalid: ${invalidCards.length}`);
              }
              
              return (
                <li
                  key={player.name}
                  className={`player-item ${player.name === currentPlayer ? "active" : ""} ${player.folded ? "folded" : ""}`}
                >
                  <div className="player-info">
                    <span className="player-name">{player.name === username ? username : player.name}</span>
                    <span className="chips">Chips: {player.chips}</span>
                    <span className="bet-amount">Total In: {player.totalBet}</span>
                    <span className="bet-amount" style={{ background: '#4caf50', color: '#fff' }}>This Round: {player.currentBet}</span>
                    {player.name === dealer && (
                      <span className="dealer-chip">D</span>
                    )}
                    {player.isSmallBlind && (
                      <span className="blind-chip small-blind">SB</span>
                    )}
                    {player.isBigBlind && (
                      <span className="blind-chip big-blind">BB</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {disconnectTimers[player.name] ? (
                      <div style={{ color: '#ff9800', fontWeight: 'bold', fontSize: '1.1rem', padding: 8, background: '#222', borderRadius: 8 }}>
                        Disconnected: removing in {disconnectTimers[player.name]}s
                      </div>
                    ) :
                      // Only show cards if player is a winner or chose 'show', or if it's you
                      ((player.name === username) ||
                        (showdownInfo && (
                          (showChoices[player.name] === 'show') ||
                          (showdownInfo.winners && showdownInfo.winners.some(w => w.name === player.name))
                        ))) && (player.holeCards || []).filter(card => card && card.rank && card.suit).length > 0 ? (
                      (player.holeCards || []).filter(card => card && card.rank && card.suit).map((card, i) => (
                        <Card key={i} rank={card.rank} suit={card.suit} />
                      ))
                    ) : !disconnectTimers[player.name] && (player.holeCards || []).filter(card => card && card.rank && card.suit).length > 0 ? (
                      (player.holeCards || []).filter(card => card && card.rank && card.suit).map((_, i) => (
                        <div key={i} className="card-img-container">
                          <img src="/cards/back.png" alt="Face Down" className="card-img" />
                          <div className="card-subtitle">Face Down</div>
                        </div>
                      ))
                    ) : (
                      // Show placeholders before round starts
                      [0, 1].map(i => (
                        <div key={i} className="card-placeholder"></div>
                      ))
                    )}
                  </div>
                  {showCards && playerHand && (
                    <div style={{ color: '#ffd700', fontWeight: 'bold', marginTop: 2 }}>Hand: {playerHand}</div>
                  )}
                  {/* Show current hand ranking for other players when cards are visible */}
                  {!showCards && player.currentHand && (showChoices[player.name] === 'show' || (showdownInfo && showdownInfo.winners && showdownInfo.winners.some(w => w.name === player.name))) && (
                    <div className="other-player-hand">
                      Current: {player.currentHand.name}
                    </div>
                  )}
                </li>
              );
            })}
            </ul>
          </div>

          <div className="actions">
            <button
              onClick={handleCheckCall}
              disabled={currentPlayer !== username || (round === 'pre-flop' && players.every(p => (p.holeCards || []).length === 0))}
            >
              {(() => {
                const me = players.find(p => p.name === username);
                if (!me || me.currentBet === currentBet) return 'Check';
                return 'Call';
              })()}
            </button>
            <button
              onClick={handleRaise}
              disabled={currentPlayer !== username || (round === 'pre-flop' && players.every(p => (p.holeCards || []).length === 0))}
            >
              Raise
            </button>
            <button onClick={handleFold} disabled={currentPlayer !== username || (round === 'pre-flop' && players.every(p => (p.holeCards || []).length === 0))}>Fold</button>
            {showRaiseInput && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  value={betAmount}
                  onChange={e => setBetAmount(e.target.value)}
                  placeholder="Raise amount"
                  style={{ marginBottom: 8, width: 140 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleConfirmRaise} style={{ padding: '6px 16px' }}>Confirm Raise</button>
                  <button onClick={() => { setShowRaiseInput(false); setBetAmount(""); }} style={{ padding: '6px 16px' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Rebuy Button: Only show if you have 0 chips */}
          {(() => {
            const me = players.find(p => p.name === username);
            if (me && me.chips === 0) {
              return (
                <button
                  onClick={() => socket.emit('rebuy')}
                  style={{
                    padding: '12px 32px',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    background: '#ff9800',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    marginBottom: 16,
                    cursor: 'pointer',
                  }}
                >
                  Rebuy 1000 Chips
                </button>
              );
            }
            return null;
          })()}

          {/* Show/Muck buttons after showdown */}
          {showdownInfo && (() => {
            const isWinner = showdownInfo.winners && showdownInfo.winners.some(w => w.name === username);
            const hasShownOrMucked = showChoices[username] === 'show' || showChoices[username] === 'muck';
            const canShowNow = canShowFirst === username || 
                              (canShowFirst && showChoices[canShowFirst]) || 
                              !canShowFirst;
            
            // If in review phase, show review message
            if (reviewPhase) {
              return (
                <div className="showdown-actions-area">
                  <div style={{ marginBottom: 8, color: '#4caf50', fontSize: '1rem', fontWeight: 'bold' }}>
                    📋 Review Phase - Take time to review the board and hand rankings
                  </div>
                  {reviewCountdown > 0 && (
                    <div style={{ color: '#ff9800', fontWeight: 'bold' }}>
                      Next round starting in {reviewCountdown} seconds
                    </div>
                  )}
                </div>
              );
            }
            
            if (isWinner) {
              return (
                <div className="showdown-actions-area">
                  <div style={{ marginBottom: 8, color: '#ffd700', fontSize: '1rem', fontWeight: 'bold' }}>
                    🏆 You won! No need to show or muck your hand.
                  </div>
                  {showdownCountdown > 0 && (
                    <div style={{ color: '#ff9800', fontWeight: 'bold' }}>
                      Review phase starting in {showdownCountdown} seconds
                    </div>
                  )}
                </div>
              );
            }
            
            return (
              <div className="showdown-actions-area">
                <div style={{ marginBottom: 8, color: '#fff', fontSize: '0.9rem' }}>
                  {canShowFirst === username ? 
                    "You can show or muck first (last aggressor)" :
                    canShowFirst ? 
                      `Waiting for ${canShowFirst} to show or muck first...` :
                      "You can show or muck your hand"
                  }
                  {showdownCountdown > 0 && (
                    <div style={{ marginTop: 4, color: '#ff9800', fontWeight: 'bold' }}>
                      Auto-reset in {showdownCountdown} seconds
                    </div>
                  )}
                </div>
                <button 
                  onClick={handleShowHand} 
                  disabled={hasShownOrMucked || !canShowNow}
                  style={{ 
                    opacity: canShowNow ? 1 : 0.5,
                    cursor: canShowNow ? 'pointer' : 'not-allowed'
                  }}
                >
                  Show
                </button>
                <button 
                  onClick={handleMuckHand} 
                  disabled={hasShownOrMucked || !canShowNow}
                  style={{ 
                    opacity: canShowNow ? 1 : 0.5,
                    cursor: canShowNow ? 'pointer' : 'not-allowed'
                  }}
                >
                  Muck
                </button>
              </div>
            );
          })()}

          {/* Hand Rankings Sidebar after showdown */}
          {showdownInfo && (
            <div className="hand-rankings-sidebar" style={{ 
              border: reviewPhase ? '2px solid #4caf50' : '1px solid #ccc',
              background: reviewPhase ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 255, 255, 0.05)'
            }}>
              <h4 style={{ 
                color: reviewPhase ? '#4caf50' : '#fff',
                fontWeight: reviewPhase ? 'bold' : 'normal'
              }}>
                {reviewPhase ? '📋 Final Hand Rankings' : 'Hand Rankings'}
              </h4>
              <ul>
                {showdownInfo.showdownPlayers.map((p) => {
                  const shouldShow =
                    (showChoices[p.name] === 'show') ||
                    (showdownInfo.winners && showdownInfo.winners.some(w => w.name === p.name)) ||
                    (p.name === username);
                  return shouldShow && p.hand ? (
                    <li key={p.name} className={p.name === username ? 'my-hand-ranking' : ''}>
                      <b>{p.name === username ? 'You' : p.name}:</b> {p.hand}
                      {showdownInfo.winners && showdownInfo.winners.some(w => w.name === p.name) && (
                        <span style={{ color: '#ffd700', marginLeft: 8 }}>🏆</span>
                      )}
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          )}

          {statusMessage && <p className="status-message">{statusMessage}</p>}
          {reviewPhase && (
            <p className="status-message" style={{ color: '#4caf50', fontWeight: 'bold' }}>
              📋 Review Phase - Take time to review the board and hand rankings
            </p>
          )}
          {error && <p className="error-message">{error}</p>}
        </div>

        {/* Action Log Display */}
        <div className="action-log">
          <h4>Action Log</h4>
          <ul>
            {actionLog.map((entry, idx) => (
              <li key={idx}>{entry}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Notifications in top right */}
      <div className="disconnect-notification-container">
        {notifications.map((n) => (
          <div key={n.id} className="disconnect-notification">
            <span>{n.message}</span>
            <button onClick={() => setNotifications((prev) => prev.filter(x => x.id !== n.id))}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
