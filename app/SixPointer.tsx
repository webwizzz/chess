"use client"

import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Alert, Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
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
    // 6PT Chess specific
    movesPlayed?: { white: number; black: number }
    maxMoves?: number
    points?: { white: number; black: number }
    variant?: string
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
  // 6PT Chess specific fields
  movesPlayed?: { white: number; black: number }
  maxMoves?: number
  points?: { white: number; black: number }
  variant?: string
}

interface Move {
  from: string
  to: string
  promotion?: string
}

interface SixPointerChessGameProps {
  initialGameState: GameState
  userId: string
  onNavigateToMenu?: () => void
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

export default function SixPointerChessGame({ initialGameState, userId, onNavigateToMenu }: SixPointerChessGameProps) {
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
    finalPoints?: { white: number; black: number }
  }>({})

  // Timer management
  const timerRef = useRef<NodeJS.Timeout | null>(null)
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

  // Calculate responsive sizes
  const containerPadding = isTablet ? 24 : isSmallScreen ? 12 : 16
  const boardSize = Math.min(screenWidth - containerPadding * 2, screenHeight * 0.5, isTablet ? 500 : 380)
  const squareSize = boardSize / 8
  const minTouchTarget = 44

  // Responsive text sizes
  const baseFontSize = isTablet ? 18 : isSmallScreen ? 14 : 16
  const titleFontSize = isTablet ? 24 : isSmallScreen ? 18 : 20
  const smallFontSize = isTablet ? 14 : isSmallScreen ? 11 : 12

  // Get 6PT specific values with defaults
  const getMovesPlayed = () => gameState.movesPlayed || gameState.gameState?.movesPlayed || { white: 0, black: 0 }
  const getPoints = () => gameState.points || gameState.gameState?.points || { white: 0, black: 0 }
  const getMaxMoves = () => gameState.maxMoves || gameState.gameState?.maxMoves || 6

