"use client"

import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Alert, Dimensions, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native"
import type { Socket } from "socket.io-client"
import { getSocketInstance } from "../utils/socketManager"
import GameControls from "./GameControls"

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
  subvariantName: string
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
}

// Track decay timers for each piece position
interface DecayState {
  [square: string]: DecayTimer
}

const PIECE_SYMBOLS = {
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚",
  p: "♟",
  R: "♖",
  N: "♘",
  B: "♗",
  Q: "♕",
  K: "♔",
  P: "♙",
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

// Format decay timer in MM:SS format like the image
const formatDecayTimeMinutes = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0:00"
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
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

  // Decay-specific state
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

  // Timer management
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const decayTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastUpdateRef = useRef<number>(Date.now())
  const gameStartTimeRef = useRef<number | null>(null)
  const isFirstMoveRef = useRef<boolean>(true)
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Timer sync state
  function safeTimerValue(val: any): number {
    const n = Number(val)
    return isNaN(n) || n === undefined || n === null ? 0 : Math.max(0, n)
  }

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

  const screenWidth = Dimensions.get("window").width
  const screenHeight = Dimensions.get("window").height
  const isTablet = Math.min(screenWidth, screenHeight) > 600
  const isSmallScreen = Math.min(screenWidth, screenHeight) < 400

  const containerPadding = isTablet ? 24 : isSmallScreen ? 12 : 16
  const boardSize = Math.min(screenWidth - containerPadding * 2, screenHeight * 0.5, isTablet ? 500 : 380)
  const squareSize = boardSize / 8
  const minTouchTarget = 44

  const baseFontSize = isTablet ? 18 : isSmallScreen ? 14 : 16
  const titleFontSize = isTablet ? 24 : isSmallScreen ? 18 : 20
  const smallFontSize = isTablet ? 14 : isSmallScreen ? 11 : 12

  // Helper function to check if a piece is a queen
  const isQueen = (piece: string): boolean => {
    return piece.toLowerCase() === "q"
  }

  // Helper function to check if a piece is a major piece
  const isMajorPiece = (piece: string): boolean => {
    return MAJOR_PIECES.includes(piece)
  }

  // Helper function to get piece color
  const getPieceColor = (piece: string): "white" | "black" => {
    return piece === piece.toUpperCase() ? "white" : "black"
  }

  // Start decay timer for a piece
  const startDecayTimer = (square: string, piece: string) => {
    const pieceColor = getPieceColor(piece)
    const isQueenPiece = isQueen(piece)

    setDecayState((prev) => {
      const newState = { ...prev }
      const colorState = { ...newState[pieceColor] }

      // Check if this piece already has a decay timer
      const existingTimer = colorState[square]
      const moveCount = existingTimer ? existingTimer.moveCount + 1 : 1

      // Calculate decay time based on piece type and move count
      let decayTime: number
      if (isQueenPiece) {
        decayTime = QUEEN_INITIAL_DECAY_TIME + (moveCount - 1) * DECAY_TIME_INCREMENT
      } else {
        decayTime = MAJOR_PIECE_INITIAL_DECAY_TIME + (moveCount - 1) * DECAY_TIME_INCREMENT
      }

      colorState[square] = {
        timeLeft: decayTime,
        isActive: true,
        moveCount: moveCount,
      }

      newState[pieceColor] = colorState
      return newState
    })

    console.log(
      `[DECAY] Started decay timer for ${piece} at ${square}: ${isQueenPiece ? QUEEN_INITIAL_DECAY_TIME : MAJOR_PIECE_INITIAL_DECAY_TIME}ms`,
    )
  }

  // Stop decay timer for a piece
  const stopDecayTimer = (square: string, color: "white" | "black") => {
    setDecayState((prev) => {
      const newState = { ...prev }
      const colorState = { ...newState[color] }

      if (colorState[square]) {
        colorState[square] = {
          ...colorState[square],
          isActive: false,
        }
      }

      newState[color] = colorState
      return newState
    })
  }

  // Freeze a piece when decay timer expires
  const freezePiece = (square: string, color: "white" | "black") => {
    console.log(`[DECAY] Freezing piece at ${square} for ${color}`)

    setFrozenPieces((prev) => {
      const newFrozen = { ...prev }
      newFrozen[color] = new Set([...newFrozen[color], square])
      return newFrozen
    })

    // Stop the decay timer
    stopDecayTimer(square, color)

    // If this was a queen, start looking for the next major piece to decay
    const piece = getPieceAt(square)
    if (piece && isQueen(piece)) {
      startNextMajorPieceDecay(color)
    }
  }

  // Start decay timer for the next major piece when queen freezes
  const startNextMajorPieceDecay = (color: "white" | "black") => {
    // Find the next major piece that isn't frozen
    const fen = gameState.board.fen || gameState.board.position
    if (!fen) return

    const piecePlacement = fen.split(" ")[0]
    const rows = piecePlacement.split("/")

    for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
      const row = rows[rankIndex]
      let col = 0

      for (let i = 0; i < row.length; i++) {
        const c = row[i]
        if (c >= "1" && c <= "8") {
          col += Number.parseInt(c)
        } else {
          const square = `${FILES[col]}${RANKS[rankIndex]}`
          const pieceColor = getPieceColor(c)

          if (
            pieceColor === color &&
            isMajorPiece(c) &&
            !isQueen(c) &&
            !frozenPieces[color].has(square) &&
            !decayState[color][square]?.isActive
          ) {
            console.log(`[DECAY] Starting decay for next major piece: ${c} at ${square}`)
            startDecayTimer(square, c)
            return
          }
          col++
        }
      }
    }
  }

  // Move piece in decay state when a move is made
  const movePieceInDecayState = (from: string, to: string) => {
    const piece = getPieceAt(from)
    if (!piece) return

    const pieceColor = getPieceColor(piece)

    setDecayState((prev) => {
      const newState = { ...prev }
      const colorState = { ...newState[pieceColor] }

      // If the piece being moved has a decay timer, move it to the new square
      if (colorState[from]) {
        colorState[to] = { ...colorState[from] }
        delete colorState[from]
      }

      newState[pieceColor] = colorState
      return newState
    })

    // Update frozen pieces
    setFrozenPieces((prev) => {
      const newFrozen = { ...prev }
      if (newFrozen[pieceColor].has(from)) {
        newFrozen[pieceColor].delete(from)
        newFrozen[pieceColor].add(to)
      }
      return newFrozen
    })
  }

  // Decay timer countdown effect
  useEffect(() => {
    if (decayTimerRef.current) {
      clearInterval(decayTimerRef.current)
    }

    // Only run decay timers during the player's turn and if game is active
    if (gameState.status !== "active" || !isMyTurn) {
      return
    }

    decayTimerRef.current = setInterval(() => {
      setDecayState((prev) => {
        const newState = { ...prev }
        let hasActiveTimers = false

        // Update decay timers for current player only
        const colorState = { ...newState[playerColor] }

        Object.keys(colorState).forEach((square) => {
          const timer = colorState[square]
          if (timer.isActive && timer.timeLeft > 0) {
            hasActiveTimers = true
            timer.timeLeft = Math.max(0, timer.timeLeft - 100)

            // Freeze piece if timer expires
            if (timer.timeLeft <= 0) {
              console.log(`[DECAY] Timer expired for piece at ${square}`)
              setTimeout(() => freezePiece(square, playerColor), 0)
            }
          }
        })

        newState[playerColor] = colorState
        return newState
      })
    }, 100) // Update every 100ms

    return () => {
      if (decayTimerRef.current) {
        clearInterval(decayTimerRef.current)
      }
    }
  }, [isMyTurn, playerColor, gameState.status])

  // Function to handle game ending
  const handleGameEnd = (
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
  }

  // Function to manually navigate to menu
  const navigateToMenu = () => {
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
  }

  useEffect(() => {
    // Set up game socket connection
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

    // Check if this is the first move based on move history
    const moveCount = gameState.moves?.length || gameState.board?.moveHistory?.length || 0
    isFirstMoveRef.current = moveCount === 0
    console.log("[INIT] Move count:", moveCount, "Is first move:", isFirstMoveRef.current)

    // Initialize game start time
    if (!gameStartTimeRef.current) {
      gameStartTimeRef.current = Date.now()
    }

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
  }, [])

  // Always update playerColor and isMyTurn on every gameState change
  useEffect(() => {
    const userColor = gameState.userColor[userId]
    const safePlayerColor = userColor === "white" || userColor === "black" ? userColor : "white"
    setPlayerColor(safePlayerColor)
    setBoardFlipped(safePlayerColor === "black")
    setIsMyTurn(gameState.board.activeColor === safePlayerColor)

    console.log(
      "[DEBUG] userId:",
      userId,
      "userColor:",
      userColor,
      "playerColor:",
      safePlayerColor,
      "activeColor:",
      gameState.board.activeColor,
      "isMyTurn:",
      gameState.board.activeColor === safePlayerColor,
    )
  }, [gameState, userId])


