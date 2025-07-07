import React, { useEffect, useRef, useState } from "react";
import { Alert, Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Socket } from "socket.io-client";
import { getSocketInstance } from "../utils/socketManager";
import GameControls from "./GameControls";

// Types
interface Player {
  userId: string;
  username: string;
  rating: number;
  avatar: string | null;
  title: string | null;
}

interface GameState {
  sessionId: string;
  variantName: string;
  subvariantName: string;
  description: string;
  players: {
    white: Player;
    black: Player;
  };
  board: {
    fen: string;
    position: string;
    activeColor: "white" | "black";
    castlingRights: string;
    enPassantSquare: string;
    halfmoveClock: number;
    fullmoveNumber: number;
    whiteTime?: number;
    blackTime?: number;
    turnStartTimestamp?: number;
    moveHistory?: { from: string; to: string; [key: string]: any }[];
    repetitionMap?: any;
  };
  timeControl: {
    type: string;
    baseTime: number;
    increment: number;
    timers: {
      white: number;
      black: number;
    };
    flagged: {
      white: boolean;
      black: boolean;
    };
    timeSpent?: { white: any; black: any };
  };
  status: string;
  result: string;
  resultReason?: string | null;
  winner?: string | null;
  moves: any[];
  moveCount: number;
  lastMove: any;
  gameState: {
    valid?: boolean;
    move?: any;
    state?: any;
    result?: string;
    check?: boolean;
    checkmate?: boolean;
    stalemate?: boolean;
    insufficientMaterial?: boolean;
    threefoldRepetition?: boolean;
    fiftyMoveRule?: boolean;
    canCastleKingside?: { white?: boolean; black?: boolean };
    canCastleQueenside?: { white?: boolean; black?: boolean };
    promotionAvailable?: boolean;
    lastMove?: any;
    winner?: string | null;
    drawReason?: string | null;
  };
  userColor: {
    [key: string]: "white" | "black";
  };
  positionHistory?: string[];
  createdAt?: number;
  lastActivity?: number;
  startedAt?: number;
  endedAt?: number | null;
  rules?: any;
  metadata?: any;
  timers?: any;
}

interface Move {
  from: string;
  to: string;
  promotion?: string;
}

interface ChessGameProps {
  initialGameState: GameState;
  userId: string;
}