  // Sixpointer state - FIXED detection
  const isSixPointer = gameState.timeControl?.type === "sixpointer"
  // Use perMove if present, else fallback
  const perMoveTime = (gameState.timeControl as any)?.perMove || 30000
  const [sixPointerTimer, setSixPointerTimer] = useState(perMoveTime)
  const [sixPointerMoves, setSixPointerMoves] = useState<{ white: number; black: number }>({ white: 0, black: 0 })
  const [sixPointerPoints, setSixPointerPoints] = useState<{ white: number; black: number }>({ white: 0, black: 0 })
  const [sixPointerMovesLeft, setSixPointerMovesLeft] = useState<{ white: number; black: number }>({
    white: 6,
    black: 6,
  })
  const sixPointerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Function to handle game ending
  const handleGameEnd = (
    result: string,
    winner: string | null,
    endReason: string,
    details?: {
      moveSan?: string
      moveMaker?: string
      winnerName?: string | null
      finalPoints?: { white: number; black: number }
    },
  ) => {
    console.log("[6PT GAME END] Result:", result, "Winner:", winner, "Reason:", endReason)

    // Stop all timers
    if (timerRef.current) {
      clearInterval(timerRef.current)
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
    } else if (result === "points") {
      // 6PT Chess specific: point-based victory
      const finalPoints = details?.finalPoints || getPoints()
      if (winner === playerColor) {
        playerWon = true
        message = `🎉 VICTORY! 🎉\nYou won by points!\nFinal Score: ${finalPoints.white} - ${finalPoints.black}`
      } else if (winner && winner !== playerColor) {
        playerWon = false
        message = `😔 DEFEAT 😔\nYou lost by points!\nFinal Score: ${finalPoints.white} - ${finalPoints.black}`
      } else {
        playerWon = null
        message = `⚖️ DRAW ⚖️\nEqual points!\nFinal Score: ${finalPoints.white} - ${finalPoints.black}`
      }
    } else if (result === "draw") {
      playerWon = null
      const finalPoints = details?.finalPoints || getPoints()
      message = `⚖️ DRAW ⚖️\n${endReason || "Game ended in a draw"}\nFinal Score: ${finalPoints.white} - ${finalPoints.black}`
    } else {
      playerWon = null
      message = `🏁 GAME OVER 🏁\n${result}`
    }

    setIsWinner(playerWon)
    setGameEndMessage(message)
    setShowGameEndModal(true)

    // Set details for UI
    setGameEndDetails({
      reason: endReason,
      moveSan: details?.moveSan,
      moveMaker: details?.moveMaker,
      winner,
      winnerName: details?.winnerName,
      finalPoints: details?.finalPoints,
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
    }, 7000) // Longer timeout for 6PT to show final scores
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
      console.log("Connected to 6PT Chess game socket")
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
    console.log("[6PT INIT] Move count:", moveCount, "Is first move:", isFirstMoveRef.current)

    // Initialize game start time
    if (!gameStartTimeRef.current) {
      gameStartTimeRef.current = Date.now()
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
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
      "[6PT DEBUG] userId:",
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

  useEffect(() => {
    if (!socket) return

    // Listen for game events
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
  }, [socket, playerColor])

  const handleGameMove = (data: any) => {
    console.log("[MOVE] Move received:", data)
    if (data && data.gameState) {
      const now = Date.now()

      if (isSixPointer) {
        // --- Sixpointer move logic ---
        // Prefer backend values for moves left and points if available
        let movesPlayed = { white: 0, black: 0 }
        let movesLeft = { white: 6, black: 6 }
        let points = { white: 0, black: 0 }

        // Try to get from board or gameState
        if (data.gameState.board?.movesPlayed) {
          movesPlayed = data.gameState.board.movesPlayed
        } else if (data.gameState.gameState?.movesPlayed) {
          movesPlayed = data.gameState.gameState.movesPlayed
        }

        if (data.gameState.board?.moveLeft) {
          movesLeft = data.gameState.board.moveLeft
        } else if (data.gameState.gameState?.moveLeft) {
          movesLeft = data.gameState.gameState.moveLeft
        } else {
          // fallback: maxMoves - movesPlayed
          const maxMoves = data.gameState.board?.maxMoves || data.gameState.gameState?.maxMoves || 6
          movesLeft = {
            white: maxMoves - (movesPlayed.white || 0),
            black: maxMoves - (movesPlayed.black || 0),
          }
        }

        if (data.gameState.board?.points) {
          points = data.gameState.board.points
        } else if (data.gameState.gameState?.points) {
          points = data.gameState.gameState.points
        }

        setSixPointerMoves(movesPlayed)
        setSixPointerMovesLeft(movesLeft)
        setSixPointerPoints(points)

        // FIXED: Only end game if BOTH players have 0 moves left
        if (movesLeft.white <= 0 && movesLeft.black <= 0) {
          let result = "draw"
          let winner: string | null = null
          if (points.white > points.black) {
            result = "white wins"
            winner = "white"
          } else if (points.black > points.white) {
            result = "black wins"
            winner = "black"
          }
          handleGameEnd(result, winner, "6 moves completed")
          return
        }

        // Also handle checkmate, stalemate, etc. as usual
        if (
          data.gameState.gameState?.gameEnded ||
          data.gameState.gameState?.checkmate ||
          data.gameState.status === "ended" ||
          data.gameState.shouldNavigateToMenu
        ) {
          const result = data.gameState.gameState?.result || data.gameState.result || "unknown"
          let winner = data.gameState.gameState?.winner || data.gameState.winner
          if (winner === "white" || winner === "black") {
            // Winner is already the color
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
          handleGameEnd(result, winner, endReason, { moveSan, moveMaker, winnerName })
          return
        }

        // Update game state for UI
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
              white: perMoveTime,
              black: perMoveTime,
            },
          },
          moves: data.gameState.moves || [],
          lastMove: data.gameState.lastMove,
          moveCount: data.gameState.moveCount,
        }))

        setMoveHistory(data.gameState.moves || [])
        setSelectedSquare(null)
        setPossibleMoves([])

        const userColor = data.gameState.userColor ? data.gameState.userColor[userId] : playerColor
        const activeColor = data.gameState.board.activeColor
        const newIsMyTurn = activeColor === userColor
        setIsMyTurn(newIsMyTurn)
        return
      }