const handleGameWarning = (data: any) => {
  // Show warning message, but do not interrupt the game
  const message = data?.message || "Warning: Invalid move or rule violation."
  Alert.alert("Warning", message)
}

  useEffect(() => {
  if (!socket) return

  // Listen for game events
  socket.on("game:move", handleGameMove)
  socket.on("game:possibleMoves", handlePossibleMoves)
  socket.on("game:gameState", handleGameStateUpdate)
  socket.on("game:timer", handleTimerUpdate)
  socket.on("game:end", handleGameEndEvent)
  socket.on("game:error", handleGameError)
  socket.on("game:warning", handleGameWarning) // <-- Add this line

  return () => {
    socket.off("game:move", handleGameMove)
    socket.off("game:possibleMoves", handlePossibleMoves)
    socket.off("game:gameState", handleGameStateUpdate)
    socket.off("game:timer", handleTimerUpdate)
    socket.off("game:end", handleGameEndEvent)
    socket.off("game:error", handleGameError)
    socket.off("game:warning", handleGameWarning) // <-- And this line
  }
}, [socket, playerColor])

  // Improved timer effect with proper turn-based countdown
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
    console.log("[TIMER] Server sync values - White:", currentWhiteTime, "Black:", currentBlackTime)
    console.log("[TIMER] Local timer values - White:", localTimers.white, "Black:", localTimers.black)

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
  ])

  const handleGameMove = (data: any) => {
    console.log("[MOVE] Move received:", data)
    if (data && data.gameState) {
      const now = Date.now()

      // Check if this was the first move
      const previousMoveCount = gameState.moves?.length || gameState.board?.moveHistory?.length || 0
      const newMoveCount = data.gameState.moves?.length || data.gameState.board?.moveHistory?.length || 0
      const wasFirstMove = previousMoveCount === 0 && newMoveCount === 1

      console.log(
        "[MOVE] Previous move count:",
        previousMoveCount,
        "New move count:",
        newMoveCount,
        "Was first move:",
        wasFirstMove,
      )

      // Handle decay logic for the moved piece
      if (data.move && data.move.from && data.move.to) {
        const movedPiece = getPieceAt(data.move.from)
        if (movedPiece && isMajorPiece(movedPiece)) {
          const pieceColor = getPieceColor(movedPiece)

          // Move the piece in decay state
          movePieceInDecayState(data.move.from, data.move.to)

          // Start decay timer if it's a queen or if it's the next major piece after queen froze
          if (isQueen(movedPiece)) {
            startDecayTimer(data.move.to, movedPiece)
          } else {
            // Check if this piece should start decaying (if queen is already frozen)
            const hasQueenFrozen = Array.from(frozenPieces[pieceColor]).some((square) => {
              const piece = getPieceAt(square)
              return piece && isQueen(piece)
            })

            if (hasQueenFrozen && !decayState[pieceColor][data.move.to]?.isActive) {
              startDecayTimer(data.move.to, movedPiece)
            }
          }
        }
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

      console.log("[MOVE] Timer values from server - White:", newWhiteTime, "Black:", newBlackTime)
      console.log("[MOVE] Previous local timers - White:", localTimers.white, "Black:", localTimers.black)

      // For the first move, preserve the initial timer values
      if (wasFirstMove) {
        console.log("[MOVE] First move detected - preserving initial timer values")
        newWhiteTime = localTimers.white
        newBlackTime = localTimers.black
      }

      // Update server sync reference
      lastServerSync.current = {
        white: newWhiteTime,
        black: newBlackTime,
        activeColor: data.gameState.board.activeColor,
        timestamp: now,
        turnStartTime: data.gameState.board.turnStartTimestamp || now,
        isFirstMove: newMoveCount === 0,
      }

      console.log("[MOVE] Updated server sync - Active color:", data.gameState.board.activeColor)

      // Check if the game has ended
      if (
        data.gameState.gameState?.gameEnded ||
        data.gameState.gameState?.checkmate ||
        data.gameState.status === "ended" ||
        data.gameState.shouldNavigateToMenu
      ) {
        console.log("[MOVE] Game ended detected:", data.gameState.gameState)
        const result = data.gameState.gameState?.result || data.gameState.result || "unknown"

        let winner = data.gameState.gameState?.winner || data.gameState.winner
        if (winner === "white" || winner === "black") {
          // Winner is already the color, use it as is
        } else if (data.gameState.gameState?.winnerColor) {
          winner = data.gameState.gameState.winnerColor
        } else if (result === "checkmate") {
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

        console.log(
          `[GAME ENDED] Reason: ${endReason}\n` +
            `Move: ${moveSan} by ${moveMaker}\n` +
            `Winner: ${winner}${winnerName ? ` (${winnerName})` : ""}`,
        )

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

      // Update local timers
      setLocalTimers({
        white: newWhiteTime,
        black: newBlackTime,
      })

      console.log("[MOVE] Updated local timers to - White:", newWhiteTime, "Black:", newBlackTime)

      setMoveHistory(data.gameState.moves || [])
      setSelectedSquare(null)
      setPossibleMoves([])

      // Update turn state
      const userColor = data.gameState.userColor ? data.gameState.userColor[userId] : playerColor
      const activeColor = data.gameState.board.activeColor
      const newIsMyTurn = activeColor === userColor
      setIsMyTurn(newIsMyTurn)

      console.log(
        "[MOVE] Turn update - Active color:",
        activeColor,
        "User color:",
        userColor,
        "Is my turn:",
        newIsMyTurn,
      )
    }
  }

  // Handles the 'game:possibleMoves' event from the server
  const handlePossibleMoves = (data: { square: string; moves: any[] }) => {
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
  }

  // Handles the 'game:gameState' event from the server
  const handleGameStateUpdate = (data: any) => {
    console.log("Game state update:", data)
    if (data && data.gameState) {
      // Check for game ending
      if (
        data.gameState.gameState?.gameEnded ||
        data.gameState.status === "ended" ||
        data.gameState.shouldNavigateToMenu
      ) {
        const result = data.gameState.gameState?.result || data.gameState.result || "unknown"
        let winner = data.gameState.gameState?.winner || data.gameState.winner

        if (winner === "white" || winner === "black") {
          // Winner is already the color
        } else if (data.gameState.gameState?.winnerColor) {
          winner = data.gameState.gameState.winnerColor
        }

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
  }

  const handleGameTimerUpdate = (data: any) => {
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
    } else if (typeof data.timers === "number" && typeof data.black === "number") {
      whiteTime = safeTimerValue(data.timers)
      blackTime = safeTimerValue(data.black)
    } else {
      whiteTime = safeTimerValue(data.white ?? data.timers?.white)
      blackTime = safeTimerValue(data.black ?? data.timers?.black)
    }

    console.log("[TIMER UPDATE] Parsed values - White:", whiteTime, "Black:", blackTime)

    // Check if this is still the first move
    const moveCount = gameState.moves?.length || gameState.board?.moveHistory?.length || 0
    const isFirstMove = moveCount === 0

    // Update server sync reference
    lastServerSync.current = {
      white: whiteTime,
      black: blackTime,
      activeColor: gameState.board.activeColor,
      timestamp: Date.now(),
      turnStartTime: Date.now(),
      isFirstMove: isFirstMove,
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

    console.log(
      "[TIMER UPDATE] Updated local timers to - White:",
      whiteTime,
      "Black:",
      blackTime,
      "Is first move:",
      isFirstMove,
    )
  }

  // Handles the 'game:timer' event from the server
  const handleTimerUpdate = (data: any) => {
    handleGameTimerUpdate(data)
  }

  // Handles the 'game:end' event from the server
  const handleGameEndEvent = (data: any) => {
    console.log("Game end event received:", data)
    const result = data.gameState?.gameState?.result || data.gameState?.result || data.result || "unknown"

    let winner = data.gameState?.gameState?.winner || data.gameState?.winner || data.winner
    if (winner === "white" || winner === "black") {
      // Winner is already the color
    } else if (data.gameState?.gameState?.winnerColor) {
      winner = data.gameState.gameState.winnerColor
    }

    const endReason = data.gameState?.gameState?.endReason || data.gameState?.endReason || data.endReason || result
    handleGameEnd(result, winner, endReason)
  }

  // Handles the 'game:error' event from the server
  const handleGameError = (data: any) => {
    console.log("Game error:", data)
    Alert.alert("Error", data.message || data.error || "An error occurred")
  }

  // Emits a request for possible moves for a square
  const requestPossibleMoves = (square: string) => {
    if (!socket) return
    socket.emit("game:getPossibleMoves", {
      square: square,
    })
  }

  // Emits a move to the server in the required format
  const makeMove = (move: Move) => {
    console.log(
      "[DEBUG] Attempting to make move",
      move,
      "isMyTurn:",
      isMyTurn,
      "playerColor:",
      playerColor,
      "activeColor:",
      gameState.board.activeColor,
    )

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
  }

  const handleSquarePress = (square: string) => {
    if (selectedSquare === square) {
      // Deselect if clicking the same square
      setSelectedSquare(null)
      setPossibleMoves([])
      return
    }

    if (selectedSquare && possibleMoves.includes(square)) {
      // Check if this move is a promotion
      const promotionOptions: string[] = []
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
  }

  // Handle promotion selection
  const handlePromotionSelect = (promotion: string) => {
    if (promotionModal) {
      makeMove({ from: promotionModal.from, to: promotionModal.to, promotion })
      setPromotionModal(null)
      setSelectedSquare(null)
      setPossibleMoves([])
    }
  }

  // Correct FEN parsing for piece lookup
  const getPieceAt = (square: string): string | null => {
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
  }

  const isPieceOwnedByPlayer = (piece: string, color: "white" | "black"): boolean => {
    if (color === "white") {
      return piece === piece.toUpperCase()
    } else {
      return piece === piece.toLowerCase()
    }
  }

  const formatTime = (milliseconds: number): string => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0:00"
    const totalSeconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  // Format decay timer
  const formatDecayTime = (milliseconds: number): string => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0.0"
    const totalSeconds = Math.floor(milliseconds / 100) / 10
    return totalSeconds.toFixed(1)
  }

  // Calculate material advantage
  const calculateMaterialAdvantage = () => {
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
  }

  const renderCapturedPieces = (color: "white" | "black") => {
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
            <Text style={styles.capturedPiece}>{PIECE_SYMBOLS[piece as keyof typeof PIECE_SYMBOLS]}</Text>
            {count > 1 && <Text style={styles.capturedCount}>{count}</Text>}
          </View>
        ))}
      </View>
    )
  }

  const renderSquare = (file: string, rank: string) => {
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
      borderColor = "#ef4444" // Red for frozen pieces
      borderWidth = 3
    } else if (isPossibleMove) {
      borderColor = "#4ade80" // Green for possible moves
      borderWidth = 3
    } else if (isSelected) {
      borderColor = "#60a5fa" // Blue for selected
      borderWidth = 3
    } else if (isLastMove) {
      borderColor = "#fbbf24" // Yellow for last move
      borderWidth = 2
    } else if (hasActiveDecayTimer) {
      borderColor = "#f97316" // Orange for decay timer
      borderWidth = 2
    }

    return (
      <View style={{ position: "relative" }}>
        {/* Decay timer display above the square */}
        {hasActiveDecayTimer && decayTimeLeft > 0 && (
          <View
            style={[
              styles.decayTimerAbove,
              {
                width: squareSize,
                left: 0,
                top: -32, // Position above the square
              },
            ]}
          >
            <View style={styles.decayTimerBox}>
              <Text style={styles.decayTimerBoxText}>{formatDecayTimeMinutes(decayTimeLeft)}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          key={square}
          style={[
            styles.square,
            {
              width: squareSize,
              height: squareSize,
              backgroundColor: isLight ? "#F0D9B5" : "#B58863",
              borderWidth: borderWidth,
              borderColor: borderColor,
            },
          ]}
          onPress={() => handleSquarePress(square)}
        >
          {/* Coordinate labels */}
          {file === "a" && (
            <Text style={[styles.coordinateLabel, styles.rankLabel, { color: isLight ? "#B58863" : "#F0D9B5" }]}>
              {rank}
            </Text>
          )}
          {rank === "1" && (
            <Text style={[styles.coordinateLabel, styles.fileLabel, { color: isLight ? "#B58863" : "#F0D9B5" }]}>
              {file}
            </Text>
          )}

          {/* Piece */}
          {piece && (
            <Text
              style={[
                styles.piece,
                {
                  fontSize: Math.min(squareSize * 0.7, isTablet ? 40 : isSmallScreen ? 24 : 32),
                  opacity: isFrozen ? 0.6 : 1,
                },
              ]}
            >
              {PIECE_SYMBOLS[piece as keyof typeof PIECE_SYMBOLS]}
            </Text>
          )}

          {/* Frozen indicator */}
          {isFrozen && (
            <View style={styles.frozenIndicator}>
              <Text style={styles.frozenText}>❄️</Text>
            </View>
          )}

          {/* Move indicators */}
          {isPossibleMove && !piece && <View style={styles.possibleMoveDot} />}
          {isPossibleMove && piece && <View style={styles.captureIndicator} />}
        </TouchableOpacity>
      </View>
    )
  }

  // Render game info (check, checkmate, stalemate, etc.)
  const renderGameInfo = () => {
    const gs = gameState.gameState || {}

    // Check if game has ended
    if (gameState.status === "ended" || gs.gameEnded) {
      return (
        <View style={styles.gameStatusContainer}>
          <Text style={styles.gameOverText}>🏁 Game Ended 🏁</Text>
        </View>
      )
    }

    // Show whose turn it is
    const activePlayerName = gameState.players[gameState.board.activeColor]?.username || gameState.board.activeColor
    const isMyTurnActive = gameState.board.activeColor === playerColor

    return (
      <View style={styles.gameStatusContainer}>
        <Text style={[styles.turnIndicator, isMyTurnActive && styles.myTurnIndicator]}>
          {isMyTurnActive ? "🎯 Your Turn" : `⏳ ${activePlayerName}'s Turn`}
        </Text>
        <Text style={styles.variantName}>⚡ Decay Queen Chess</Text>
      </View>
    )
  }

  const renderBoard = () => {
    const files = boardFlipped ? [...FILES].reverse() : FILES
    const ranks = boardFlipped ? [...RANKS].reverse() : RANKS

    return (
      <View style={styles.boardContainer}>
        <View style={styles.board}>
          {ranks.map((rank) => (
            <View key={rank} style={styles.row}>
              {files.map((file) => renderSquare(file, rank))}
            </View>
          ))}
        </View>
      </View>
    )
  }

  const renderPlayerInfo = (color: "white" | "black") => {
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
      <View style={[styles.playerInfoContainer, isActive && styles.activePlayerContainer]}>
        <View style={styles.playerHeader}>
          <View style={styles.playerDetails}>
            <View style={styles.playerNameRow}>
              <Text
                style={[
                  styles.playerColorIndicator,
                  {
                    color: color === "white" ? "#fff" : "#000",
                    backgroundColor: color === "white" ? "#000" : "#fff",
                  },
                ]}
              >
                {color === "white" ? "♔" : "♚"}
              </Text>
              <Text style={[styles.playerName, isActive && styles.activePlayerName]}>{player.username}</Text>
              {isMe && <Text style={styles.youIndicator}>(You)</Text>}
            </View>
            <Text style={styles.playerRating}>{player.rating > 0 ? `⭐ ${player.rating}` : "Unrated"}</Text>
            {advantage > 0 && <Text style={styles.materialAdvantage}>+{advantage}</Text>}

            {/* Decay status */}
            <View style={styles.decayStatus}>
              {activeDecayTimers > 0 && <Text style={styles.decayStatusText}>⏱️ {activeDecayTimers} decaying</Text>}
              {frozenPiecesCount > 0 && <Text style={styles.frozenStatusText}>❄️ {frozenPiecesCount} frozen</Text>}
            </View>
          </View>

          <View style={[styles.timerContainer, isActive && styles.activeTimerContainer]}>
            <Text style={[styles.timerText, isActive && styles.activeTimerText]}>⏱️ {formatTime(timer)}</Text>
          </View>
        </View>

        {renderCapturedPieces(color)}
        {isMe && isActive && <Text style={styles.yourTurnIndicator}>🎯 Your move!</Text>}
      </View>
    )
  }

  const renderMoveHistory = () => {
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
  }

  const handleFlipBoard = () => {
    setBoardFlipped(!boardFlipped)
  }

  // Determine player positions based on color and board orientation
  const topPlayerColor = boardFlipped ? playerColor : playerColor === "white" ? "black" : "white"
  const bottomPlayerColor = boardFlipped ? (playerColor === "white" ? "black" : "white") : playerColor

  return (
    <View style={styles.container}>
      {/* Top Player */}
      {renderPlayerInfo(topPlayerColor)}

      {/* Game Status */}
      {renderGameInfo()}

      {/* Chess Board */}
      {renderBoard()}

      {/* Bottom Player */}
      {renderPlayerInfo(bottomPlayerColor)}

      {/* Game Controls */}
      <View style={styles.controlsContainer}>
        <GameControls
          socket={socket}
          sessionId={gameState.sessionId}
          gameStatus={gameState.status}
          canResign={gameState.status === "active"}
          canOfferDraw={gameState.status === "active"}
          onFlipBoard={handleFlipBoard}
        />
        <TouchableOpacity style={styles.historyButton} onPress={() => setShowMoveHistory(true)}>
          <Text style={styles.historyButtonText}>📜 History</Text>
        </TouchableOpacity>
      </View>

      {/* Move History Modal */}
      {renderMoveHistory()}

      {/* Game End Modal */}
      <Modal visible={showGameEndModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.gameEndModal}>
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

import { StyleSheet } from "react-native"

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#242424",
    padding: 16,
    paddingTop: 40,
  },
  boardContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  board: {
    flexDirection: "column",
  },
  row: {
    flexDirection: "row",
  },
  square: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  piece: {
    fontSize: 24,
    textAlign: "center",
  },
  playerInfoContainer: {
    backgroundColor: "#333",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  activePlayerContainer: {
    backgroundColor: "#444",
  },
  playerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  playerDetails: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerColorIndicator: {
    fontSize: 16,
    marginRight: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    textAlign: "center",
    lineHeight: 20,
  },
  playerName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  activePlayerName: {
    color: "#4ade80",
  },
  youIndicator: {
    color: "#a1a1aa",
    fontSize: 14,
    marginLeft: 4,
  },
  playerRating: {
    color: "#a1a1aa",
    fontSize: 14,
  },
  timerContainer: {
    backgroundColor: "#222",
    padding: 8,
    borderRadius: 6,
  },
  activeTimerContainer: {
    backgroundColor: "#4ade80",
  },
  timerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  activeTimerText: {
    color: "#000",
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  historyButton: {
    backgroundColor: "#444",
    padding: 10,
    borderRadius: 6,
  },
  historyButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  moveHistoryModal: {
    backgroundColor: "#333",
    borderRadius: 8,
    width: "80%",
    maxHeight: "80%",
  },
  moveHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#444",
  },
  moveHistoryTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  moveHistoryScroll: {
    padding: 12,
  },
  moveRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  moveNumber: {
    color: "#a1a1aa",
    marginRight: 8,
    width: 24,
  },
  moveText: {
    color: "#fff",
    marginRight: 16,
  },
  gameEndModal: {
    backgroundColor: "#333",
    borderRadius: 8,
    padding: 24,
    width: "80%",
    alignItems: "center",
  },
  gameEndMessage: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  gameEndReason: {
    color: "#a1a1aa",
    fontSize: 16,
    marginBottom: 8,
  },
  gameEndMove: {
    color: "#a1a1aa",
    fontSize: 16,
    marginBottom: 8,
  },
  gameEndWinner: {
    color: "#4ade80",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  menuButton: {
    backgroundColor: "#444",
    padding: 12,
    borderRadius: 6,
    marginTop: 16,
  },
  menuButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  possibleMoveDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  captureIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255, 0, 0, 0.3)",
  },
  coordinateLabel: {
    position: "absolute",
    fontSize: 10,
  },
  rankLabel: {
    left: 2,
    top: 2,
  },
  fileLabel: {
    right: 2,
    bottom: 2,
  },
  gameStatusContainer: {
    marginBottom: 16,
    alignItems: "center",
  },
  turnIndicator: {
    color: "#a1a1aa",
    fontSize: 16,
    marginBottom: 4,
  },
  myTurnIndicator: {
    color: "#4ade80",
    fontWeight: "bold",
  },
  variantName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  gameOverText: {
    color: "#ef4444",
    fontSize: 20,
    fontWeight: "bold",
  },
  yourTurnIndicator: {
    color: "#4ade80",
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 8,
    textAlign: "center",
  },
  materialAdvantage: {
    color: "#4ade80",
    fontSize: 14,
    marginTop: 4,
  },
  capturedPieces: {
    flexDirection: "row",
    marginTop: 8,
  },
  capturedPieceGroup: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 4,
  },
  capturedPiece: {
    fontSize: 18,
    color: "#ddd",
  },
  capturedCount: {
    fontSize: 12,
    color: "#ddd",
    marginLeft: 2,
  },
  decayStatus: {
    flexDirection: "column",
    marginTop: 4,
  },
  decayStatusText: {
    color: "#f97316",
    fontSize: 12,
  },
  frozenStatusText: {
    color: "#ef4444",
    fontSize: 12,
  },
  frozenIndicator: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 10,
    padding: 2,
  },
  frozenText: {
    color: "#fff",
    fontSize: 10,
  },
  // Add these new styles to the styles object
  decayTimerAbove: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  decayTimerBox: {
    backgroundColor: "#1f2937",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#f97316",
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 50,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  decayTimerBoxText: {
    color: "#f97316",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
})