const PIECE_SYMBOLS = {
  'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
  'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙'
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export default function ChessGame({ initialGameState, userId }: ChessGameProps) {
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [showMoveHistory, setShowMoveHistory] = useState(false);
  const [promotionModal, setPromotionModal] = useState<{ visible: boolean, from: string, to: string, options: string[] } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Timer sync state
  function safeTimerValue(val: any): number {
    const n = Number(val);
    return isNaN(n) || n === undefined || n === null ? 0 : n;
  }
  const [localTimers, setLocalTimers] = useState<{white: number, black: number}>(
    {
      white: safeTimerValue(initialGameState.timeControl.timers.white),
      black: safeTimerValue(initialGameState.timeControl.timers.black)
    }
  );
  const lastBackendSync = useRef<{white: number, black: number, ts: number}>(
    {
      white: safeTimerValue(initialGameState.timeControl.timers.white),
      black: safeTimerValue(initialGameState.timeControl.timers.black),
      ts: Date.now()
    }
  );

  const screenWidth = Dimensions.get('window').width;
  const boardSize = screenWidth - 40;
  const squareSize = boardSize / 8;

  useEffect(() => {
    // Set up game socket connection
    const gameSocket = getSocketInstance();
    if (gameSocket) {
      setSocket(gameSocket);
      console.log("Connected to game socket");
    }

    if(!gameSocket) {
      console.error("Failed to connect to game socket");
        Alert.alert("Connection Error", "Failed to connect to game socket. Please try again.");
        return;
    }

    // Initial player color and board orientation
    const userColor = gameState.userColor[userId];
    const safePlayerColor = userColor === "white" || userColor === "black" ? userColor : "white";
    setPlayerColor(safePlayerColor);
    setBoardFlipped(safePlayerColor === "black");
    setIsMyTurn(gameState.board.activeColor === safePlayerColor);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Always update playerColor and isMyTurn on every gameState change
  useEffect(() => {
    const userColor = gameState.userColor[userId];
    const safePlayerColor = userColor === "white" || userColor === "black" ? userColor : "white";
    setPlayerColor(safePlayerColor);
    setBoardFlipped(safePlayerColor === "black");
    setIsMyTurn(gameState.board.activeColor === safePlayerColor);
    console.log("[DEBUG] userId:", userId, "userColor:", userColor, "playerColor:", safePlayerColor, "activeColor:", gameState.board.activeColor, "isMyTurn:", gameState.board.activeColor === safePlayerColor);
  }, [gameState, userId]);

  useEffect(() => {
    if (!socket) return;

    // Listen for game events
    socket.on("game:move", handleGameMove);
    socket.on("game:possibleMoves", handlePossibleMoves);
    socket.on("game:gameState", handleGameStateUpdate);
    socket.on("game:timer", handleTimerUpdate);
    socket.on("game:end", handleGameEnd);
    socket.on("game:error", handleGameError);

    return () => {
      socket.off("game:move", handleGameMove);
      socket.off("game:possibleMoves", handlePossibleMoves);
      socket.off("game:gameState", handleGameStateUpdate);
      socket.off("game:timer", handleTimerUpdate);
      socket.off("game:end", handleGameEnd);
      socket.off("game:error", handleGameError);
    };
  }, [socket]);

  // Timer effect: smooth local countdown, resync on backend update
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (gameState.status !== "active") return;
    // Start local timer
    timerRef.current = setInterval(() => {
      setLocalTimers(prev => {
        const now = Date.now();
        const elapsed = now - lastBackendSync.current.ts;
        const white = Math.max(0, safeTimerValue(lastBackendSync.current.white) - elapsed);
        const black = Math.max(0, safeTimerValue(lastBackendSync.current.black) - elapsed);
        return {white, black};
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState.status, gameState.board.activeColor]);

  // On every backend timer/game update, resync local timer base
  useEffect(() => {
    if (!gameState.timeControl || !gameState.timeControl.timers) return;
    lastBackendSync.current = {
      white: safeTimerValue(gameState.timeControl.timers.white),
      black: safeTimerValue(gameState.timeControl.timers.black),
      ts: Date.now(),
    };
    setLocalTimers({
      white: safeTimerValue(gameState.timeControl.timers.white),
      black: safeTimerValue(gameState.timeControl.timers.black),
    });
  }, [gameState.timeControl.timers.white, gameState.timeControl.timers.black]);

  // Handles the 'game:move' event from the server
  const handleGameMove = (data: any) => {
    // data: { move: {from, to, ...}, gameState: {...} }
    console.log("Move received:", data);
    if (data && data.gameState) {
      setGameState(prevState => ({
        ...prevState,
        ...data.gameState,
        board: {
          ...prevState.board,
          ...data.gameState.board,
        },
        moves: data.gameState.moves || [],
        lastMove: data.gameState.lastMove,
        moveCount: data.gameState.moveCount,
      }));
      console.log("Updated game state:", data.gameState);
      setMoveHistory(data.gameState.moves || []);
      setSelectedSquare(null);
      setPossibleMoves([]);
      // Use the updated activeColor from the new gameState
      const userColor = data.gameState.userColor ? data.gameState.userColor[userId] : playerColor;
      const activeColor = data.gameState.board.activeColor;
      setIsMyTurn(activeColor === userColor);
    }
  };

  // Handles the 'game:possibleMoves' event from the server
  const handlePossibleMoves = (data: { square: string; moves: any[] }) => {
    // data.moves: array of Move objects from backend
    console.log("Possible moves (raw):", data.moves);
    // Extract the 'to' field from each move object
    let moves: string[] = [];
    if (Array.isArray(data.moves) && data.moves.length > 0) {
      if (typeof data.moves[0] === 'object' && data.moves[0].to) {
        moves = data.moves.map((m: any) => m.to);
      } else if (typeof data.moves[0] === 'string' && data.moves[0].length === 4) {
        moves = data.moves.map((m: string) => m.slice(2, 4));
      } else if (typeof data.moves[0] === 'string') {
        moves = data.moves;
      }
    }
    console.log("Possible moves (dest squares):", moves);
    setPossibleMoves(moves);
  };

  // Handles the 'game:gameState' event from the server
  const handleGameStateUpdate = (data: any) => {
    // data: { gameState: {...} }
    console.log("Game state update:", data);
    if (data && data.gameState) {
      setGameState(prevState => ({ ...prevState, ...data.gameState }));
      setIsMyTurn(data.gameState.board.activeColor === playerColor);
    }
  };

  // Handles the 'game:timer' event from the server
  const handleTimerUpdate = (data: any) => {
    // data: { timers: ..., black: ... }
    console.log("Timer update:", data);
    // Always coerce to numbers and fallback to previous if missing
    setGameState(prevState => ({
      ...prevState,
      timeControl: {
        ...prevState.timeControl,
        timers: {
          white: safeTimerValue(data?.timers?.white ?? data?.white ?? prevState.timeControl.timers.white),
          black: safeTimerValue(data?.timers?.black ?? data?.black ?? prevState.timeControl.timers.black)
        }
      }
    }));
  };

  // Handles the 'game:end' event from the server
  const handleGameEnd = (data: any) => {
    // data: { gameState: {...} }
    console.log("Game ended:", data);
    if (data && data.gameState) {
      setGameState(prevState => ({
        ...prevState,
        ...data.gameState,
        status: "ended"
      }));
      Alert.alert("Game Over", `Result: ${data.gameState.result || "Game ended"}`);
    }
  };

  // Handles the 'game:error' event from the server
  const handleGameError = (data: any) => {
    // data: { message: "Error message" }
    console.log("Game error:", data);
    Alert.alert("Error", data.message || data.error || "An error occurred");
  };

  // Emits a request for possible moves for a square
  const requestPossibleMoves = (square: string) => {
    if (!socket) return;
    socket.emit("game:getPossibleMoves", {
      square: square
    });
  };

  // Helper to update the board position string for a simple move (no castling, no en passant, no promotion)
  function updatePositionString(position: string, from: string, to: string): string {
    // position: FEN piece placement part (e.g. rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR)
    // from, to: e.g. 'e2', 'e4'
    // Returns new position string after moving piece from 'from' to 'to'
    let pos = position.replace(/\//g, '');
    const files = FILES;
    const ranks = RANKS;
    const fromFile = files.indexOf(from[0]);
    const fromRank = ranks.indexOf(from[1]);
    const toFile = files.indexOf(to[0]);
    const toRank = ranks.indexOf(to[1]);
    if (fromFile === -1 || fromRank === -1 || toFile === -1 || toRank === -1) return position;
    const fromIdx = fromRank * 8 + fromFile;
    const toIdx = toRank * 8 + toFile;
    let arr = pos.split('');
    arr[toIdx] = arr[fromIdx];
    arr[fromIdx] = '1';
    // Collapse consecutive '1's into numbers and re-insert slashes every 8 chars
    let collapsed = '';
    for (let i = 0; i < 8; i++) {
      let row = arr.slice(i * 8, (i + 1) * 8).join('');
      row = row.replace(/1{1,8}/g, m => m.length.toString());
      collapsed += row;
      if (i < 7) collapsed += '/';
    }
    return collapsed;
  }

  // Emits a move to the server in the required format
  const makeMove = (move: Move) => {
    console.log('[DEBUG] Attempting to make move', move, 'isMyTurn:', isMyTurn, 'playerColor:', playerColor, 'activeColor:', gameState.board.activeColor);
    if (!socket || !isMyTurn) {
      console.log('[DEBUG] Not emitting move: socket or isMyTurn false');
      return;
    }
    setIsMyTurn(false);
    setSelectedSquare(null);
    setPossibleMoves([]);
    socket.emit("game:makeMove", {
      move: { from: move.from, to: move.to, promotion: move.promotion },
      timestamp: Date.now()
    });
    console.log('[DEBUG] Move emitted:', { from: move.from, to: move.to, promotion: move.promotion });
  };

  const handleSquarePress = (square: string) => {
    if (selectedSquare === square) {
      // Deselect if clicking the same square
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }

    if (selectedSquare && possibleMoves.includes(square)) {
      // Check if this move is a promotion
      // Find all possible moves for selectedSquare to this square
      const allMoves = (gameState && gameState.moves) ? gameState.moves : [];
      // But better: use the last possibleMoves event, which is more accurate
      // So, let's keep the last possibleMoves data in a ref
      // But for now, let's check for promotion in the backend's possible moves
      let promotionOptions: string[] = [];
      if (Array.isArray(gameState && gameState.board && gameState.board.moveHistory)) {
        // Not reliable for current move, so use below
      }
      // Use possibleMoves from last request
      if (Array.isArray(possibleMoves) && possibleMoves.length > 0) {
        // But we need the full move objects, not just squares
        // So, let's use the last possibleMoves event if we can
      }
      // Instead, let's use the last possibleMoves event, but we need to store the full move objects
      // Let's add a ref to store the last full move objects
      // We'll add this at the top:
      // const lastPossibleMoveObjects = useRef<any[]>([]);
      // And update it in handlePossibleMoves
      // For now, let's just check for promotion using the backend's move list
      let promotionMoves = [];
      if (Array.isArray(gameState && gameState.moves)) {
        promotionMoves = gameState.moves.filter((m: any) => m.from === selectedSquare && m.to === square && m.promotion);
      }
      if (promotionMoves.length > 0) {
        // Multiple promotion options, show modal
        const options = promotionMoves.map((m: any) => m.promotion).filter((v: any, i: number, arr: any[]) => arr.indexOf(v) === i);
        setPromotionModal({ visible: true, from: selectedSquare, to: square, options });
        return;
      }
      // Only allow moves that are in possibleMoves
      makeMove({ from: selectedSquare, to: square });
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }

    // Only allow selecting a piece if it's the player's turn and the piece belongs to them
    const piece = getPieceAt(square);
    if (isMyTurn && piece && isPieceOwnedByPlayer(piece, playerColor)) {
      setSelectedSquare(square);
      requestPossibleMoves(square);
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  };

  // Handle promotion selection
  const handlePromotionSelect = (promotion: string) => {
    if (promotionModal) {
      makeMove({ from: promotionModal.from, to: promotionModal.to, promotion });
      setPromotionModal(null);
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  };

  // Correct FEN parsing for piece lookup
  const getPieceAt = (square: string): string | null => {
    const fileIndex = FILES.indexOf(square[0]);
    const rankIndex = RANKS.indexOf(square[1]);
    if (fileIndex === -1 || rankIndex === -1) return null;
    const fen = gameState.board.fen || gameState.board.position;
    if (!fen) return null;
    // Only use the piece placement part (before first space)
    const piecePlacement = fen.split(' ')[0];
    const rows = piecePlacement.split('/');
    if (rows.length !== 8) return null;
    const row = rows[rankIndex];
    let col = 0;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c >= '1' && c <= '8') {
        col += parseInt(c);
      } else {
        if (col === fileIndex) {
          return c;
        }
        col++;
      }
    }
    return null;
  };

  const isPieceOwnedByPlayer = (piece: string, color: "white" | "black"): boolean => {
    if (color === "white") {
      return piece === piece.toUpperCase();
    } else {
      return piece === piece.toLowerCase();
    }
  };

  const formatTime = (milliseconds: number): string => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0:00';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const renderSquare = (file: string, rank: string) => {
    const square = `${file}${rank}`;
    const isLight = (FILES.indexOf(file) + parseInt(rank)) % 2 === 0;
    const isSelected = selectedSquare === square;
    const isPossibleMove = possibleMoves.includes(square);
    // Use the last move from moveHistory if available
    let lastMoveObj = null;
    if (gameState.board && Array.isArray(gameState.board.moveHistory) && gameState.board.moveHistory.length > 0) {
      lastMoveObj = gameState.board.moveHistory[gameState.board.moveHistory.length - 1];
    } else if (gameState.lastMove && typeof gameState.lastMove === 'object' && gameState.lastMove.from && gameState.lastMove.to) {
      lastMoveObj = gameState.lastMove;
    }
    let isLastMove = false;
    if (lastMoveObj && lastMoveObj.from && lastMoveObj.to) {
      isLastMove = (lastMoveObj.from === square || lastMoveObj.to === square);
    }
    const piece = getPieceAt(square);

    return (
      <TouchableOpacity
        key={square}
        style={[
          styles.square,
          {
            width: squareSize,
            height: squareSize,
            backgroundColor: isLight ? '#F0D9B5' : '#B58863',
            borderWidth: isPossibleMove ? 4 : isSelected ? 3 : isLastMove ? 3 : 0,
            borderColor: isPossibleMove
              ? '#22c55e'
              : isSelected
              ? '#7dd3fc'
              : isLastMove
              ? '#fbbf24'
              : 'transparent',
          },
        ]}
        onPress={() => handleSquarePress(square)}
      >
        {piece && (
          <Text style={[styles.piece, { fontSize: squareSize * 0.7 }]}>
            {PIECE_SYMBOLS[piece as keyof typeof PIECE_SYMBOLS]}
          </Text>
        )}
        {isPossibleMove && !piece && <View style={styles.possibleMoveDot} />}
      </TouchableOpacity>
    );
  };


  // Render game info (check, checkmate, stalemate, etc.)
  const renderGameInfo = () => {
    const gs = gameState.gameState || {};
    if (gs.checkmate) {
      return <Text style={styles.checkmateText}>Checkmate! {gameState.winner ? (gameState.winner === playerColor ? 'You win!' : 'You lose!') : ''}</Text>;
    }
    if (gs.stalemate) {
      return <Text style={styles.stalemateText}>Stalemate</Text>;
    }
    if (gs.check) {
      return <Text style={styles.checkText}>Check</Text>;
    }
    if (gs.insufficientMaterial) {
      return <Text style={styles.stalemateText}>Draw: Insufficient Material</Text>;
    }
    if (gs.threefoldRepetition) {
      return <Text style={styles.stalemateText}>Draw: Threefold Repetition</Text>;
    }
    if (gs.fiftyMoveRule) {
      return <Text style={styles.stalemateText}>Draw: 50-move Rule</Text>;
    }
    if (gs.promotionAvailable) {
      return <Text style={styles.checkText}>Promotion Available</Text>;
    }
    if (gameState.result && gameState.result !== 'ongoing') {
      return <Text style={styles.stalemateText}>Game Over: {gameState.result}</Text>;
    }
    return null;
  };

  const renderBoard = () => {
    const files = boardFlipped ? [...FILES].reverse() : FILES;
    const ranks = boardFlipped ? [...RANKS].reverse() : RANKS;
    return (
      <View style={styles.board}>
        {ranks.map((rank) => (
          <View key={rank} style={styles.row}>
            {files.map((file) => renderSquare(file, rank))}
          </View>
        ))}
      </View>
    );
  };

  const renderPlayerInfo = (color: "white" | "black", isTop: boolean) => {
    const player = gameState.players[color];
    if (!player) {
      console.warn("Player Info undefined for color:", color, gameState.players);
      return (
        <View style={[styles.playerInfo, isTop && styles.playerInfoTop]}>
          <Text style={styles.playerName}>Unknown Player</Text>
        </View>
      );
    }
    // Use localTimers for smooth UI, fallback to backend if needed
    const timer = safeTimerValue(localTimers[color] !== undefined ? localTimers[color] : gameState.timeControl.timers[color]);
    const isActive = gameState.board.activeColor === color;
    const isMe = playerColor === color;

    return (
      <View style={[styles.playerInfo, isTop && styles.playerInfoTop]}>
        <View style={styles.playerLeft}>
          <Text style={[styles.playerName, isActive && styles.activePlayer]}>
            {player.username} {isMe && '(You)'}
          </Text>
          <Text style={styles.playerRating}>
            {player.rating > 0 ? `(${player.rating})` : '(Unrated)'}
          </Text>
        </View>
        <View style={[styles.timer, isActive && styles.activeTimer]}>
          <Text style={[styles.timerText, isActive && styles.activeTimerText]}>
            {formatTime(timer)}
          </Text>
        </View>
        {isMe && isActive && (
          <Text style={styles.yourTurnText}>Your Turn</Text>
        )}
        {isMe && !isActive && (
          <Text style={styles.waitingText}>Opponent's Turn</Text>
        )}
      </View>
    );
  };

  const renderMoveHistory = () => {
    if (!showMoveHistory) return null;
    
    const moves = moveHistory;
    const movePairs = [];
    
    for (let i = 0; i < moves.length; i += 2) {
      movePairs.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: moves[i],
        black: moves[i + 1] || ''
      });
    }
    
    return (
      <View style={styles.moveHistoryContainer}>
        <View style={styles.moveHistoryHeader}>
          <Text style={styles.moveHistoryTitle}>Move History</Text>
          <TouchableOpacity onPress={() => setShowMoveHistory(false)}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.moveHistoryScroll}>
          {movePairs.map((pair, index) => (
            <View key={index} style={styles.moveRow}>
              <Text style={styles.moveNumber}>{pair.moveNumber}.</Text>
              <Text style={styles.moveText}>{pair.white}</Text>
              <Text style={styles.moveText}>{pair.black}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const handleFlipBoard = () => {
    setBoardFlipped(!boardFlipped);
  };

  const opponentColor = playerColor === "white" ? "black" : "white";
  const topPlayer = boardFlipped ? playerColor : opponentColor;
  const bottomPlayer = boardFlipped ? opponentColor : playerColor;

  return (
    <View style={styles.container}>
      {renderPlayerInfo(topPlayer, true)}
      {renderGameInfo()}
      {renderBoard()}
      {renderPlayerInfo(bottomPlayer, false)}
      <GameControls
        socket={socket}
        sessionId={gameState.sessionId}
        gameStatus={gameState.status}
        canResign={gameState.status === "active"}
        canOfferDraw={gameState.status === "active"}
        onFlipBoard={handleFlipBoard}
      />
      {renderMoveHistory()}
      {/* Promotion Modal */}
      <Modal
        visible={!!promotionModal && promotionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPromotionModal(null)}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: '#23272A', padding: 24, borderRadius: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 18, marginBottom: 12 }}>Choose promotion piece</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
              {promotionModal && promotionModal.options.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={{ margin: 8, padding: 12, backgroundColor: '#36393F', borderRadius: 8 }}
                  onPress={() => handlePromotionSelect(p)}
                >
                  <Text style={{ color: '#fff', fontSize: 24 }}>{PIECE_SYMBOLS[p.toUpperCase()] || p.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setPromotionModal(null)} style={{ marginTop: 16 }}>
              <Text style={{ color: '#b0b3b8' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#23272A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  playerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2C2F33',
    borderRadius: 8,
    marginVertical: 5,
  },
  playerInfoTop: {
    marginBottom: 10,
  },
  playerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  activePlayer: {
    color: '#00A862',
  },
  playerRating: {
    color: '#b0b3b8',
    fontSize: 14,
  },
  timer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#36393F',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#40444B',
  },
  activeTimer: {
    backgroundColor: '#00A862',
    borderColor: '#00A862',
  },
  timerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  activeTimerText: {
    color: '#000',
  },
  gameInfo: {
    alignItems: 'center',
    marginVertical: 10,
  },
  gameTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  gameDescription: {
    color: '#b0b3b8',
    fontSize: 12,
    marginTop: 2,
  },
  checkText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 5,
  },
  checkmateText: {
    color: '#ff4757',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 5,
  },
  stalemateText: {
    color: '#ffa502',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 5,
  },
  waitingText: {
    color: '#ffd43b',
    fontSize: 12,
    marginTop: 5,
  },
  yourTurnText: {
    color: '#2ed573',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 5,
  },
  board: {
    borderWidth: 2,
    borderColor: '#40444B',
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
  },
  square: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  selectedSquare: {
    // backgroundColor: '#7dd3fc !important',
    // Border now handled inline
  },
  possibleMoveSquare: {
    // backgroundColor: '#86efac',
    // Border now handled inline
  },
  lastMoveSquare: {
    // backgroundColor: '#fbbf24',
    // Border now handled inline
  },
  piece: {
    color: '#000',
    fontWeight: 'bold',
    textShadowColor: '#fff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1,
  },
  possibleMoveDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    opacity: 0.7,
  },
  moveHistoryContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 200,
    height: 300,
    backgroundColor: '#2C2F33',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#40444B',
  },
  moveHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#40444B',
  },
  moveHistoryTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  closeButton: {
    color: '#b0b3b8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  moveHistoryScroll: {
    flex: 1,
    padding: 10,
  },
  moveRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  moveNumber: {
    color: '#b0b3b8',
    fontSize: 12,
    width: 25,
  },
  moveText: {
    color: '#fff',
    fontSize: 12,
    width: 35,
    marginHorizontal: 5,
  },
});