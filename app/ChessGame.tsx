import React, { useEffect, useRef, useState } from "react";
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
  };
  status: string;
  result: string;
  moves: string[];
  moveCount: number;
  lastMove: string | null;
  gameState: {
    check: boolean;
    checkmate: boolean;
    stalemate: boolean;
  };
  userColor: {
    [key: string]: "white" | "black";
  };
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
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Timer effect: decrement timer for active player every second
useEffect(() => {
  if (gameState.status !== "active") {
    if (timerRef.current) clearInterval(timerRef.current);
    return;
  }
  if (timerRef.current) clearInterval(timerRef.current);
  if (!isMyTurn && gameState.board.activeColor !== playerColor) {
    // Not my turn, but still decrement opponent's timer
    timerRef.current = setInterval(() => {
      setGameState(prev => {
        const color = prev.board.activeColor;
        return {
          ...prev,
          timeControl: {
            ...prev.timeControl,
            timers: {
              ...prev.timeControl.timers,
              [color]: Math.max(0, prev.timeControl.timers[color] - 1000)
            }
          }
        };
      });
    }, 1000);
  } else if (isMyTurn) {
    timerRef.current = setInterval(() => {
      setGameState(prev => {
        const color = prev.board.activeColor;
        return {
          ...prev,
          timeControl: {
            ...prev.timeControl,
            timers: {
              ...prev.timeControl.timers,
              [color]: Math.max(0, prev.timeControl.timers[color] - 1000)
            }
          }
        };
      });
    }, 1000);
  }
  return () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };
}, [isMyTurn, gameState.status, gameState.board.activeColor]);

  // Handles the 'game:move' event from the server
  const handleGameMove = (data: any) => {
    // data: { move: {from, to, ...}, gameState: {...} }
    console.log("Move received:", data);
    if (data && data.gameState) {
      setGameState(prevState => ({
        ...prevState,
        ...data.gameState
      }));
      setMoveHistory(data.gameState.moves || []);
      setSelectedSquare(null);
      setPossibleMoves([]);
      setIsMyTurn(data.gameState.board.activeColor === playerColor);
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
    setGameState(prevState => ({
      ...prevState,
      timeControl: {
        ...prevState.timeControl,
        timers: data.timers || {
          white: data.timers || prevState.timeControl.timers.white,
          black: data.black || prevState.timeControl.timers.black
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
    // Convert move object to string format (e.g., "e2e4")
    const moveStr = move.promotion
      ? `${move.from}${move.to}${move.promotion}`
      : `${move.from}${move.to}`;
    // Optimistically update the board for immediate feedback
    setGameState(prevState => {
      let newPosition = updatePositionString(prevState.board.position, move.from, move.to);
      let newActiveColor: 'white' | 'black' = playerColor === 'white' ? 'black' : 'white';
      let newState: GameState = {
        ...prevState,
        lastMove: moveStr,
        board: {
          ...prevState.board,
          position: newPosition,
          activeColor: newActiveColor,
        },
      };
      return newState;
    });
    setIsMyTurn(false);
    setSelectedSquare(null);
    setPossibleMoves([]);
    socket.emit("game:makeMove", {
      move: moveStr,
      timestamp: Math.floor(Date.now() / 1000)
    });
    console.log('[DEBUG] Move emitted:', moveStr);
  };

  const handleSquarePress = (square: string) => {
    if (selectedSquare === square) {
      // Deselect if clicking the same square
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }

    if (selectedSquare && possibleMoves.includes(square)) {
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

  const getPieceAt = (square: string): string | null => {
    const fileIndex = FILES.indexOf(square[0]);
    const rankIndex = parseInt(square[1]) - 1;
    const boardIndex = (7 - rankIndex) * 8 + fileIndex;
    console.log("Board Positions", gameState.board.position);
    
    const position = gameState.board.position.replace(/\//g, '');
    let currentIndex = 0;
    
    for (let char of position) {
      if (char >= '1' && char <= '8') {
        currentIndex += parseInt(char);
      } else {
        if (currentIndex === boardIndex) {
          return char;
        }
        currentIndex++;
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
    const isLastMove = gameState.lastMove && (gameState.lastMove.includes(square));
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
    const timer = gameState.timeControl.timers[color];
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
      {/* {renderGameInfo()} */}
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