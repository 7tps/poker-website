const { Hand } = require('pokersolver');

class Deck {
    constructor() {
        this.cards = [];
        const suits = ['♠', '♥', '♦', '♣'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        for (const suit of suits) {
            for (const rank of ranks) {
                this.cards.push({ suit, rank });
            }
        }
        console.log(`[DECK] Created deck with ${this.cards.length} cards`);
    }

    shuffle() {
        console.log(`[DECK] Shuffling deck with ${this.cards.length} cards`);
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
        console.log(`[DECK] Deck shuffled, remaining cards: ${this.cards.length}`);
    }

    deal() {
        if (this.cards.length === 0) {
            console.error('[DECK] ERROR: No more cards in the deck!');
            throw new Error('No more cards in the deck');
        }
        const card = this.cards.pop();
        console.log(`[DECK] Dealt card: ${card.rank}${card.suit}, remaining: ${this.cards.length}`);
        return card;
    }
}

// Helper to rank poker hands - simplified version using numeric values
const rankValueMap = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
    '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Evaluate best 5-card poker hand from 7 cards (2 hole + 5 community)
function evaluateHand(cards) {
    // Convert cards to pokersolver format, e.g., 'As', 'Td', etc.
    const rankMap = { 'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', '10': 'T', '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2' };
    const suitMap = { '♠': 's', '♣': 'c', '♥': 'h', '♦': 'd' };
    const formatted = cards.map(c => rankMap[c.rank] + suitMap[c.suit]);
    const hand = Hand.solve(formatted);
    return {
        handRank: hand.rank,
        name: hand.name,
        highCards: hand.cards.map(card => card.value),
        descr: hand.descr,
    };
}

// Game state class
class PokerGame {
    constructor(playerNames) {
        this.deck = new Deck();
        this.deck.shuffle();

        this.players = playerNames.map(name => ({
            name,
            chips: 1000,
            holeCards: [],
            currentBet: 0,
            totalBet: 0,
            folded: false,
            isSmallBlind: false,
            isBigBlind: false,
            ready: false,
            hasActed: false,
        }));

        this.communityCards = [];
        this.pot = 0;
        this.currentBet = 0;
        this.currentPlayerIndex = 0;
        this.round = 'pre-flop'; // pre-flop, flop, turn, river, showdown
        this.dealerIndex = 0; 
        this.smallBlind = 10;
        this.bigBlind = 20;
    }

    getDealerName() {
        return this.players[this.dealerIndex]?.name;
    }

    rotateDealer() {
        this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    }

    dealHoleCards() {
        console.log('[POKER] Starting dealHoleCards');
        this.deck = new Deck();
        this.deck.shuffle();
        this.players.forEach(p => {
            p.isSmallBlind = false;
            p.isBigBlind = false;
            p.ready = false;
            p.hasActed = false;
        });
        const smallBlindIndex = (this.dealerIndex + 1) % this.players.length;
        const bigBlindIndex = (this.dealerIndex + 2) % this.players.length;
        this.players[smallBlindIndex].isSmallBlind = true;
        this.players[bigBlindIndex].isBigBlind = true;
        const sbPlayer = this.players[smallBlindIndex];
        const bbPlayer = this.players[bigBlindIndex];
        const sbAmount = Math.min(this.smallBlind, sbPlayer.chips);
        const bbAmount = Math.min(this.bigBlind, bbPlayer.chips);
        sbPlayer.chips -= sbAmount;
        sbPlayer.currentBet = sbAmount;
        bbPlayer.chips -= bbAmount;
        bbPlayer.currentBet = bbAmount;
        this.currentBet = bbAmount;
        this.pot += sbAmount + bbAmount;
        // Check if there are enough cards for all players
        if (this.deck.cards.length < this.players.length * 2) {
            console.error(`[POKER] ERROR: Not enough cards! Need ${this.players.length * 2}, have ${this.deck.cards.length}`);
            throw new Error('Not enough cards in the deck for all players');
        }
        console.log(`[POKER] Dealing hole cards to ${this.players.length} players`);
        this.players.forEach((player, index) => {
            const card1 = this.deck.deal();
            const card2 = this.deck.deal();
            player.holeCards = [card1, card2];
            console.log(`[POKER] Player ${player.name} (${index}) dealt: ${card1.rank}${card1.suit}, ${card2.rank}${card2.suit}`);
            
            // Validate cards
            if (!card1 || !card1.rank || !card1.suit) {
                console.error(`[POKER] ERROR: Invalid card1 for ${player.name}:`, card1);
            }
            if (!card2 || !card2.rank || !card2.suit) {
                console.error(`[POKER] ERROR: Invalid card2 for ${player.name}:`, card2);
            }
        });
        // Set current player to left of big blind
        this.currentPlayerIndex = (bigBlindIndex + 1) % this.players.length;
        console.log(`[POKER] Hole cards dealt, current player: ${this.players[this.currentPlayerIndex].name}`);
    }

