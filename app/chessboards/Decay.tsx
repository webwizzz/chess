"use client"

import { getSocketInstance } from "@/utils/socketManager"
import { useRouter } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import type { Socket } from "socket.io-client"
import { getPieceComponent } from "../chessPieces"

// Types
interface Player {
  userId: string
  username: string
  rating: number
  avatar: string | null
  title: string | null
}

interface GameState {
  sessionId: string
  variantName: string
  subvariantName?: string
  description: string
  players: {
    white: Player
    black: Player
  }
  board: {
    fen: string
    position: string
    activeColor: "white" | "black"
    castlingRights: string
    enPassantSquare: string
    halfmoveClock: number
    fullmoveNumber: number
    whiteTime?: number
    blackTime?: number
    turnStartTimestamp?: number
    lastMoveTimestamp?: number
    moveHistory?: { from: string; to: string; [key: string]: any }[]
    repetitionMap?: any
    gameStarted?: boolean
    firstMoveTimestamp?: number
    capturedPieces?: {
      white: string[]
      black: string[]
    }
  }
  timeControl: {
    type: string
    baseTime: number
    increment: number
    timers: {
      white: number
      black: number
    }
    flagged: {
      white: boolean
      black: boolean
    }
    timeSpent?: { white: any; black: any }
  }
  status: string
  result: string
  resultReason?: string | null
  winner?: string | null
  moves: any[]
  moveCount: number
  lastMove: any
  gameState: {
    valid?: boolean
    move?: any
    state?: any
    result?: string
    check?: boolean
    checkmate?: boolean
    stalemate?: boolean
    insufficientMaterial?: boolean
    threefoldRepetition?: boolean
    fiftyMoveRule?: boolean
    canCastleKingside?: { white?: boolean; black?: boolean }
    canCastleQueenside?: { white?: boolean; black?: boolean }
    promotionAvailable?: boolean
    lastMove?: any
    winner?: string | null
    drawReason?: string | null
    gameEnded?: boolean
    endReason?: string | null
    endTimestamp?: number
    decayActive?: boolean
    queenDecayTimers?: any
    majorPieceDecayTimers?: any
    frozenPieces?: any
  }
  userColor: {
    [key: string]: "white" | "black"
  }
  positionHistory?: string[]
  createdAt?: number
  lastActivity?: number
  startedAt?: number
  endedAt?: number | null
  rules?: any
  metadata?: any
  timers?: any
}

interface Move {
  from: string
  to: string
  promotion?: string
}

interface DecayChessGameProps {
  initialGameState: GameState
  userId: string
  onNavigateToMenu?: () => void
}

// Decay timer state for individual pieces
interface DecayTimer {
  timeLeft: number // in milliseconds
  isActive: boolean
  moveCount: number // how many times this piece has been moved
  pieceSquare: string // track which square the piece is on
}

// Track decay timers for each piece position
interface DecayState {
  [square: string]: DecayTimer
}

