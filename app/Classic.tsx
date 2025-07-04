import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, SafeAreaView, StatusBar } from "react-native"

// Types
type PieceType = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn"
type PieceColor = "white" | "black"

interface ChessPiece {
  type: PieceType
  color: PieceColor
  hasMoved?: boolean
}

type Board = (ChessPiece | null)[][]
type Position = { row: number; col: number }

interface GameState {
  board: Board
  currentPlayer: PieceColor
  whiteTime: number
  blackTime: number
  whiteMoves: number
  blackMoves: number
  capturedByWhite: ChessPiece[]
  capturedByBlack: ChessPiece[]
  gameStatus: string
  isGameActive: boolean
}

// Chess piece symbols
const PIECE_SYMBOLS: Record<PieceColor, Record<PieceType, string>> = {
  white: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙",
  },
  black: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟",
  },
}

// Initial board setup
const createInitialBoard = (): Board => {
  const board: Board = Array(8)
    .fill(null)
    .map(() => Array(8).fill(null))

  // Place pawns
  for (let col = 0; col < 8; col++) {
    board[1][col] = { type: "pawn", color: "black" }
    board[6][col] = { type: "pawn", color: "white" }
  }

  // Place other pieces
  const pieceOrder: PieceType[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"]

  for (let col = 0; col < 8; col++) {
    board[0][col] = { type: pieceOrder[col], color: "black" }
    board[7][col] = { type: pieceOrder[col], color: "white" }
  }

  return board
}

const ChessApp: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    board: createInitialBoard(),
    currentPlayer: "white",
    whiteTime: 600, // 10 minutes in seconds
    blackTime: 600,
    whiteMoves: 0,
    blackMoves: 0,
    capturedByWhite: [],
    capturedByBlack: [],
    gameStatus: "Game in progress",
    isGameActive: true,
  })

  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null)
  const [validMoves, setValidMoves] = useState<Position[]>([])

  // Timer effect
  useEffect(() => {
    if (!gameState.isGameActive) return

    const timer = setInterval(() => {
      setGameState((prev) => {
        if (prev.currentPlayer === "white" && prev.whiteTime > 0) {
          return { ...prev, whiteTime: prev.whiteTime - 1 }
        } else if (prev.currentPlayer === "black" && prev.blackTime > 0) {
          return { ...prev, blackTime: prev.blackTime - 1 }
        } else {
          return {
            ...prev,
            isGameActive: false,
            gameStatus: `${prev.currentPlayer === "white" ? "Black" : "White"} wins on time!`,
          }
        }
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [gameState.currentPlayer, gameState.isGameActive])

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Check if position is valid
  const isValidPosition = (row: number, col: number): boolean => {
    return row >= 0 && row < 8 && col >= 0 && col < 8
  }

  // Get all possible moves for a piece
  const getPossibleMoves = useCallback(
    (piece: ChessPiece, fromRow: number, fromCol: number, board: Board): Position[] => {
      const moves: Position[] = []
      const { type, color } = piece

      const addMove = (row: number, col: number) => {
        if (isValidPosition(row, col)) {
          const targetPiece = board[row][col]
          if (!targetPiece || targetPiece.color !== color) {
            moves.push({ row, col })
          }
          return !targetPiece
        }
        return false
      }

      switch (type) {
        case "pawn":
          const direction = color === "white" ? -1 : 1
          const startRow = color === "white" ? 6 : 1

          // Forward move
          if (isValidPosition(fromRow + direction, fromCol) && !board[fromRow + direction][fromCol]) {
            moves.push({ row: fromRow + direction, col: fromCol })

            // Double move from starting position
            if (fromRow === startRow && !board[fromRow + 2 * direction][fromCol]) {
              moves.push({ row: fromRow + 2 * direction, col: fromCol })
            }
          }
          // Diagonal captures
          ;[-1, 1].forEach((colOffset) => {
            const newRow = fromRow + direction
            const newCol = fromCol + colOffset
            if (isValidPosition(newRow, newCol)) {
              const targetPiece = board[newRow][newCol]
              if (targetPiece && targetPiece.color !== color) {
                moves.push({ row: newRow, col: newCol })
              }
            }
          })
          break

        case "rook":
          const rookDirections = [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
          ]
          rookDirections.forEach(([dRow, dCol]) => {
            for (let i = 1; i < 8; i++) {
              if (!addMove(fromRow + i * dRow, fromCol + i * dCol)) break
            }
          })
          break

        case "bishop":
          const bishopDirections = [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]
          bishopDirections.forEach(([dRow, dCol]) => {
            for (let i = 1; i < 8; i++) {
              if (!addMove(fromRow + i * dRow, fromCol + i * dCol)) break
            }
          })
          break

        case "queen":
          const queenDirections = [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]
          queenDirections.forEach(([dRow, dCol]) => {
            for (let i = 1; i < 8; i++) {
              if (!addMove(fromRow + i * dRow, fromCol + i * dCol)) break
            }
          })
          break

        case "king":
          const kingDirections = [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]
          kingDirections.forEach(([dRow, dCol]) => {
            addMove(fromRow + dRow, fromCol + dCol)
          })
          break

        case "knight":
          const knightMoves = [
            [2, 1],
            [2, -1],
            [-2, 1],
            [-2, -1],
            [1, 2],
            [1, -2],
            [-1, 2],
            [-1, -2],
          ]
          knightMoves.forEach(([dRow, dCol]) => {
            addMove(fromRow + dRow, fromCol + dCol)
          })
          break
      }

      return moves
    },
    [],
  )

  // Check if king is in check
  const isKingInCheck = useCallback(
    (board: Board, kingColor: PieceColor): boolean => {
      let kingPos: Position | null = null

      // Find the king
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const piece = board[row][col]
          if (piece && piece.type === "king" && piece.color === kingColor) {
            kingPos = { row, col }
            break
          }
        }
        if (kingPos) break
      }

      if (!kingPos) return false

      // Check if any opponent piece can attack the king
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const piece = board[row][col]
          if (piece && piece.color !== kingColor) {
            const moves = getPossibleMoves(piece, row, col, board)
            if (moves.some((move) => move.row === kingPos!.row && move.col === kingPos!.col)) {
              return true
            }
          }
        }
      }

      return false
    },
    [getPossibleMoves],
  )

  // Handle square press
  const handleSquarePress = useCallback(
    (row: number, col: number) => {
      if (!gameState.isGameActive) return

      if (selectedSquare) {
        const isValidMove = validMoves.some((move) => move.row === row && move.col === col)

        if (isValidMove) {
          const newBoard = gameState.board.map((r) => [...r])
          const piece = newBoard[selectedSquare.row][selectedSquare.col]
          const capturedPiece = newBoard[row][col]

          if (piece) {
            // Make the move
            newBoard[row][col] = { ...piece, hasMoved: true }
            newBoard[selectedSquare.row][selectedSquare.col] = null

            // Check if this move puts own king in check
            if (!isKingInCheck(newBoard, gameState.currentPlayer)) {
              setGameState((prev) => {
                const newState = { ...prev }
                newState.board = newBoard

                // Update captured pieces
                if (capturedPiece) {
                  if (gameState.currentPlayer === "white") {
                    newState.capturedByWhite = [...prev.capturedByWhite, capturedPiece]
                  } else {
                    newState.capturedByBlack = [...prev.capturedByBlack, capturedPiece]
                  }
                }

                // Update move count
                if (gameState.currentPlayer === "white") {
                  newState.whiteMoves = prev.whiteMoves + 1
                } else {
                  newState.blackMoves = prev.blackMoves + 1
                }

                // Switch players
                newState.currentPlayer = gameState.currentPlayer === "white" ? "black" : "white"

                // Check for check
                if (isKingInCheck(newBoard, newState.currentPlayer)) {
                  newState.gameStatus = `${newState.currentPlayer === "white" ? "White" : "Black"} is in check!`
                } else {
                  newState.gameStatus = "Game in progress"
                }

                return newState
              })
            }
          }
        }

        setSelectedSquare(null)
        setValidMoves([])
      } else {
        const piece = gameState.board[row][col]
        if (piece && piece.color === gameState.currentPlayer) {
          setSelectedSquare({ row, col })
          const moves = getPossibleMoves(piece, row, col, gameState.board)
          setValidMoves(moves)
        }
      }
    },
    [selectedSquare, validMoves, gameState, getPossibleMoves, isKingInCheck],
  )

  // Render captured pieces
  const renderCapturedPieces = (pieces: ChessPiece[]) => {
    return (
      <View style={styles.capturedPieces}>
        {pieces.map((piece, index) => (
          <Text key={index} style={styles.capturedPiece}>
            {PIECE_SYMBOLS[piece.color][piece.type]}
          </Text>
        ))}
      </View>
    )
  }

  // Render player info
  const renderPlayerInfo = (color: PieceColor, isTop: boolean) => {
    const isCurrentPlayer = gameState.currentPlayer === color
    const time = color === "white" ? gameState.whiteTime : gameState.blackTime
    const moves = color === "white" ? gameState.whiteMoves : gameState.blackMoves
    const capturedPieces = color === "white" ? gameState.capturedByWhite : gameState.capturedByBlack

    return (
      <View style={[styles.playerInfo, isCurrentPlayer && styles.activePlayer]}>
        <View style={styles.playerHeader}>
          <Text style={styles.playerName}>{color === "white" ? "Player 1 (White)" : "Player 2 (Black)"}</Text>
          <Text style={[styles.timer, time < 60 && styles.timerWarning]}>{formatTime(time)}</Text>
        </View>
        <View style={styles.playerStats}>
          <Text style={styles.moveCount}>Moves: {moves}</Text>
          {renderCapturedPieces(capturedPieces)}
        </View>
      </View>
    )
  }

  // Render chess square
  const renderSquare = (row: number, col: number) => {
    const piece = gameState.board[row][col]
    const isSelected = selectedSquare?.row === row && selectedSquare?.col === col
    const isValidMove = validMoves.some((move) => move.row === row && move.col === col)
    const isLight = (row + col) % 2 === 0

    return (
      <TouchableOpacity
        key={`${row}-${col}`}
        style={[
          styles.square,
          isLight ? styles.lightSquare : styles.darkSquare,
          isSelected && styles.selectedSquare,
          isValidMove && styles.validMoveSquare,
        ]}
        onPress={() => handleSquarePress(row, col)}
      >
        {piece && <Text style={styles.piece}>{PIECE_SYMBOLS[piece.color][piece.type]}</Text>}
        {isValidMove && !piece && <View style={styles.validMoveDot} />}
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#312e2b" />

      {/* Black player info (top) */}
      {renderPlayerInfo("black", true)}

      {/* Chess board */}
      <View style={styles.boardContainer}>
        <View style={styles.board}>
          {gameState.board.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {row.map((_, colIndex) => renderSquare(rowIndex, colIndex))}
            </View>
          ))}
        </View>
      </View>

      {/* White player info (bottom) */}
      {renderPlayerInfo("white", false)}

      {/* Game status */}
      <View style={styles.statusContainer}>
        <Text style={styles.gameStatus}>{gameState.gameStatus}</Text>
      </View>
    </SafeAreaView>
  )
}