    dealFlop() {
        console.log('[POKER] Dealing flop');
        this.deck.deal(); // Burn
        const flop1 = this.deck.deal();
        const flop2 = this.deck.deal();
        const flop3 = this.deck.deal();
        this.communityCards.push(flop1, flop2, flop3);
        console.log(`[POKER] Flop dealt: ${flop1.rank}${flop1.suit}, ${flop2.rank}${flop2.suit}, ${flop3.rank}${flop3.suit}`);
        this.round = 'flop';
        this.players.forEach(p => { p.hasActed = false; });
    }

    dealTurn() {
        console.log('[POKER] Dealing turn');
        this.deck.deal(); // Burn
        const turn = this.deck.deal();
        this.communityCards.push(turn);
        console.log(`[POKER] Turn dealt: ${turn.rank}${turn.suit}`);
        this.round = 'turn';
        this.players.forEach(p => { p.hasActed = false; });
    }

    dealRiver() {
        console.log('[POKER] Dealing river');
        this.deck.deal(); // Burn
        const river = this.deck.deal();
        this.communityCards.push(river);
        console.log(`[POKER] River dealt: ${river.rank}${river.suit}`);
        this.round = 'river';
        this.players.forEach(p => { p.hasActed = false; });
    }

    // Example betting logic (simple)
    playerBet(playerIndex, amount) {
        const player = this.players[playerIndex];
        if (player.chips < amount) throw new Error('Not enough chips');
        player.chips -= amount;
        player.currentBet += amount;
        player.totalBet += amount;
        player.hasActed = true;
        this.pot += amount;
        if (player.currentBet > this.currentBet) {
            this.currentBet = player.currentBet;
            // Reset hasActed for all except the bettor
            this.players.forEach((p, idx) => { if (!p.folded) p.hasActed = (idx === playerIndex); });
        }
    }

    playerFold(playerIndex) {
        this.players[playerIndex].folded = true;
        this.players[playerIndex].hasActed = true;
    }

    nextPlayer() {
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        } while (this.players[this.currentPlayerIndex].folded);
    }

    getActivePlayers() {
        return this.players.filter(p => !p.folded);
    }

    // Evaluate current hand for a specific player
    evaluatePlayerHand(playerName) {
        const player = this.players.find(p => p.name === playerName);
        if (!player || !player.holeCards || player.holeCards.length === 0) {
            return null;
        }
        
        // If no community cards yet, just return hole cards info
        if (this.communityCards.length === 0) {
            return {
                name: "Hole Cards",
                description: `${player.holeCards[0].rank}${player.holeCards[0].suit}, ${player.holeCards[1].rank}${player.holeCards[1].suit}`,
                rank: 0
            };
        }
        
        // Evaluate the best 5-card hand from hole cards + community cards
        const combinedCards = [...player.holeCards, ...this.communityCards];
        const hand = evaluateHand(combinedCards);
        return {
            name: hand.name,
            description: hand.descr,
            rank: hand.handRank
        };
    }

    showdown() {
        const activePlayers = this.getActivePlayers();
        if (activePlayers.length === 0) return [];

        // Build pokersolver hands for each player
        const playerHands = activePlayers.map(player => {
            const combinedCards = [...player.holeCards, ...this.communityCards];
            // Convert to pokersolver format
            const rankMap = { 'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', '10': 'T', '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2' };
            const suitMap = { '♠': 's', '♣': 'c', '♥': 'h', '♦': 'd' };
            const formatted = combinedCards.map(c => rankMap[c.rank] + suitMap[c.suit]);
            const hand = Hand.solve(formatted);
            player.hand = hand; // Save for later use
            return hand;
        });

        // Use pokersolver to determine the winner(s)
        const winningHands = Hand.winners(playerHands);

        // Map back to your player objects
        const winners = activePlayers.filter((player) => winningHands.includes(player.hand));

        this.rotateDealer();

        return winners;
    }

    allActivePlayersActed() {
        return this.players.filter(p => !p.folded).every(p => p.hasActed);
    }
}

module.exports = { Deck, PokerGame, evaluateHand };