const PIECE_VALUES = {
  p: 1,
  P: 1,
  n: 3,
  N: 3,
  b: 3,
  B: 3,
  r: 5,
  R: 5,
  q: 9,
  Q: 9,
  k: 0,
  K: 0,
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"]
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"]

// Major pieces that can have decay timers (excluding pawns and king)
const MAJOR_PIECES = ["q", "r", "b", "n", "Q", "R", "B", "N"]

// Decay timer constants
const QUEEN_INITIAL_DECAY_TIME = 25000 // 25 seconds
const MAJOR_PIECE_INITIAL_DECAY_TIME = 20000 // 20 seconds
const DECAY_TIME_INCREMENT = 2000 // +2 seconds per additional move

// Responsive sizing constants - Chess.com style like classic
const screenWidth = Dimensions.get("window").width
const screenHeight = Dimensions.get("window").height
const isTablet = Math.min(screenWidth, screenHeight) > 600
const isSmallScreen = screenWidth < 380
const isVerySmallScreen = screenWidth < 320

// Calculate optimal sizing to fit everything on screen
const statusBarHeight = isSmallScreen ? 44 : isTablet ? 44 : 44
const bottomBarHeight = isSmallScreen ? 60 : 65
const topPadding = isSmallScreen ? 20 : isTablet ? 40 : 25
const bottomPadding = 10

// Available height for content (excluding status bar, padding, and bottom bar)
const availableHeight = screenHeight - statusBarHeight - topPadding - bottomPadding - bottomBarHeight

// Fixed component heights that fit on screen
const playerInfoHeight = isSmallScreen ? 70 : isTablet ? 90 : 80  // Reduced to fit on screen
const gameStatusHeight = isSmallScreen ? 0 : isTablet ? 0 : 0  // Removed height for seamless connection
const totalComponentsHeight = (playerInfoHeight * 2) + gameStatusHeight

// Chess.com style board sizing - full width like classic
const boardSize = screenWidth
const squareSize = boardSize / 8

// Reduced spacing to maximize board size
const verticalSpacing = isSmallScreen ? 4 : isTablet ? 8 : 6
const componentSpacing = isSmallScreen ? 2 : isTablet ? 4 : 3 // Reduced spacing for tighter layout like classic

// Other constants
const decayTimerFontSize = isSmallScreen ? 7 : 9
const pieceFontSize = squareSize * (isSmallScreen ? 0.6 : isTablet ? 0.7 : 0.65)

// Format decay timer in MM:SS format
const formatDecayTimeMinutes = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0:00"
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

// FIXED: Move safeTimerValue outside component to prevent re-renders
function safeTimerValue(val: any): number {
  const n = Number(val)
  return isNaN(n) || n === undefined || n === null ? 0 : Math.max(0, n)
}

export default function DecayChessGame({ initialGameState, userId, onNavigateToMenu }: DecayChessGameProps) {
  const router = useRouter()
  const [gameState, setGameState] = useState<GameState>(initialGameState)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [possibleMoves, setPossibleMoves] = useState<string[]>([])
  const [isMyTurn, setIsMyTurn] = useState(false)
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white")
  const [boardFlipped, setBoardFlipped] = useState(false)
  const [moveHistory, setMoveHistory] = useState<string[]>([])
  const [showMoveHistory, setShowMoveHistory] = useState(false)
  const [promotionModal, setPromotionModal] = useState<{
    visible: boolean
    from: string
    to: string
    options: string[]
  } | null>(null)

  // Decay-specific state - FIXED STRUCTURE
  const [decayState, setDecayState] = useState<{
    white: DecayState
    black: DecayState
  }>({
    white: {},
    black: {},
  })

  const [frozenPieces, setFrozenPieces] = useState<{
    white: Set<string>
    black: Set<string>
  }>({
    white: new Set(),
    black: new Set(),
  })

  // Track which queens have moved to activate decay system
  const [queenMoved, setQueenMoved] = useState<{
    white: boolean
    black: boolean
  }>({
    white: false,
    black: false,
  })

  // Game ending state
  const [showGameEndModal, setShowGameEndModal] = useState(false)
  const [gameEndMessage, setGameEndMessage] = useState("")
  const [isWinner, setIsWinner] = useState<boolean | null>(null)
  const [gameEndDetails, setGameEndDetails] = useState<{
    reason?: string
    moveSan?: string
    moveMaker?: string
    winner?: string | null
    winnerName?: string | null
  }>({})

  // Timer management - FIXED
  const timerRef = useRef<any>(null)
  const decayTimerRef = useRef<any>(null)
  const navigationTimeoutRef = useRef<any>(null)

  const [localTimers, setLocalTimers] = useState<{ white: number; black: number }>({
    white: safeTimerValue(initialGameState.timeControl.timers.white),
    black: safeTimerValue(initialGameState.timeControl.timers.black),
  })

  const lastServerSync = useRef<{
    white: number
    black: number
    activeColor: "white" | "black"
    timestamp: number
    turnStartTime: number
    isFirstMove: boolean
  }>({
    white: safeTimerValue(initialGameState.timeControl.timers.white),
    black: safeTimerValue(initialGameState.timeControl.timers.black),
    activeColor: initialGameState.board.activeColor,
    timestamp: Date.now(),
    turnStartTime: Date.now(),
    isFirstMove: true,
  })

  // Helper functions
  const isQueen = useCallback((piece: string): boolean => {
    return piece.toLowerCase() === "q"
  }, [])

  const isMajorPiece = useCallback((piece: string): boolean => {
    return MAJOR_PIECES.includes(piece)
  }, [])

  const getPieceColor = useCallback((piece: string): "white" | "black" => {
    return piece === piece.toUpperCase() ? "white" : "black"
  }, [])

  const getPieceAt = useCallback(
    (square: string): string | null => {
      const fileIndex = FILES.indexOf(square[0])
      const rankIndex = RANKS.indexOf(square[1])
      if (fileIndex === -1 || rankIndex === -1) return null

      const fen = gameState.board.fen || gameState.board.position
      if (!fen) return null

      // Only use the piece placement part (before first space)
      const piecePlacement = fen.split(" ")[0]
      const rows = piecePlacement.split("/")
      if (rows.length !== 8) return null

      const row = rows[rankIndex]
      let col = 0
      for (let i = 0; i < row.length; i++) {
        const c = row[i]
        if (c >= "1" && c <= "8") {
          col += Number.parseInt(c)
        } else {
          if (col === fileIndex) {
            return c
          }
          col++
        }
      }
      return null
    },
    [gameState.board.fen, gameState.board.position],
  )

  const isPieceOwnedByPlayer = useCallback((piece: string, color: "white" | "black"): boolean => {
    if (color === "white") {
      return piece === piece.toUpperCase()
    } else {
      return piece === piece.toLowerCase()
    }
  }, [])

  // Utility: Remove decay timers and frozen state for captured pieces
  const cleanupCapturedPieces = useCallback(
    (newBoard: GameState["board"]) => {
      // Get all occupied squares from the new board
      const occupiedSquares = new Set<string>()
      const fen = newBoard.fen || newBoard.position
      if (fen) {
        const piecePlacement = fen.split(" ")[0]
        const rows = piecePlacement.split("/")
        for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
          let fileIdx = 0
          for (const c of rows[rankIdx]) {
            if (c >= "1" && c <= "8") {
              fileIdx += Number.parseInt(c, 10)
            } else {
              if (fileIdx < 8) {
                occupiedSquares.add(`${FILES[fileIdx]}${RANKS[rankIdx]}`)
                fileIdx++
              }
            }
          }
        }
      }

      // Remove decay timers for squares that are no longer occupied
      setDecayState((prev) => {
        const newState = { white: { ...prev.white }, black: { ...prev.black } }
        ;(["white", "black"] as const).forEach((color) => {
          Object.keys(newState[color]).forEach((sq) => {
            if (!occupiedSquares.has(sq)) {
              delete newState[color][sq]
            }
          })
        })
        return newState
      })

      // Remove frozen state for squares that are no longer occupied
      setFrozenPieces((prev) => {
        const newFrozen = { white: new Set(prev.white), black: new Set(prev.black) }
        ;(["white", "black"] as const).forEach((color) => {
          for (const sq of newFrozen[color]) {
            if (!occupiedSquares.has(sq)) {
              console.log(`[UNFREEZE] Removing frozen state from ${sq} (${color})`)
              newFrozen[color].delete(sq)
            }
          }
        })
        return newFrozen
      })
    },
    [], // No dependencies needed as it only uses setters and local variables
  )

  // FIXED: Start decay timer for a piece
  const startDecayTimer = useCallback(
    (square: string, piece: string) => {
      const pieceColor = getPieceColor(piece)
      const isQueenPiece = isQueen(piece)

      setDecayState((prev) => {
        const newState = { ...prev }
        const colorState = { ...newState[pieceColor] }
        const existingTimer = colorState[square]

        let decayTime: number
        let moveCount: number

        if (existingTimer) {
          // Increment by 2 seconds, cap at 25s
          decayTime = Math.min(existingTimer.timeLeft + DECAY_TIME_INCREMENT, 25000)
          moveCount = existingTimer.moveCount + 1
        } else {
          // Start with initial value
          decayTime = isQueenPiece ? QUEEN_INITIAL_DECAY_TIME : MAJOR_PIECE_INITIAL_DECAY_TIME
          moveCount = 1
        }

        colorState[square] = {
          timeLeft: decayTime,
          isActive: true,
          moveCount,
          pieceSquare: square,
        }

        newState[pieceColor] = colorState
        return newState
      })

      console.log(
        `[DECAY] Started decay timer for ${piece} at ${square}: ${isQueenPiece ? QUEEN_INITIAL_DECAY_TIME : MAJOR_PIECE_INITIAL_DECAY_TIME}ms`,
      )
    },
    [getPieceColor, isQueen],
  )

  // FIXED: Freeze a piece when decay timer expires
  const freezePiece = useCallback((square: string, color: "white" | "black") => {
    console.log(`[DECAY] Freezing piece at ${square} for ${color}`)
    setFrozenPieces((prev) => {
      const newFrozen = { ...prev }
      newFrozen[color] = new Set([...newFrozen[color], square])
      return newFrozen
    })

    // Remove the decay timer when piece is frozen
    setDecayState((prev) => {
      const newState = { ...prev }
      const colorState = { ...newState[color] }
      delete colorState[square]
      newState[color] = colorState
      return newState
    })
  }, [])

  // FIXED: Move piece in decay state when a move is made
  const movePieceInDecayState = useCallback(
    (from: string, to: string, piece: string) => {
      const pieceColor = getPieceColor(piece)
      const opponentColor = pieceColor === "white" ? "black" : "white"

      setDecayState((prev) => {
        const newState = { ...prev }
        const colorState = { ...newState[pieceColor] }

        // If the piece being moved has a decay timer, move it to the new square
        if (colorState[from]) {
          colorState[to] = {
            ...colorState[from],
            pieceSquare: to,
            isActive: true,
          }
          delete colorState[from]
          console.log(`[DECAY] Moved timer from ${from} to ${to} for ${piece}`)
        }

        newState[pieceColor] = colorState
        return newState
      })

      setFrozenPieces((prev) => {
        const newFrozen = { ...prev }

        // --- FIX: Always remove opponent's frozen state from the destination square ---
        if (newFrozen[opponentColor].has(to)) {
          newFrozen[opponentColor] = new Set(newFrozen[opponentColor])
          newFrozen[opponentColor].delete(to)
        }

        // Only transfer frozen state if the moving piece was frozen
        if (newFrozen[pieceColor].has(from)) {
          newFrozen[pieceColor] = new Set(newFrozen[pieceColor])
          newFrozen[pieceColor].delete(from)
          newFrozen[pieceColor].add(to)
        }

        return newFrozen
      })
    },
    [getPieceColor],
  )

  // FIXED: Handle decay logic for a move - CORE REQUIREMENT IMPLEMENTATION
  const handleDecayMove = useCallback(
    (from: string, to: string, piece?: string) => {
      const movedPiece = piece || getPieceAt(from)
      if (!movedPiece) return

      const pieceColor = getPieceColor(movedPiece)

      // Move the piece in decay state first
      movePieceInDecayState(from, to, movedPiece)

      // Handle queen moves - CORE REQUIREMENT
      if (isQueen(movedPiece)) {
        // Mark that this color's queen has moved
        setQueenMoved((prev) => ({ ...prev, [pieceColor]: true }))

        // Start or update decay timer for queen
        startDecayTimer(to, movedPiece)
        console.log(`[DECAY] Queen moved for ${pieceColor}, decay timer started/updated`)
      }
      // Handle major piece moves (only after queen has moved for this color)
      else if (isMajorPiece(movedPiece)) {
        // Check if queen has moved and is either frozen or not present on the board
        const queenSquares = Array.from({ length: 8 * 8 }, (_, i) => {
          const file = FILES[i % 8]
          const rank = RANKS[Math.floor(i / 8)]
          return `${file}${rank}`
        })

        const queenOnBoard = queenSquares.some((sq) => {
          const piece = getPieceAt(sq)
          return piece && isQueen(piece) && getPieceColor(piece) === pieceColor
        })

        const hasQueenFrozen = Array.from(frozenPieces[pieceColor]).some((square) => {
          const piece = getPieceAt(square)
          return piece && isQueen(piece)
        })

        // Start decay timer if queen has moved and is either frozen or not present
        if (queenMoved[pieceColor] && (hasQueenFrozen || !queenOnBoard)) {
          startDecayTimer(to, movedPiece)
          console.log(`[DECAY] Major piece ${movedPiece} moved for ${pieceColor}, decay timer started`)
        }
      }
    },
    [
      getPieceAt,
      getPieceColor,
      movePieceInDecayState,
      isQueen,
      isMajorPiece,
      startDecayTimer,
      frozenPieces,
      queenMoved,
    ],
  )

  // FIXED: Decay timer countdown effect
  useEffect(() => {
    if (decayTimerRef.current) {
      clearInterval(decayTimerRef.current)
    }

    if (gameState.status !== "active") {
      return
    }

    console.log("[DECAY] Setting up decay timer management")

    decayTimerRef.current = setInterval(() => {
      setDecayState((prev) => {
        const newState = { ...prev }
        let hasChanges = false

        // Handle both players' timers
        ;["white", "black"].forEach((color) => {
          const colorState = { ...newState[color as "white" | "black"] }
          const isPlayerTurn = gameState.board.activeColor === color

          Object.keys(colorState).forEach((square) => {
            const timer = colorState[square]
            if (timer && timer.timeLeft > 0 && timer.isActive) {
              // Only countdown during player's turn
              if (isPlayerTurn) {
                timer.timeLeft = Math.max(0, timer.timeLeft - 100)
                hasChanges = true

                // Log timer updates for debugging
                if (timer.timeLeft % 1000 === 0) {
                  console.log(`[DECAY] ${color} ${square}: ${Math.floor(timer.timeLeft / 1000)}s remaining`)
                }

                // Freeze piece if timer expires
                if (timer.timeLeft <= 0) {
                  console.log(`[DECAY] Timer expired for piece at ${square}`)
                  setTimeout(() => freezePiece(square, color as "white" | "black"), 0)
                }
              }
            }
          })

          newState[color as "white" | "black"] = colorState
        })

        return hasChanges ? newState : prev
      })
    }, 100) // Update every 100ms

    return () => {
      if (decayTimerRef.current) {
        clearInterval(decayTimerRef.current)
        console.log("[DECAY] Cleared decay timer interval")
      }
    }
  }, [gameState.status, gameState.board.activeColor, freezePiece])

  // Function to handle game ending
  const handleGameEnd = useCallback(
    (
      result: string,
      winner: string | null,
      endReason: string,
      details?: { moveSan?: string; moveMaker?: string; winnerName?: string | null },
    ) => {
      console.log("[GAME END] Result:", result, "Winner:", winner, "Reason:", endReason)

      // Stop all timers
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (decayTimerRef.current) {
        clearInterval(decayTimerRef.current)
      }

      // Determine if current player won
      let playerWon: boolean | null = null
      let message = ""

      if (result === "checkmate") {
        if (winner === playerColor) {
          playerWon = true
          message = "🎉 VICTORY! 🎉\nCheckmate! You won the game!"
        } else if (winner && winner !== playerColor) {
          playerWon = false
          message = "😔 DEFEAT 😔\nCheckmate! You lost the game."
        } else {
          playerWon = null
          message = "🏁 GAME OVER 🏁\nCheckmate occurred"
        }
      } else if (result === "timeout") {
        if (winner === playerColor) {
          playerWon = true
          message = "🎉 VICTORY! 🎉\nYour opponent ran out of time!"
        } else if (winner && winner !== playerColor) {
          playerWon = false
          message = "😔 DEFEAT 😔\nYou ran out of time!"
        } else {
          playerWon = null
          message = "🏁 GAME OVER 🏁\nTime expired"
        }
      } else if (result === "draw") {
        playerWon = null
        message = `⚖️ DRAW ⚖️\n${endReason || "Game ended in a draw"}`
      } else {
        playerWon = null
        message = `🏁 GAME OVER 🏁\n${result}`
      }

      setIsWinner(playerWon)
      setGameEndMessage(message)
      setShowGameEndModal(true)
      setGameEndDetails({
        reason: endReason,
        moveSan: details?.moveSan,
        moveMaker: details?.moveMaker,
        winner,
        winnerName: details?.winnerName,
      })

      // Disconnect socket after a short delay
      setTimeout(() => {
        if (socket) {
          console.log("[SOCKET] Disconnecting from game")
          socket.disconnect()
          setSocket(null)
        }
      }, 1000)

      // Auto-navigate to menu after showing the message
      navigationTimeoutRef.current = setTimeout(() => {
        setShowGameEndModal(false)
        if (onNavigateToMenu) {
          onNavigateToMenu()
        }
        router.replace("/choose")
      }, 5000)
    },
    [playerColor, socket, onNavigateToMenu, router],
  )

  // Function to manually navigate to menu
  const navigateToMenu = useCallback(() => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current)
    }
    setShowGameEndModal(false)
    if (socket) {
      socket.disconnect()
      setSocket(null)
    }
    if (onNavigateToMenu) {
      onNavigateToMenu()
    }
  }, [socket, onNavigateToMenu])

  // Initialize game
  useEffect(() => {
    const gameSocket = getSocketInstance()
    if (gameSocket) {
      setSocket(gameSocket)
      console.log("Connected to game socket")
    }

    if (!gameSocket) {
      console.error("Failed to connect to game socket")
      Alert.alert("Connection Error", "Failed to connect to game socket. Please try again.")
      return
    }

    // Initial player color and board orientation
    const userColor = gameState.userColor[userId]
    const safePlayerColor = userColor === "white" || userColor === "black" ? userColor : "white"
    setPlayerColor(safePlayerColor)
    setBoardFlipped(safePlayerColor === "black")
    setIsMyTurn(gameState.board.activeColor === safePlayerColor)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (decayTimerRef.current) {
        clearInterval(decayTimerRef.current)
      }
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current)
      }
    }
  }, [gameState.userColor, userId, gameState.board.activeColor])

  // Update player state when game state changes
  useEffect(() => {
    const userColor = gameState.userColor[userId]
    const safePlayerColor = userColor === "white" || userColor === "black" ? userColor : "white"
    setPlayerColor(safePlayerColor)
    setBoardFlipped(safePlayerColor === "black")
    setIsMyTurn(gameState.board.activeColor === safePlayerColor)
  }, [gameState, userId])

  // FIXED: Improved timer effect with proper turn-based countdown
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }

    if (gameState.status !== "active" || gameState.gameState?.gameEnded) {
      return
    }

    // Update server sync reference when game state changes
    const now = Date.now()
    const currentWhiteTime = safeTimerValue(gameState.timeControl.timers.white)
    const currentBlackTime = safeTimerValue(gameState.timeControl.timers.black)
    const moveCount = gameState.moves?.length || gameState.board?.moveHistory?.length || 0
    const isFirstMove = moveCount === 0

    lastServerSync.current = {
      white: currentWhiteTime,
      black: currentBlackTime,
      activeColor: gameState.board.activeColor,
      timestamp: now,
      turnStartTime: gameState.board.turnStartTimestamp || now,
      isFirstMove: isFirstMove,
    }

    console.log("[TIMER] Setting up timer for active color:", gameState.board.activeColor)
    console.log("[TIMER] Move count:", moveCount, "Is first move:", isFirstMove)

    // Start local timer countdown
    timerRef.current = setInterval(() => {
      const now = Date.now()
      const serverSync = lastServerSync.current
      const elapsedSinceSync = now - serverSync.timestamp

      setLocalTimers((prev) => {
        let newWhite = serverSync.white
        let newBlack = serverSync.black

        if (!serverSync.isFirstMove) {
          if (serverSync.activeColor === "white") {
            newWhite = Math.max(0, serverSync.white - elapsedSinceSync)
            newBlack = serverSync.black
          } else if (serverSync.activeColor === "black") {
            newBlack = Math.max(0, serverSync.black - elapsedSinceSync)
            newWhite = serverSync.white
          }
        } else {
          newWhite = serverSync.white
          newBlack = serverSync.black
        }

        // Check for timeout and end game automatically
        if (newWhite <= 0 && !gameState.gameState?.gameEnded) {
          console.log("WHITE TIMEOUT DETECTED - Ending game")
          handleGameEnd("timeout", "black", "White ran out of time")
          return { white: 0, black: newBlack }
        }
        if (newBlack <= 0 && !gameState.gameState?.gameEnded) {
          console.log("BLACK TIMEOUT DETECTED - Ending game")
          handleGameEnd("timeout", "white", "Black ran out of time")
          return { white: newWhite, black: 0 }
        }

        return { white: newWhite, black: newBlack }
      })
    }, 100)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [
    gameState.status,
    gameState.board.activeColor,
    gameState.timeControl.timers.white,
    gameState.timeControl.timers.black,
    gameState.board.turnStartTimestamp,
    gameState.moves?.length,
    gameState.board?.moveHistory?.length,
    gameState.gameState?.gameEnded,
    handleGameEnd,
  ])

  // Socket event handlers (keeping all the existing logic)
  const handleGameMove = useCallback(
    (data: any) => {
      console.log("[MOVE] Move received:", data)
      if (data && data.gameState) {
        // Handle decay logic for the moved piece
        if (data.move && data.move.from && data.move.to) {
          const movedPiece = getPieceAt(data.move.from)
          handleDecayMove(data.move.from, data.move.to, movedPiece === null ? undefined : movedPiece)
        }

        // Extract timer values from the response
        let newWhiteTime = safeTimerValue(gameState.timeControl.timers.white)
        let newBlackTime = safeTimerValue(gameState.timeControl.timers.black)

        if (data.gameState.timeControl?.timers?.white !== undefined) {
          newWhiteTime = safeTimerValue(data.gameState.timeControl.timers.white)
        } else if (data.gameState.board?.whiteTime !== undefined) {
          newWhiteTime = safeTimerValue(data.gameState.board.whiteTime)
        }

        if (data.gameState.timeControl?.timers?.black !== undefined) {
          newBlackTime = safeTimerValue(data.gameState.timeControl.timers.black)
        } else if (data.gameState.board?.blackTime !== undefined) {
          newBlackTime = safeTimerValue(data.gameState.board.blackTime)
        }

        // Update server sync reference
        const now = Date.now()
        lastServerSync.current = {
          white: newWhiteTime,
          black: newBlackTime,
          activeColor: data.gameState.board.activeColor,
          timestamp: now,
          turnStartTime: data.gameState.board.turnStartTimestamp || now,
          isFirstMove: (data.gameState.moves?.length || 0) === 0,
        }

        // Check if the game has ended
        if (
          data.gameState.gameState?.gameEnded ||
          data.gameState.gameState?.checkmate ||
          data.gameState.status === "ended" ||
          data.gameState.shouldNavigateToMenu
        ) {
          const result = data.gameState.gameState?.result || data.gameState.result || "unknown"
          let winner = data.gameState.gameState?.winner || data.gameState.winner

          if (result === "checkmate") {
            const checkmatedPlayer = data.gameState.board.activeColor
            winner = checkmatedPlayer === "white" ? "black" : "white"
          }

          const endReason = data.gameState.gameState?.endReason || data.gameState.endReason || result
          const lastMove = data.gameState.move || data.move
          const moveMaker = lastMove?.color || "unknown"
          const moveSan = lastMove?.san || `${lastMove?.from || "?"}->${lastMove?.to || "?"}`

          let winnerName = null
          if (winner && data.gameState.players && data.gameState.players[winner]) {
            winnerName = data.gameState.players[winner].username
          }

          handleGameEnd(result, winner, endReason, { moveSan, moveMaker, winnerName })
          return
        }

        setGameState((prevState) => ({
          ...prevState,
          ...data.gameState,
          board: {
            ...prevState.board,
            ...data.gameState.board,
          },
          timeControl: {
            ...prevState.timeControl,
            ...data.gameState.timeControl,
            timers: {
              white: newWhiteTime,
              black: newBlackTime,
            },
          },
          moves: data.gameState.moves || [],
          lastMove: data.gameState.lastMove,
          moveCount: data.gameState.moveCount,
        }))

        // Clean up decay/frozen state for captured pieces
        cleanupCapturedPieces(data.gameState.board)

        // Update local timers
        setLocalTimers({
          white: newWhiteTime,
          black: newBlackTime,
        })

        setMoveHistory(data.gameState.moves || [])
        setSelectedSquare(null)
        setPossibleMoves([])

        // Update turn state
        const userColor = data.gameState.userColor ? data.gameState.userColor[userId] : playerColor
        const activeColor = data.gameState.board.activeColor
        const newIsMyTurn = activeColor === userColor
        setIsMyTurn(newIsMyTurn)
      }
    },
    [
      handleDecayMove,
      getPieceAt,
      gameState.timeControl.timers,
      handleGameEnd,
      userId,
      playerColor,
      cleanupCapturedPieces,
    ],
  )

  const handlePossibleMoves = useCallback((data: { square: string; moves: any[] }) => {
    console.log("Possible moves (raw):", data.moves)
    let moves: string[] = []

    if (Array.isArray(data.moves) && data.moves.length > 0) {
      if (typeof data.moves[0] === "object" && data.moves[0].to) {
        moves = data.moves.map((m: any) => m.to)
      } else if (typeof data.moves[0] === "string" && data.moves[0].length === 4) {
        moves = data.moves.map((m: string) => m.slice(2, 4))
      } else if (typeof data.moves[0] === "string") {
        moves = data.moves
      }
    }

    console.log("Possible moves (dest squares):", moves)
    setPossibleMoves(moves)
  }, [])

  const handleGameStateUpdate = useCallback(
    (data: any) => {
      console.log("Game state update:", data)
      if (data && data.gameState) {
        // Check for game ending
        if (
          data.gameState.gameState?.gameEnded ||
          data.gameState.status === "ended" ||
          data.gameState.shouldNavigateToMenu
        ) {
          const result = data.gameState.gameState?.result || data.gameState.result || "unknown"
          const winner = data.gameState.gameState?.winner || data.gameState.winner
          const endReason = data.gameState.gameState?.endReason || data.gameState.endReason || result
          handleGameEnd(result, winner, endReason)
          return
        }

        // Update server sync reference
        lastServerSync.current = {
          white: safeTimerValue(data.gameState.timeControl?.timers?.white || data.gameState.board?.whiteTime),
          black: safeTimerValue(data.gameState.timeControl?.timers?.black || data.gameState.board?.blackTime),
          activeColor: data.gameState.board.activeColor,
          timestamp: Date.now(),
          turnStartTime: data.gameState.board.turnStartTimestamp || Date.now(),
          isFirstMove: (data.gameState.moves?.length || data.gameState.board?.moveHistory?.length || 0) === 0,
        }

        setGameState((prevState) => ({
          ...prevState,
          ...data.gameState,
          timeControl: {
            ...prevState.timeControl,
            ...data.gameState.timeControl,
            timers: {
              white: safeTimerValue(data.gameState.timeControl?.timers?.white || data.gameState.board?.whiteTime),
              black: safeTimerValue(data.gameState.timeControl?.timers?.black || data.gameState.board?.blackTime),
            },
          },
        }))

        setIsMyTurn(data.gameState.board.activeColor === playerColor)
      }
    },
    [handleGameEnd, playerColor],
  )

  const handleTimerUpdate = useCallback(
    (data: any) => {
      console.log("Timer update:", data)

      // Check for game ending in timer update
      if (data.gameEnded || data.shouldNavigateToMenu) {
        const result = data.endReason || "timeout"
        const winner = data.winner
        handleGameEnd(result, winner, result)
        return
      }

      // Handle different timer update formats from server
      let whiteTime: number
      let blackTime: number

      if (data.timers && typeof data.timers === "object") {
        whiteTime = safeTimerValue(data.timers.white)
        blackTime = safeTimerValue(data.timers.black)
      } else if (typeof data.white === "number" && typeof data.black === "number") {
        whiteTime = safeTimerValue(data.white)
        blackTime = safeTimerValue(data.black)
      } else {
        whiteTime = safeTimerValue(data.white ?? data.timers?.white)
        blackTime = safeTimerValue(data.black ?? data.timers?.black)
      }

      // Update server sync reference
      lastServerSync.current = {
        white: whiteTime,
        black: blackTime,
        activeColor: gameState.board.activeColor,
        timestamp: Date.now(),
        turnStartTime: Date.now(),
        isFirstMove: (gameState.moves?.length || gameState.board?.moveHistory?.length || 0) === 0,
      }

      // Update local timers immediately
      setLocalTimers({
        white: whiteTime,
        black: blackTime,
      })

      setGameState((prevState) => ({
        ...prevState,
        timeControl: {
          ...prevState.timeControl,
          timers: {
            white: whiteTime,
            black: blackTime,
          },
        },
      }))
    },
    [handleGameEnd, gameState.board.activeColor, gameState.moves?.length, gameState.board?.moveHistory?.length],
  )

  const handleGameEndEvent = useCallback(
    (data: any) => {
      console.log("Game end event received:", data)
      const result = data.gameState?.gameState?.result || data.gameState?.result || data.result || "unknown"
      const winner = data.gameState?.gameState?.winner || data.gameState?.winner || data.winner
      const endReason = data.gameState?.gameState?.endReason || data.gameState?.endReason || data.endReason || result
      handleGameEnd(result, winner, endReason)
    },
    [handleGameEnd],
  )

  const handleGameError = useCallback((data: any) => {
    console.log("Game error:", data)
    Alert.alert("Error", data.message || data.error || "An error occurred")
  }, [])

  const handleGameWarning = useCallback((data: any) => {
    console.warn("[GAME WARNING] Received warning:", data)
    setGameState((prev) => ({ ...prev, gameState: data.gameState }))
    Alert.alert("Game Warning", data.message || "An unexpected warning occurred.")
  }, [])

  // Set up socket event listeners
  useEffect(() => {
    if (!socket) return

    socket.on("game:move", handleGameMove)
    socket.on("game:possibleMoves", handlePossibleMoves)
    socket.on("game:gameState", handleGameStateUpdate)
    socket.on("game:timer", handleTimerUpdate)
    socket.on("game:end", handleGameEndEvent)
    socket.on("game:error", handleGameError)
    socket.on("game:warning", handleGameWarning)

    return () => {
      socket.off("game:move", handleGameMove)
      socket.off("game:possibleMoves", handlePossibleMoves)
      socket.off("game:gameState", handleGameStateUpdate)
      socket.off("game:timer", handleTimerUpdate)
      socket.off("game:end", handleGameEndEvent)
      socket.off("game:error", handleGameError)
      socket.off("game:warning", handleGameWarning)
    }
  }, [
    socket,
    handleGameMove,
    handlePossibleMoves,
    handleGameStateUpdate,
    handleTimerUpdate,
    handleGameEndEvent,
    handleGameError,
    handleGameWarning,
  ])

  // Game interaction functions
  const requestPossibleMoves = useCallback(
    (square: string) => {
      if (!socket) return
      socket.emit("game:getPossibleMoves", { square })
    },
    [socket],
  )

  const makeMove = useCallback(
    (move: Move) => {
      console.log("[DEBUG] Attempting to make move", move, "isMyTurn:", isMyTurn)
      if (!socket || !isMyTurn) {
        console.log("[DEBUG] Not emitting move: socket or isMyTurn false")
        return
      }

      // Check if the piece is frozen
      if (frozenPieces[playerColor].has(move.from)) {
        Alert.alert("Frozen Piece", "This piece is frozen due to decay and cannot be moved!")
        return
      }

      // Immediately update local state to show move was made (optimistic update)
      setIsMyTurn(false)
      setSelectedSquare(null)
      setPossibleMoves([])

      socket.emit("game:makeMove", {
        move: { from: move.from, to: move.to, promotion: move.promotion },
        timestamp: Date.now(),
      })

      console.log("[DEBUG] Move emitted:", { from: move.from, to: move.to, promotion: move.promotion })
    },
    [socket, isMyTurn, frozenPieces, playerColor],
  )

  const handleSquarePress = useCallback(
    (square: string) => {
      if (selectedSquare === square) {
        // Deselect if clicking the same square
        setSelectedSquare(null)
        setPossibleMoves([])
        return
      }

      if (selectedSquare && possibleMoves.includes(square)) {
        // Check if this move is a promotion
        const piece = getPieceAt(selectedSquare)
        const isPromotion =
          piece &&
          ((piece.toLowerCase() === "p" && playerColor === "white" && square[1] === "8") ||
            (piece.toLowerCase() === "p" && playerColor === "black" && square[1] === "1"))

        if (isPromotion) {
          const options = ["q", "r", "b", "n"] // queen, rook, bishop, knight
          setPromotionModal({ visible: true, from: selectedSquare, to: square, options })
          return
        }

        makeMove({ from: selectedSquare, to: square })
        setSelectedSquare(null)
        setPossibleMoves([])
        return
      }

      // Only allow selecting a piece if it's the player's turn and the piece belongs to them
      const piece = getPieceAt(square)
      if (isMyTurn && piece && isPieceOwnedByPlayer(piece, playerColor)) {
        // Check if the piece is frozen
        if (frozenPieces[playerColor].has(square)) {
          Alert.alert("Frozen Piece", "This piece is frozen due to decay and cannot be moved!")
          return
        }

        setSelectedSquare(square)
        requestPossibleMoves(square)
      } else {
        setSelectedSquare(null)
        setPossibleMoves([])
      }
    },
    [
      selectedSquare,
      possibleMoves,
      isMyTurn,
      playerColor,
      frozenPieces,
      makeMove,
      requestPossibleMoves,
      getPieceAt,
      isPieceOwnedByPlayer,
    ],
  )

  // Handle promotion selection
  const handlePromotionSelect = useCallback(
    (promotion: string) => {
      if (promotionModal) {
        makeMove({ from: promotionModal.from, to: promotionModal.to, promotion })
        setPromotionModal(null)
        setSelectedSquare(null)
        setPossibleMoves([])
      }
    },
    [promotionModal, makeMove],
  )

  // Correct FEN parsing for piece lookup
  const formatTime = useCallback((milliseconds: number): string => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0:00"
    const totalSeconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }, [])

  // Calculate material advantage
  const calculateMaterialAdvantage = useCallback(() => {
    const capturedPieces = gameState.board.capturedPieces || { white: [], black: [] }
    let whiteAdvantage = 0
    let blackAdvantage = 0

    capturedPieces.white.forEach((piece) => {
      whiteAdvantage += PIECE_VALUES[piece.toLowerCase() as keyof typeof PIECE_VALUES] || 0
    })

    capturedPieces.black.forEach((piece) => {
      blackAdvantage += PIECE_VALUES[piece.toUpperCase() as keyof typeof PIECE_VALUES] || 0
    })

    return { white: whiteAdvantage, black: blackAdvantage }
  }, [gameState.board.capturedPieces])

  const renderCapturedPieces = useCallback(
    (color: "white" | "black") => {
      const capturedPieces = gameState.board.capturedPieces || { white: [], black: [] }
      const pieces = capturedPieces[color] || []
      if (pieces.length === 0) return null

      // Group pieces by type and count them
      const pieceCounts: { [key: string]: number } = {}
      pieces.forEach((piece) => {
        const pieceType = color === "white" ? piece.toLowerCase() : piece.toUpperCase()
        pieceCounts[pieceType] = (pieceCounts[pieceType] || 0) + 1
      })

      return (
        <View style={styles.capturedPieces}>
          {Object.entries(pieceCounts).map(([piece, count]) => (
            <View key={piece} style={styles.capturedPieceGroup}>
              {getPieceComponent(piece, isSmallScreen ? 14 : 16)}
              {count > 1 && <Text style={styles.capturedCount}>{count}</Text>}
            </View>
          ))}
        </View>
      )
    },
    [gameState.board.capturedPieces],
  )

  const renderSquare = useCallback(
    (file: string, rank: string) => {
      const square = `${file}${rank}`
      const isLight = (FILES.indexOf(file) + Number.parseInt(rank)) % 2 === 0
      const isSelected = selectedSquare === square
      const isPossibleMove = possibleMoves.includes(square)

      // Check for last move highlighting
      let lastMoveObj = null
      if (gameState.board && Array.isArray(gameState.board.moveHistory) && gameState.board.moveHistory.length > 0) {
        lastMoveObj = gameState.board.moveHistory[gameState.board.moveHistory.length - 1]
      } else if (
        gameState.lastMove &&
        typeof gameState.lastMove === "object" &&
        gameState.lastMove.from &&
        gameState.lastMove.to
      ) {
        lastMoveObj = gameState.lastMove
      }

      let isLastMove = false
      if (lastMoveObj && lastMoveObj.from && lastMoveObj.to) {
        isLastMove = lastMoveObj.from === square || lastMoveObj.to === square
      }

      const piece = getPieceAt(square)

      // Check if this piece has an active decay timer
      const pieceColor = piece ? getPieceColor(piece) : null
      const hasActiveDecayTimer = pieceColor && decayState[pieceColor][square]?.isActive
      const decayTimeLeft = hasActiveDecayTimer ? decayState[pieceColor][square].timeLeft : 0

      // Check if this piece is frozen
      const isFrozen = pieceColor && frozenPieces[pieceColor].has(square)

      // Determine border color and width
      let borderColor = "transparent"
      let borderWidth = 0

      if (isFrozen) {
        borderColor = "#dc2626" // Red for frozen pieces
        borderWidth = 2
      } else if (isPossibleMove) {
        borderColor = "#16a34a" // Green for possible moves
        borderWidth = 2
      } else if (isSelected) {
        borderColor = "#2563eb" // Blue for selected
        borderWidth = 2
      } else if (isLastMove) {
        borderColor = "#f59e0b" // Yellow for last move
        borderWidth = 1
      } else if (hasActiveDecayTimer) {
        borderColor = "#ea580c" // Orange for decay timer
        borderWidth = 1
      }

      return (
        <View key={square} style={{ position: "relative" }}>
          {/* Decay timer display above the square */}
          {hasActiveDecayTimer && decayTimeLeft > 0 && (
            <View
              style={[
                styles.decayTimerAbove,
                {
                  width: squareSize,
                  left: 0,
                  top: isSmallScreen ? -20 : -24, // Position above the square
                },
              ]}
            >
              <View style={styles.decayTimerBox}>
                <Text style={[styles.decayTimerBoxText, { fontSize: decayTimerFontSize }]}>
                  {formatDecayTimeMinutes(decayTimeLeft)}
                </Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.square,
              {
                width: squareSize,
                height: squareSize,
                backgroundColor: isLight ? "#F0D9B5" : "#769656", // Chess.com colors
                borderWidth: borderWidth,
                borderColor: borderColor,
              },
            ]}
            onPress={() => handleSquarePress(square)}
          >
            {/* Coordinate labels */}
            {file === "a" && (
              <Text
                style={[
                  styles.coordinateLabel,
                  styles.rankLabel,
                  {
                    color: isLight ? "#769656" : "#F0D9B5",
                    fontSize: isSmallScreen ? 8 : 10,
                  },
                ]}
              >
                {rank}
              </Text>
            )}
            {rank === "1" && (
              <Text
                style={[
                  styles.coordinateLabel,
                  styles.fileLabel,
                  {
                    color: isLight ? "#769656" : "#F0D9B5",
                    fontSize: isSmallScreen ? 8 : 10,
                  },
                ]}
              >
                {file}
              </Text>
            )}

            {/* Piece */}
            {piece && (
              <View
                style={{
                  opacity: isFrozen ? 0.6 : 1,
                }}
              >
                {getPieceComponent(piece, pieceFontSize)}
              </View>
            )}

            {/* Frozen indicator */}
            {isFrozen && (
              <View style={[styles.frozenIndicator, { width: squareSize * 0.25, height: squareSize * 0.25 }]}>
                <Text style={[styles.frozenText, { fontSize: squareSize * 0.15 }]}>❄️</Text>
              </View>
            )}

            {/* Move indicators */}
            {isPossibleMove && !piece && (
              <View
                style={[
                  styles.possibleMoveDot,
                  {
                    width: squareSize * 0.25,
                    height: squareSize * 0.25,
                    borderRadius: squareSize * 0.125,
                  },
                ]}
              />
            )}
            {isPossibleMove && piece && (
              <View
                style={[
                  styles.captureIndicator,
                  {
                    width: squareSize * 0.3,
                    height: squareSize * 0.3,
                    borderRadius: squareSize * 0.15,
                  },
                ]}
              />
            )}
          </TouchableOpacity>
        </View>
      )
    },
    [
      selectedSquare,
      possibleMoves,
      gameState.board,
      gameState.lastMove,
      getPieceAt,
      getPieceColor,
      decayState,
      frozenPieces,
      handleSquarePress,
    ],
  )

  // Render game info (check, checkmate, stalemate, etc.)
  const renderGameInfo = useCallback(() => {
    const gs = gameState.gameState || {}

    // Only show game ended message, hide turn indicators
    if (gameState.status === "ended" || gs.gameEnded) {
      return (
        <View style={styles.gameStatusContainer}>
          <Text style={styles.gameOverText}>🏁 Game Ended 🏁</Text>
        </View>
      )
    }

    // Return empty view to maintain spacing but show nothing during active game
    return <View style={styles.gameStatusContainer} />
  }, [gameState.status, gameState.gameState])

  // FIXED: Render board with proper structure
  const renderBoard = useCallback(() => {
    const files = boardFlipped ? [...FILES].reverse() : FILES
    const ranks = boardFlipped ? [...RANKS].reverse() : RANKS

    return (
      <View style={styles.boardWrapper}>
        <View style={styles.boardContainer}>
          <View style={styles.board}>
            {ranks.map((rank) => (
              <View key={rank} style={styles.row}>
                {files.map((file) => renderSquare(file, rank))}
              </View>
            ))}
          </View>
        </View>
      </View>
    )
  }, [boardFlipped, renderSquare])

  const renderPlayerInfo = useCallback(
    (color: "white" | "black") => {
      const player = gameState.players[color]
      if (!player) {
        return (
          <View style={styles.playerInfoContainer}>
            <Text style={styles.playerName}>Unknown Player</Text>
          </View>
        )
      }

      // Use localTimers for smooth UI countdown
      const timer = safeTimerValue(localTimers[color])
      const isActive = gameState.board.activeColor === color && gameState.status === "active"
      const isMe = playerColor === color
      const materialAdvantage = calculateMaterialAdvantage()
      const advantage = materialAdvantage[color] - materialAdvantage[color === "white" ? "black" : "white"]

      // Count active decay timers and frozen pieces for this player
      const activeDecayTimers = Object.values(decayState[color]).filter((timer) => timer.isActive).length
      const frozenPiecesCount = frozenPieces[color].size

      return (
        <View style={styles.playerInfoContainer}>
          <View style={styles.playerHeader}>
            <View style={styles.playerDetails}>
              <View style={styles.playerNameRow}>
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerAvatarText}>{player.username.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.playerNameContainer}>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {player.username}
                  </Text>
                  <Text style={styles.playerRating}>({player.rating > 0 ? player.rating : "Unrated"})</Text>
                </View>
                {isMe && <Text style={styles.youIndicator}>(You)</Text>}
              </View>
              {/* Decay status */}
              {(activeDecayTimers > 0 || frozenPiecesCount > 0) && (
                <View style={styles.decayStatus}>
                  {activeDecayTimers > 0 && <Text style={styles.decayStatusText}>⏱️ {activeDecayTimers} decaying</Text>}
                  {frozenPiecesCount > 0 && <Text style={styles.frozenStatusText}>❄️ {frozenPiecesCount} frozen</Text>}
                </View>
              )}
            </View>
            <View style={styles.timerContainer}>
              <Text style={styles.timerText}>{formatTime(timer)}</Text>
            </View>
          </View>
          {renderCapturedPieces(color)}
        </View>
      )
    },
    [
      gameState.players,
      gameState.board.activeColor,
      gameState.status,
      playerColor,
      localTimers,
      calculateMaterialAdvantage,
      decayState,
      frozenPieces,
      formatTime,
      renderCapturedPieces,
    ],
  )

  const renderMoveHistory = useCallback(() => {
    if (!showMoveHistory) return null

    const moves = moveHistory
    const movePairs = []
    for (let i = 0; i < moves.length; i += 2) {
      movePairs.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: moves[i],
        black: moves[i + 1] || "",
      })
    }

    return (
      <Modal visible={showMoveHistory} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.moveHistoryModal}>
            <View style={styles.moveHistoryHeader}>
              <Text style={styles.moveHistoryTitle}>📜 Move History</Text>
              <TouchableOpacity onPress={() => setShowMoveHistory(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
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
        </View>
      </Modal>
    )
  }, [showMoveHistory, moveHistory])

  const handleFlipBoard = useCallback(() => {
    setBoardFlipped(!boardFlipped)
  }, [boardFlipped])

  // FIXED: Consistent player positioning - each player always sees themselves at bottom
  const opponentColor = playerColor === "white" ? "black" : "white"

  return (
    <View style={styles.container}>
      <View style={styles.gameContent}>
        {/* Top: Opponent Player - Equal space allocation */}
        <View style={styles.topPlayerSection}>
          {renderPlayerInfo(opponentColor)}
        </View>
        
        {/* Chess Board - Equal space allocation */}
        <View style={styles.boardSection}>
          {renderBoard()}
        </View>
        
        {/* Bottom: Current Player - Equal space allocation */}
        <View style={styles.bottomPlayerSection}>
          {renderPlayerInfo(playerColor)}
        </View>
      </View>

      {/* Bottom Control Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomBarButton} onPress={() => setShowMoveHistory(true)}>
          <Text style={styles.bottomBarIcon}>≡</Text>
          <Text style={styles.bottomBarLabel}>Moves</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomBarButton} onPress={handleFlipBoard}>
          <Text style={styles.bottomBarIcon}>⟲</Text>
          <Text style={styles.bottomBarLabel}>Flip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bottomBarButton}
          onPress={() => {
            if (socket && gameState.status === "active") {
              socket.emit("game:resign")
            }
          }}
        >
          <Text style={styles.bottomBarIcon}>✕</Text>
          <Text style={styles.bottomBarLabel}>Resign</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bottomBarButton}
          onPress={() => {
            if (socket && gameState.status === "active") {
              socket.emit("game:offerDraw")
            }
          }}
        >
          <Text style={styles.bottomBarIcon}>½</Text>
          <Text style={styles.bottomBarLabel}>Draw</Text>
        </TouchableOpacity>
      </View>

      {/* Move History Modal */}
      {renderMoveHistory()}

      {/* Promotion Modal */}
      {promotionModal && (
        <Modal visible={promotionModal.visible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.promotionModal}>
              <Text style={styles.promotionTitle}>Choose Promotion</Text>
              <View style={styles.promotionOptions}>
                {promotionModal.options.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={styles.promotionOption}
                    onPress={() => handlePromotionSelect(option)}
                  >
                    {getPieceComponent(
                      playerColor === "white" ? option.toUpperCase() : option,
                      isSmallScreen ? 28 : 32,
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Game End Modal */}
      <Modal visible={showGameEndModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.gameEndModal,
              isWinner === true && styles.victoryModal,
              isWinner === false && styles.defeatModal,
            ]}
          >
            <Text
              style={[
                styles.gameEndTitle,
                isWinner === true && styles.victoryTitle,
                isWinner === false && styles.defeatTitle,
              ]}
            >
              {isWinner === true ? "🎉 VICTORY! 🎉" : isWinner === false ? "😔 DEFEAT 😔" : "🏁 GAME OVER 🏁"}
            </Text>
            <Text style={styles.gameEndMessage}>{gameEndMessage}</Text>
            {gameEndDetails.reason && <Text style={styles.gameEndReason}>Reason: {gameEndDetails.reason}</Text>}
            {gameEndDetails.moveSan && (
              <Text style={styles.gameEndMove}>
                Move: {gameEndDetails.moveSan} by {gameEndDetails.moveMaker}
              </Text>
            )}
            {gameEndDetails.winnerName && <Text style={styles.gameEndWinner}>Winner: {gameEndDetails.winnerName}</Text>}
            <TouchableOpacity style={styles.menuButton} onPress={navigateToMenu}>
              <Text style={styles.menuButtonText}>Back to Menu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// Updated styles with improved centering and responsive design
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#312e2b", // Chess.com dark background
    paddingTop: topPadding,
    paddingBottom: bottomPadding,
    paddingHorizontal: 0, // No horizontal padding for full width board like classic
    justifyContent: "space-between", // Ensure consistent spacing between components
  },
  gameContent: {
    flex: 1,
    justifyContent: "space-between", // Changed from center to space-between for even distribution
    alignItems: "center",
  },
  topPlayerSection: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  boardSection: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  bottomPlayerSection: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  boardWrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  boardContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 0, // Remove all margin for seamless connection
  },
  board: {
    flexDirection: "column",
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#4a4a4a",
    width: boardSize,
    height: boardSize,
  },
  row: {
    flexDirection: "row",
    flex: 1,
  },
  square: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    flex: 1,
  },
  playerInfoContainer: {
    backgroundColor: "#312e2b",
    borderRadius: 0, // Remove border radius for seamless connection to board
    paddingHorizontal: isSmallScreen ? 8 : isTablet ? 16 : 12,
    paddingVertical: isSmallScreen ? 6 : isTablet ? 10 : 8,
    marginVertical: 20, // Remove all margin for seamless connection
    height: playerInfoHeight, // Fixed height to prevent board shifting
    width: "100%", // Full width to maintain consistent layout
    justifyContent: "center",
  },
  activePlayerContainer: {
    // Remove special styling - keep same appearance for all players
    backgroundColor: "#3a3a3a",
  },
  playerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  playerDetails: {
    flex: 1,
    marginRight: isSmallScreen ? 8 : 12,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: isSmallScreen ? 2 : 3,
  },
  playerAvatar: {
    width: isSmallScreen ? 24 : isTablet ? 36 : 30,
    height: isSmallScreen ? 24 : isTablet ? 36 : 30,
    borderRadius: isSmallScreen ? 12 : isTablet ? 18 : 15,
    backgroundColor: "#4a4a4a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: isSmallScreen ? 6 : isTablet ? 12 : 8,
  },
  playerAvatarText: {
    color: "#fff",
    fontSize: isSmallScreen ? 10 : isTablet ? 16 : 12,
    fontWeight: "bold",
  },
  playerNameContainer: {
    flex: 1,
    marginRight: 8,
  },
  playerName: {
    color: "#fff",
    fontSize: isSmallScreen ? 12 : isTablet ? 16 : 14,
    fontWeight: "600",
  },
  playerRating: {
    color: "#a1a1aa",
    fontSize: isSmallScreen ? 10 : isTablet ? 14 : 12,
    marginTop: 1,
  },
  youIndicator: {
    color: "#60a5fa",
    fontSize: isSmallScreen ? 8 : isTablet ? 12 : 10,
    fontWeight: "500",
    backgroundColor: "#1e3a8a",
    paddingHorizontal: isSmallScreen ? 4 : 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  decayStatus: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    maxHeight: isSmallScreen ? 12 : isTablet ? 16 : 14, // Reduced height to fit better
    overflow: "hidden",
  },
  decayStatusText: {
    color: "#f97316",
    fontSize: isSmallScreen ? 8 : isTablet ? 12 : 10,
    marginRight: 8,
    marginTop: 1,
  },
  frozenStatusText: {
    color: "#ef4444",
    fontSize: isSmallScreen ? 8 : isTablet ? 12 : 10,
    marginTop: 1,
  },
  timerContainer: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: isSmallScreen ? 8 : isTablet ? 14 : 10,
    paddingVertical: isSmallScreen ? 4 : isTablet ? 8 : 6,
    borderRadius: 16,
    minWidth: isSmallScreen ? 50 : isTablet ? 80 : 60,
    alignItems: "center",
  },
  timerText: {
    color: "#fff",
    fontSize: isSmallScreen ? 12 : isTablet ? 18 : 14,
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  capturedPieces: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: isSmallScreen ? 1 : isTablet ? 2 : 1, // Reduced top margin for tighter connection
    paddingTop: isSmallScreen ? 1 : isTablet ? 2 : 1, // Reduced top padding for tighter connection
    borderTopWidth: 1,
    borderTopColor: "#4a4a4a", // Slightly lighter border to match board
    maxHeight: isSmallScreen ? 18 : isTablet ? 25 : 20, // Reduced height to fit better
    overflow: "hidden", // Hide overflow to prevent container expansion
  },
  capturedPieceGroup: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
    marginBottom: 4,
  },
  capturedCount: {
    color: "#a1a1aa",
    fontSize: isSmallScreen ? 10 : isTablet ? 14 : 12,
    marginLeft: 2,
    fontWeight: "bold",
  },
  gameStatusContainer: {
    alignItems: "center",
    marginVertical: 0, // Remove margin for seamless connection
    paddingHorizontal: 16,
    height: gameStatusHeight, // Fixed height to prevent board shifting
    width: "100%", // Full width to maintain consistent layout
    justifyContent: "center",
  },
  gameOverText: {
    color: "#ef4444",
    fontSize: isSmallScreen ? 12 : isTablet ? 18 : 14,
    fontWeight: "bold",
  },
  turnIndicator: {
    color: "#a1a1aa",
    fontSize: isSmallScreen ? 11 : isTablet ? 15 : 13,
    marginBottom: 2,
    textAlign: "center",
  },
  myTurnIndicator: {
    color: "#4ade80",
    fontWeight: "600",
  },
  variantName: {
    color: "#60a5fa",
    fontSize: isSmallScreen ? 12 : isTablet ? 16 : 14,
    fontStyle: "italic",
    textAlign: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    paddingVertical: isSmallScreen ? 6 : isTablet ? 10 : 8,
    paddingHorizontal: 16, // Fixed padding instead of variable
    borderTopWidth: 1,
    borderTopColor: "#3a3a3a",
    height: bottomBarHeight,
  },
  bottomBarButton: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: isSmallScreen ? 6 : isTablet ? 12 : 8,
    borderRadius: 6,
    flex: 1,
  },
  bottomBarIcon: {
    fontSize: isSmallScreen ? 14 : isTablet ? 20 : 16,
    color: "#fff",
    marginBottom: 2,
  },
  bottomBarLabel: {
    fontSize: isSmallScreen ? 8 : isTablet ? 12 : 10,
    color: "#a1a1aa",
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  moveHistoryModal: {
    backgroundColor: "#262421",
    borderRadius: 12,
    padding: 20,
    width: "85%",
    maxHeight: "70%",
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },
  moveHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  moveHistoryTitle: {
    color: "#fff",
    fontSize: isSmallScreen ? 16 : isTablet ? 20 : 18,
    fontWeight: "bold",
  },
  closeButton: {
    backgroundColor: "#ef4444",
    padding: 8,
    borderRadius: 6,
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  moveHistoryScroll: {
    maxHeight: 300,
  },
  moveRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  moveNumber: {
    color: "#a1a1aa",
    fontSize: isSmallScreen ? 12 : isTablet ? 16 : 14,
    width: 30,
    fontFamily: "monospace",
  },
  moveText: {
    color: "#fff",
    fontSize: isSmallScreen ? 12 : isTablet ? 16 : 14,
    marginRight: 16,
    fontFamily: "monospace",
  },
  promotionModal: {
    backgroundColor: "#262421",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },
  promotionTitle: {
    color: "#fff",
    fontSize: isSmallScreen ? 16 : isTablet ? 20 : 18,
    fontWeight: "bold",
    marginBottom: 20,
  },
  promotionOptions: {
    flexDirection: "row",
    gap: 12,
  },
  promotionOption: {
    backgroundColor: "#4a4a4a",
    padding: isSmallScreen ? 12 : isTablet ? 20 : 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#60a5fa",
  },
  gameEndModal: {
    backgroundColor: "#262421",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    width: "85%",
    borderWidth: 2,
    borderColor: "#3a3a3a",
  },
  victoryModal: {
    borderColor: "#4ade80",
  },
  defeatModal: {
    borderColor: "#ef4444",
  },
  gameEndTitle: {
    fontSize: isSmallScreen ? 20 : isTablet ? 28 : 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    color: "#fff",
  },
  victoryTitle: {
    color: "#4ade80",
  },
  defeatTitle: {
    color: "#ef4444",
  },
  gameEndMessage: {
    color: "#fff",
    fontSize: isSmallScreen ? 14 : isTablet ? 18 : 16,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 24,
  },
  gameEndReason: {
    color: "#a1a1aa",
    fontSize: isSmallScreen ? 12 : isTablet ? 16 : 14,
    marginBottom: 8,
  },
  gameEndMove: {
    color: "#a1a1aa",
    fontSize: isSmallScreen ? 12 : isTablet ? 16 : 14,
    marginBottom: 8,
  },
  gameEndWinner: {
    color: "#4ade80",
    fontSize: isSmallScreen ? 14 : isTablet ? 18 : 16,
    fontWeight: "bold",
    marginBottom: 16,
  },
  menuButton: {
    backgroundColor: "#60a5fa",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  menuButtonText: {
    color: "#fff",
    fontSize: isSmallScreen ? 14 : isTablet ? 18 : 16,
    fontWeight: "600",
  },
  coordinateLabel: {
    position: "absolute",
    fontWeight: "bold",
  },
  rankLabel: {
    left: 2,
    top: 2,
  },
  fileLabel: {
    right: 2,
    bottom: 2,
  },
  decayTimerAbove: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  decayTimerBox: {
    backgroundColor: "#f97316",
    borderRadius: 4,
    paddingHorizontal: isSmallScreen ? 4 : 6,
    paddingVertical: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  decayTimerBoxText: {
    color: "#fff",
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  frozenIndicator: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  frozenText: {
    // fontSize is set dynamically in renderSquare
  },
  possibleMoveDot: {
    position: "absolute",
    backgroundColor: "#16a34a",
    opacity: 0.8,
  },
  captureIndicator: {
    position: "absolute",
    backgroundColor: "#dc2626",
    top: 2,
    right: 2,
    opacity: 0.9,
  },
})