const { width } = Dimensions.get("window")
const squareSize = (width - 40) / 8

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#312e2b",
  },
  playerInfo: {
    backgroundColor: "#262421",
    margin: 10,
    padding: 15,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  activePlayer: {
    borderColor: "#81b64c",
    backgroundColor: "#2a2724",
  },
  playerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  playerName: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  timer: {
    color: "#81b64c",
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  timerWarning: {
    color: "#ff4444",
  },
  playerStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moveCount: {
    color: "#ccc",
    fontSize: 14,
  },
  capturedPieces: {
    flexDirection: "row",
    flexWrap: "wrap",
    flex: 1,
    justifyContent: "flex-end",
  },
  capturedPiece: {
    fontSize: 16,
    marginLeft: 2,
  },
  boardContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  board: {
    borderWidth: 3,
    borderColor: "#8B4513",
    borderRadius: 8,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
  },
  square: {
    width: squareSize,
    height: squareSize,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  lightSquare: {
    backgroundColor: "#f0d9b5",
  },
  darkSquare: {
    backgroundColor: "#b58863",
  },
  selectedSquare: {
    backgroundColor: "#7dd3fc",
  },
  validMoveSquare: {
    backgroundColor: "#86efac",
  },
  piece: {
    fontSize: squareSize * 0.7,
    textAlign: "center",
  },
  validMoveDot: {
    width: squareSize * 0.3,
    height: squareSize * 0.3,
    borderRadius: squareSize * 0.15,
    backgroundColor: "#22c55e",
    opacity: 0.7,
  },
  statusContainer: {
    padding: 15,
    alignItems: "center",
  },
  gameStatus: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
})

export default ChessApp