      // --- Regular game logic for non-sixpointer games ---
      const previousMoveCount = gameState.moves?.length || gameState.board?.moveHistory?.length || 0
      const newMoveCount = data.gameState.moves?.length || data.gameState.board?.moveHistory?.length || 0
      const wasFirstMove = previousMoveCount === 0 && newMoveCount === 1

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
      lastServerSync.current = {
        white: newWhiteTime,
        black: newBlackTime,
        activeColor: data.gameState.board.activeColor,
        timestamp: now,
        turnStartTime: data.gameState.board.turnStartTimestamp || now,
        isFirstMove: newMoveCount === 0,
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
        if (winner === "white" || winner === "black") {
          // Winner is already the color
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

      setLocalTimers({
        white: newWhiteTime,
        black: newBlackTime,
      })

      setMoveHistory(data.gameState.moves || [])
      setSelectedSquare(null)
      setPossibleMoves([])

      const userColor = data.gameState.userColor ? data.gameState.userColor[userId] : playerColor
      const activeColor = data.gameState.board.activeColor
      const newIsMyTurn = activeColor === userColor
      setIsMyTurn(newIsMyTurn)
    }
  }

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

  const handleGameStateUpdate = (data: any) => {
    console.log("[6PT] Game state update:", data)
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
        const finalPoints = data.gameState.gameState?.points || data.gameState.points || getPoints()

        handleGameEnd(result, winner, endReason, { finalPoints })
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
        // 6PT Chess specific fields
        movesPlayed: data.gameState.movesPlayed || prevState.movesPlayed,
        points: data.gameState.points || prevState.points,
        maxMoves: data.gameState.maxMoves || prevState.maxMoves,
        variant: data.gameState.variant || prevState.variant,
      }))

      setIsMyTurn(data.gameState.board.activeColor === playerColor)
    }
  }

  const handleTimerUpdate = (data: any) => {
    console.log("[6PT] Timer update:", data)

    // Check for game ending in timer update
    if (data.gameEnded || data.shouldNavigateToMenu) {
      const result = data.endReason || "timeout"
      const winner = data.winner
      const finalPoints = data.points || getPoints()
      handleGameEnd(result, winner, result, { finalPoints })
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

    console.log("[6PT TIMER UPDATE] Parsed values - White:", whiteTime, "Black:", blackTime)

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
  }

  const handleGameEndEvent = (data: any) => {
    console.log("[6PT] Game end event received:", data)
    const result = data.gameState?.gameState?.result || data.gameState?.result || data.result || "unknown"
    let winner = data.gameState?.gameState?.winner || data.gameState?.winner || data.winner
    if (winner === "white" || winner === "black") {
      // Winner is already the color
    } else if (data.gameState?.gameState?.winnerColor) {
      winner = data.gameState.gameState.winnerColor
    }
    const endReason = data.gameState?.gameState?.endReason || data.gameState?.endReason || data.endReason || result
    const finalPoints = data.gameState?.gameState?.points || data.gameState?.points || data.points || getPoints()

    handleGameEnd(result, winner, endReason, { finalPoints })
  }

  const handleGameError = (data: any) => {
    console.log("[6PT] Game error:", data)
    Alert.alert("Error", data.message || data.error || "An error occurred")
  }

  const handleGameWarning = (data: any) => {
    const message = data?.message || "Warning: Invalid move or rule violation."
    Alert.alert("Warning", message)
  }

  useEffect(() => {
    // Clear existing timers
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (sixPointerTimerRef.current) {
      clearInterval(sixPointerTimerRef.current)
      sixPointerTimerRef.current = null
    }

    if (gameState.status !== "active" || gameState.gameState?.gameEnded) {
      return
    }

    if (isSixPointer) {
      // FIXED: Sixpointer timer logic - only run for active player whose turn it is
      const isActivePlayerTurn = gameState.board.activeColor === playerColor
      if (isActivePlayerTurn && isMyTurn) {
        // Reset timer for the active player
        setSixPointerTimer(perMoveTime)
        sixPointerTimerRef.current = setInterval(() => {
          setSixPointerTimer((prev: number) => {
            if (prev <= 1000) {
              if (sixPointerTimerRef.current) {
                clearInterval(sixPointerTimerRef.current)
                sixPointerTimerRef.current = null
              }
              // Penalty: -1 point, forfeit turn
              const color = gameState.board.activeColor
              setSixPointerPoints((pts) => ({ ...pts, [color]: pts[color] - 1 }))
              setSixPointerMoves((moves) => ({ ...moves, [color]: moves[color] + 1 }))
              return 0
            }
            return prev - 1000
          })
        }, 1000)
      }
    } else {
      // Regular timer logic
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

      timerRef.current = setInterval(() => {
        const now = Date.now()
        const serverSync = lastServerSync.current
        setLocalTimers(() => {
          let newWhite = serverSync.white
          let newBlack = serverSync.black

          // Only decrement time for the active player and only if it's not the first move
          if (!serverSync.isFirstMove) {
            if (serverSync.activeColor === "white") {
              newWhite = Math.max(0, serverSync.white - (now - serverSync.timestamp))
              newBlack = serverSync.black
            } else if (serverSync.activeColor === "black") {
              newBlack = Math.max(0, serverSync.black - (now - serverSync.timestamp))
              newWhite = serverSync.white
            }
          }

          // Check for timeout
          if (newWhite <= 0 && !gameState.gameState?.gameEnded) {
            handleGameEnd("timeout", "black", "White ran out of time")
            return { white: 0, black: newBlack }
          }
          if (newBlack <= 0 && !gameState.gameState?.gameEnded) {
            handleGameEnd("timeout", "white", "Black ran out of time")
            return { white: newWhite, black: 0 }
          }

          return { white: newWhite, black: newBlack }
        })
      }, 100)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (sixPointerTimerRef.current) {
        clearInterval(sixPointerTimerRef.current)
        sixPointerTimerRef.current = null
      }
    }
  }, [
    isSixPointer,
    gameState.status,
    gameState.board.activeColor,
    gameState.timeControl.timers.white,
    gameState.timeControl.timers.black,
    gameState.board.turnStartTimestamp,
    gameState.moves?.length,
    gameState.board?.moveHistory?.length,
    perMoveTime,
    gameState.gameState?.gameEnded,
    playerColor,
    isMyTurn,
  ])

  const renderPlayerInfo = (color: "white" | "black") => {
    const player = gameState.players[color]
    if (!player) {
      return (
        <View style={styles.playerInfoContainer}>
          <Text style={styles.playerName}>Unknown Player</Text>
        </View>
      )
    }

    // Use localTimers for smooth UI countdown, but sixPointerTimer for sixpointer
    const timer = isSixPointer
      ? gameState.board.activeColor === color && isMyTurn && color === playerColor
        ? sixPointerTimer
        : perMoveTime
      : safeTimerValue(localTimers[color])

    const isActive = gameState.board.activeColor === color && gameState.status === "active"
    const isMe = playerColor === color
    const materialAdvantage = calculateMaterialAdvantage()
    const advantage = materialAdvantage[color] - materialAdvantage[color === "white" ? "black" : "white"]

    // For sixpointer, show moves left and points (from backend)
    const movesLeft = isSixPointer ? sixPointerMovesLeft[color] : null
    const points = isSixPointer ? sixPointerPoints[color] : null

    return (
      <View style={[styles.playerInfoContainer, isActive && styles.activePlayerContainer]}>
        <View style={styles.playerHeader}>
          <View style={styles.playerDetails}>
            <View style={styles.playerNameRow}>
              <Text
                style={[
                  styles.playerColorIndicator,
                  { color: color === "white" ? "#fff" : "#000", backgroundColor: color === "white" ? "#000" : "#fff" },
                ]}
              >
                {color === "white" ? "♔" : "♚"}
              </Text>
              <Text style={[styles.playerName, isActive && styles.activePlayerName]}>{player.username}</Text>
              {isMe && <Text style={styles.youIndicator}>(You)</Text>}
            </View>
            <Text style={styles.playerRating}>{player.rating > 0 ? `⭐ ${player.rating}` : "Unrated"}</Text>
            {isSixPointer && (
              <Text style={styles.materialAdvantage}>
                Points: {points} | Moves left: {movesLeft}
              </Text>
            )}
            {!isSixPointer && advantage > 0 && <Text style={styles.materialAdvantage}>+{advantage}</Text>}
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

  // Rest of the component methods remain the same as classic chess
  const requestPossibleMoves = (square: string) => {
    if (!socket) return
    socket.emit("game:getPossibleMoves", {
      square: square,
    })
  }

  const makeMove = (move: Move) => {
    console.log(
      "[6PT DEBUG] Attempting to make move",
      move,
      "isMyTurn:",
      isMyTurn,
      "playerColor:",
      playerColor,
      "activeColor:",
      gameState.board.activeColor,
    )

    if (!socket || !isMyTurn) {
      console.log("[6PT DEBUG] Not emitting move: socket or isMyTurn false")
      return
    }

    // Check if player has moves remaining
    const movesPlayed = getMovesPlayed()
    const maxMoves = getMaxMoves()
    const playerMovesUsed = movesPlayed[playerColor] || 0

    if (playerMovesUsed >= maxMoves) {
      Alert.alert("Move Limit Reached", `You have already used all ${maxMoves} moves!`)
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
    console.log("[6PT DEBUG] Move emitted:", { from: move.from, to: move.to, promotion: move.promotion })
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
        const options = ["q", "r", "b", "n"]
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
      setSelectedSquare(square)
      requestPossibleMoves(square)
    } else {
      setSelectedSquare(null)
      setPossibleMoves([])
    }
  }

  const handlePromotionSelect = (promotion: string) => {
    if (promotionModal) {
      makeMove({ from: promotionModal.from, to: promotionModal.to, promotion })
      setPromotionModal(null)
      setSelectedSquare(null)
      setPossibleMoves([])
    }
  }

  const getPieceAt = (square: string): string | null => {
    const fileIndex = FILES.indexOf(square[0])
    const rankIndex = RANKS.indexOf(square[1])
    if (fileIndex === -1 || rankIndex === -1) return null

    const fen = gameState.board.fen || gameState.board.position
    if (!fen) return null

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

    // Use the last move from moveHistory if available
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

    return (
      <TouchableOpacity
        key={square}
        style={[
          styles.square,
          {
            width: squareSize,
            height: squareSize,
            backgroundColor: isLight ? "#F0D9B5" : "#B58863",
            borderWidth: isPossibleMove ? 3 : isSelected ? 3 : isLastMove ? 2 : 0,
            borderColor: isPossibleMove ? "#4ade80" : isSelected ? "#60a5fa" : isLastMove ? "#fbbf24" : "transparent",
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
        {piece && (
          <Text
            style={[
              styles.piece,
              {
                fontSize: Math.min(squareSize * 0.7, isTablet ? 40 : isSmallScreen ? 24 : 32),
              },
            ]}
          >
            {PIECE_SYMBOLS[piece as keyof typeof PIECE_SYMBOLS]}
          </Text>
        )}
        {isPossibleMove && !piece && <View style={styles.possibleMoveDot} />}
        {isPossibleMove && piece && <View style={styles.captureIndicator} />}
      </TouchableOpacity>
    )
  }

  // Render game info with 6PT specific information
  const renderGameInfo = () => {
    const gs = gameState.gameState || {}
    const movesPlayed = getMovesPlayed()
    const points = getPoints()
    const maxMoves = getMaxMoves()

    // Check if game has ended
    if (gameState.status === "ended" || gs.gameEnded) {
      return (
        <View style={styles.gameStatusContainer}>
          <Text style={styles.gameOverText}>🏁 6PT Game Ended 🏁</Text>
          <Text style={styles.pointsDisplay}>
            Final Score: {points.white} - {points.black}
          </Text>
        </View>
      )
    }

    // Show whose turn it is with 6PT specific info
    const activePlayerName = gameState.players[gameState.board.activeColor]?.username || gameState.board.activeColor
    const isMyTurnActive = gameState.board.activeColor === playerColor
    const activePlayerMovesLeft = maxMoves - (movesPlayed[gameState.board.activeColor] || 0)

    return (
      <View style={styles.gameStatusContainer}>
        <Text style={[styles.turnIndicator, isMyTurnActive && styles.myTurnIndicator]}>
          {isMyTurnActive ? "🎯 Your Turn" : `⏳ ${activePlayerName}'s Turn`}
        </Text>
        <Text style={styles.movesLeftIndicator}>
          Moves left: {activePlayerMovesLeft}/{maxMoves}
        </Text>
        <Text style={styles.pointsDisplay}>
          Score: {points.white} - {points.black}
        </Text>
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
              <Text style={styles.moveHistoryTitle}>📜 6PT Move History</Text>
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
      <Modal visible={showGameEndModal} transparent animationType="fade" onRequestClose={() => {}}>
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
              {isWinner === true ? "🎉 VICTORY! 🎉" : isWinner === false ? "😔 DEFEAT 😔" : "🏁 6PT GAME OVER 🏁"}
            </Text>
            <Text style={styles.gameEndMessage}>{gameEndMessage}</Text>

            {/* Show extra details if available */}
            {(gameEndDetails.reason ||
              gameEndDetails.moveSan ||
              gameEndDetails.winner ||
              gameEndDetails.finalPoints) && (
              <View style={{ marginBottom: 16, marginTop: -10 }}>
                {gameEndDetails.reason && (
                  <Text style={{ color: "#94a3b8", fontSize: 16, textAlign: "center", marginBottom: 2 }}>
                    Reason: {gameEndDetails.reason}
                  </Text>
                )}
                {gameEndDetails.moveSan && (
                  <Text style={{ color: "#94a3b8", fontSize: 16, textAlign: "center", marginBottom: 2 }}>
                    Move: {gameEndDetails.moveSan}
                    {gameEndDetails.moveMaker ? ` by ${gameEndDetails.moveMaker}` : ""}
                  </Text>
                )}
                {gameEndDetails.winner && (
                  <Text style={{ color: "#4ade80", fontSize: 16, textAlign: "center", marginBottom: 2 }}>
                    Winner: {gameEndDetails.winner}
                    {gameEndDetails.winnerName ? ` (${gameEndDetails.winnerName})` : ""}
                  </Text>
                )}
                {gameEndDetails.finalPoints && (
                  <Text style={{ color: "#60a5fa", fontSize: 16, textAlign: "center", marginBottom: 2 }}>
                    Final Score: {gameEndDetails.finalPoints.white} - {gameEndDetails.finalPoints.black}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Promotion Modal */}
      <Modal
        visible={!!promotionModal && promotionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPromotionModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.promotionModal}>
            <Text style={styles.promotionTitle}>👑 Choose Promotion Piece</Text>
            <View style={styles.promotionOptions}>
              {promotionModal &&
                promotionModal.options.map((p) => (
                  <TouchableOpacity key={p} style={styles.promotionOption} onPress={() => handlePromotionSelect(p)}>
                    <Text style={styles.promotionPiece}>
                      {
                        PIECE_SYMBOLS[
                          (playerColor === "white" ? p.toUpperCase() : p.toLowerCase()) as keyof typeof PIECE_SYMBOLS
                        ]
                      }
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
            <TouchableOpacity onPress={() => setPromotionModal(null)} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    minHeight: 300,
  },
  playerInfoContainer: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 2,
    borderColor: "#0f3460",
    minHeight: 80,
  },
  activePlayerContainer: {
    borderColor: "#4ade80",
    backgroundColor: "#1e3a2e",
    shadowColor: "#4ade80",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  playerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    minHeight: 44,
  },
  playerDetails: {
    flex: 1,
    marginRight: 12,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    flexWrap: "wrap",
  },
  playerColorIndicator: {
    fontSize: 20,
    fontWeight: "bold",
    marginRight: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 35.2,
    textAlign: "center",
  },
  playerName: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "bold",
    marginRight: 12,
    flexShrink: 1,
  },
  activePlayerName: {
    color: "#4ade80",
  },
  youIndicator: {
    color: "#60a5fa",
    fontSize: 14,
    fontStyle: "italic",
  },
  playerRating: {
    color: "#94a3b8",
    fontSize: 14,
    marginBottom: 6,
  },
  sixPTInfo: {
    color: "#60a5fa",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  materialAdvantage: {
    color: "#4ade80",
    fontSize: 14,
    fontWeight: "bold",
  },
  timerContainer: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    minWidth: 120,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  activeTimerContainer: {
    backgroundColor: "#4ade80",
    borderColor: "#4ade80",
  },
  timerText: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  activeTimerText: {
    color: "#000",
  },
  capturedPieces: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    minHeight: 30,
  },
  capturedPieceGroup: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
    marginBottom: 6,
  },
  capturedPiece: {
    fontSize: 16,
    color: "#94a3b8",
  },
  capturedCount: {
    fontSize: 12,
    color: "#60a5fa",
    marginLeft: 2,
    fontWeight: "bold",
  },
  yourTurnIndicator: {
    color: "#4ade80",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 8,
  },
  movesExhaustedIndicator: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 8,
  },
  gameStatusContainer: {
    alignItems: "center",
    marginVertical: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#16213e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0f3460",
    maxWidth: "90%",
    minHeight: 44,
    justifyContent: "center",
  },
  turnIndicator: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  myTurnIndicator: {
    color: "#4ade80",
  },
  movesLeftIndicator: {
    color: "#60a5fa",
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
  },
  pointsDisplay: {
    color: "#fbbf24",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 4,
  },
  gameOverText: {
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  boardContainer: {
    alignItems: "center",
    marginVertical: 16,
    width: "100%",
  },
  board: {
    borderWidth: 3,
    borderColor: "#8b5a2b",
    borderRadius: 8,
    backgroundColor: "#8b5a2b",
    padding: 6,
    width: 388,
    height: 388,
  },
  row: {
    flexDirection: "row",
  },
  square: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    minHeight: 35.2,
    minWidth: 35.2,
  },
  coordinateLabel: {
    position: "absolute",
    fontSize: 12,
    fontWeight: "bold",
  },
  rankLabel: {
    top: 3,
    left: 3,
  },
  fileLabel: {
    bottom: 3,
    right: 3,
  },
  piece: {
    fontWeight: "bold",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  possibleMoveDot: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#4ade80",
    opacity: 0.8,
  },
  captureIndicator: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderTopWidth: 16,
    borderLeftColor: "transparent",
    borderTopColor: "#ef4444",
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    maxWidth: 500,
    marginTop: 16,
    paddingHorizontal: 8,
  },
  historyButton: {
    backgroundColor: "#16213e",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#0f3460",
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  historyButtonText: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  moveHistoryModal: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    width: "95%",
    maxWidth: 500,
    maxHeight: "80%",
    borderWidth: 2,
    borderColor: "#0f3460",
  },
  moveHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#0f3460",
    minHeight: 64,
  },
  moveHistoryTitle: {
    color: "#e2e8f0",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  closeButton: {
    padding: 12,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    color: "#94a3b8",
    fontSize: 20,
    fontWeight: "bold",
  },
  moveHistoryScroll: {
    flex: 1,
    padding: 20,
  },
  moveRow: {
    flexDirection: "row",
    marginBottom: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  moveNumber: {
    color: "#94a3b8",
    fontSize: 16,
    width: 40,
    fontWeight: "bold",
  },
  moveText: {
    color: "#e2e8f0",
    fontSize: 16,
    width: 80,
    marginHorizontal: 12,
  },
  gameEndModal: {
    backgroundColor: "#16213e",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#0f3460",
    maxWidth: "90%",
    minWidth: 300,
  },
  victoryModal: {
    borderColor: "#4ade80",
    backgroundColor: "#1e3a2e",
  },
  defeatModal: {
    borderColor: "#ef4444",
    backgroundColor: "#3a1e1e",
  },
  gameEndTitle: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
    color: "#e2e8f0",
  },
  victoryTitle: {
    color: "#4ade80",
  },
  defeatTitle: {
    color: "#ef4444",
  },
  gameEndMessage: {
    fontSize: 18,
    textAlign: "center",
    marginBottom: 30,
    color: "#e2e8f0",
    lineHeight: 24,
  },
  menuButton: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  menuButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  promotionModal: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0f3460",
    maxWidth: "90%",
  },
  promotionTitle: {
    color: "#e2e8f0",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 24,
    textAlign: "center",
  },
  promotionOptions: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
    flexWrap: "wrap",
  },
  promotionOption: {
    margin: 12,
    padding: 16,
    backgroundColor: "#0f172a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    minWidth: 54,
    minHeight: 54,
    justifyContent: "center",
    alignItems: "center",
  },
  promotionPiece: {
    fontSize: 32,
    textAlign: "center",
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: "#374151",
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#94a3b8",
    fontSize: 18,
  },
})
