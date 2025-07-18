"use client"

import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Alert, Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import type { Socket } from "socket.io-client"
import { getSocketInstance } from "../utils/socketManager"
// Removed GameControls import as it's no longer needed

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

const screenWidth = Dimensions.get("window").width
const screenHeight = Dimensions.get("window").height
const boardSize = screenWidth
const squareSize = boardSize / 8

const fontSizes = {
  timer: 20,
  piece: Math.min(squareSize * 0.7, 32),
  username: 16,
  rating: 14,
  coordinates: 12,
  points: 24, // For the large point circle
  movesLeft: 12, // For the "moves left" text (general label)
  moveNumberInBox: 10, // New: For the number inside the move boxes
}

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
  
  const lastUpdateRef = useRef<number>(Date.now())
  const gameStartTimeRef = useRef<number | null>(null)
  const isFirstMoveRef = useRef<boolean>(true) // Track if this is the first move
  const timerRef = useRef<any>(null)
  const navigationTimeoutRef = useRef<any>(null)

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

  // Chess.com style board sizing - full width

  // Chess.com style responsive values

  // Get 6PT specific values with defaults
  const getMovesPlayed = () => gameState.movesPlayed || gameState.gameState?.movesPlayed || { white: 0, black: 0 }
  const getPoints = () => gameState.points || gameState.gameState?.points || { white: 0, black: 0 }
  const getMaxMoves = () => gameState.maxMoves || gameState.gameState?.maxMoves || 6

  // Sixpointer state - FIXED detection
  const isSixPointer = gameState.timeControl?.type === "sixpointer"

  // Use perMove if present, else fallback
  const perMoveTime = (gameState.timeControl as any)?.perMove || 30000
  const [sixPointerPoints, setSixPointerPoints] = useState<{ white: number; black: number }>({ white: 0, black: 0 })
  const [sixPointerMoves, setSixPointerMoves] = useState<{ white: number; black: number }>({ white: 0, black: 0 })

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
          handleGameEnd(result, winner, "6 moves completed", { finalPoints: points })
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

          handleGameEnd(result, winner, endReason, { moveSan, moveMaker, winnerName, finalPoints: points })
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
              white: safeTimerValue(data.gameState.timeControl?.timers?.white || data.gameState.board?.whiteTime),
              black: safeTimerValue(data.gameState.timeControl?.timers?.black || data.gameState.board?.blackTime),
            },
          },
          moves: data.gameState.moves || [],
          lastMove: data.gameState.lastMove,
          moveCount: data.gameState.moveCount,
          // Explicitly update movesPlayed and points from the calculated values
          movesPlayed: movesPlayed,
          points: points,
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
        turnStartTime: Date.now(),
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
    } else if (typeof data.white === "number" && typeof data.black === "number") {
      whiteTime = safeTimerValue(data.white)
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
    setGameState((prev) => ({ ...prev, gameState: prev.gameState || {} }))
    Alert.alert("Error", data.message || data.error || "An error occurred")
  }

  const handleGameWarning = (data: any) => {
    const message = data?.message || "Warning: Invalid move or rule violation."
    console.log("[6PT] Game warning:", message)
    setGameState((prev) => ({ ...prev, gameState: data.gameState }))
    Alert.alert("Warning", message)
  }

  const lastActiveColorRef = useRef<"white" | "black" | null>(null)

  useEffect(() => {
    // Clear existing timers
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (gameState.status !== "active" || gameState.gameState?.gameEnded) {
      return
    }

    const currentWhiteTime = safeTimerValue(gameState.timeControl.timers.white)
    const currentBlackTime = safeTimerValue(gameState.timeControl.timers.black)

    // Update server sync reference when the effect runs due to gameState change
    lastServerSync.current = {
      white: currentWhiteTime,
      black: currentBlackTime,
      activeColor: gameState.board.activeColor,
      timestamp: Date.now(),
      turnStartTime: gameState.board.turnStartTimestamp || Date.now(),
      isFirstMove: (gameState.moves?.length || gameState.board?.moveHistory?.length || 0) === 0,
    }

    timerRef.current = setInterval(() => {
      const now = Date.now()
      const serverSync = lastServerSync.current // Snapshot from last server update

      let newWhite = serverSync.white
      let newBlack = serverSync.black

      // Calculate time elapsed since the last server sync point
      const timeSinceLastSync = now - serverSync.timestamp

      // Only decrement the active player's time
      if (serverSync.activeColor === "white") {
        newWhite = Math.max(0, serverSync.white - timeSinceLastSync)
      } else if (serverSync.activeColor === "black") {
        newBlack = Math.max(0, serverSync.black - timeSinceLastSync)
      }

      // Update local timers
      setLocalTimers({
        white: newWhite,
        black: newBlack,
      })

      // Check for timeout
      if (newWhite <= 0 && !gameState.gameState?.gameEnded) {
        handleGameEnd("timeout", "black", "White ran out of time")
        // Return the final state to prevent further decrement
        return { white: 0, black: newBlack }
      }
      if (newBlack <= 0 && !gameState.gameState?.gameEnded) {
        handleGameEnd("timeout", "white", "Black ran out of time")
        // Return the final state to prevent further decrement
        return { white: newWhite, black: 0 }
      }
    }, 100) // Tick every 100ms for smoother display

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
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
      setPromotionModal(null)
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
    const piece = getPieceAt(square)
    const isCapture = isPossibleMove && piece && !isPieceOwnedByPlayer(piece, playerColor)

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

    return (
      <TouchableOpacity
        key={square}
        style={[
          styles.square,
          {
            width: squareSize,
            height: squareSize,
            backgroundColor: isLight ? "#F0D9B5" : "#769656", // Exact Chess.com colors
          },
          isLastMove && styles.lastMoveSquare,
          isSelected && styles.selectedSquare,
          isPossibleMove && !isCapture && styles.possibleMoveSquare,
          isCapture && styles.captureMoveSquare,
        ]}
        onPress={() => handleSquarePress(square)}
      >
        {piece && (
          <Text
            style={[
              styles.piece,
              {
                fontSize: fontSizes.piece,
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

  const renderCoordinates = () => {
    const files = boardFlipped ? [...FILES].reverse() : FILES
    const ranks = boardFlipped ? [...RANKS].reverse() : RANKS

    return (
      <>
        {/* File coordinates (a-h) at bottom */}
        <View style={styles.fileCoordinates}>
          {files.map((file, index) => (
            <View key={file} style={{ width: squareSize, alignItems: "center" }}>
              <Text style={styles.coordinateText}>{file}</Text>
            </View>
          ))}
        </View>

        {/* Rank coordinates (1-8) on right side */}
        <View style={styles.rankCoordinates}>
          {ranks.map((rank, index) => (
            <View key={rank} style={{ height: squareSize, justifyContent: "center" }}>
              <Text style={styles.coordinateText}>{rank}</Text>
            </View>
          ))}
        </View>
      </>
    )
  }

  const renderBoard = () => {
    const files = boardFlipped ? [...FILES].reverse() : FILES
    const ranks = boardFlipped ? [...RANKS].reverse() : RANKS

    return (
      <View style={styles.boardContainer}>
        <View style={styles.boardWrapper}>
          <View
            style={[
              styles.board,
              {
                width: boardSize,
                height: boardSize,
              },
            ]}
          >
            {ranks.map((rank) => (
              <View key={rank} style={styles.row}>
                {files.map((file) => renderSquare(file, rank))}
              </View>
            ))}
          </View>
          {renderCoordinates()}
        </View>
      </View>
    )
  }

  const renderMovesLeftIndicators = (color: "white" | "black") => {
    const maxMoves = getMaxMoves()
    const movesPlayedCount = getMovesPlayed()[color] || 0 // Number of moves made by this player
    const indicators = []

    for (let i = 0; i < maxMoves; i++) {
      const isMoveMade = i < movesPlayedCount
      const displayMoveNumber = isMoveMade ? (i + 1).toString() : "" // Display 1, 2, 3...

      indicators.push(
        <View key={i} style={[styles.moveSquare, isMoveMade ? styles.filledMoveSquare : styles.emptyMoveSquare]}>
          <Text style={[styles.moveNumberInBox, isMoveMade ? styles.filledMoveNumberText : styles.emptyMoveNumberText]}>
            {displayMoveNumber}
          </Text>
        </View>,
      )
    }
    return <View style={styles.movesLeftContainer}>{indicators}</View>
  }

  const renderPlayerInfo = (color: "white" | "black", isTop: boolean) => {
    const player = gameState.players[color]
    if (!player) return null

    const timer = safeTimerValue(localTimers[color])

    const isActivePlayer = gameState.board.activeColor === color
    const isMe = playerColor === color
    const currentPoints = getPoints()[color]

    return (
      <View style={[styles.playerInfoBlock, isTop ? styles.topPlayerBlock : styles.bottomPlayerBlock]}>
        <View style={styles.playerInfoLeft}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{player.username.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.pointsCircle}>
              <Text style={styles.pointsText}>{currentPoints}</Text>
            </View>
          </View>
          <View style={styles.playerDetails}>
            <Text style={styles.playerName}>
              {player.username} {isMe && <Text style={styles.youIndicator}>YOU</Text>}
            </Text>
            <Text style={styles.playerRating}>({player.rating})</Text>
            {/* ADD THIS LINE to display captured pieces */}
            {renderCapturedPieces(color)}
          </View>
        </View>

        <View style={styles.playerInfoRight}>
          <View style={[styles.timerContainer, isActivePlayer && styles.activeTimer]}>
            <Text style={[styles.timer, { fontSize: fontSizes.timer }]}>{formatTime(timer)}</Text>
          </View>
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
              <Text style={styles.moveHistoryTitle}>Moves</Text>
              <TouchableOpacity onPress={() => setShowMoveHistory(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.moveHistoryScroll}>
              {movePairs.map((pair, index) => (
                <View key={index} style={styles.moveRow}>
                  <Text style={styles.moveNumber}>{pair.moveNumber}.</Text>
                  <Text style={styles.moveText}>{pair.black}</Text>
                  <Text style={styles.moveText}>{pair.white}</Text>
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

  const opponentColor = playerColor === "white" ? "black" : "white"

  return (
    <View style={styles.container}>
      {/* Top Player Info Block */}
      {renderPlayerInfo(opponentColor, true)}

      {/* Top Moves Left Indicators */}
      {isSixPointer && <View style={styles.movesLeftRowWrapperTop}>{renderMovesLeftIndicators(opponentColor)}</View>}

      {/* Chess Board */}
      {renderBoard()}

      {/* Bottom Moves Left Indicators */}
      {isSixPointer && <View style={styles.movesLeftRowWrapperBottom}>{renderMovesLeftIndicators(playerColor)}</View>}

      {/* Bottom Player Info Block */}
      {renderPlayerInfo(playerColor, false)}

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
              {isWinner === true ? "🎉 VICTORY! 🎉" : isWinner === false ? "😔 DEFEAT 😔" : "🏁 GAME OVER 🏁"}
            </Text>
            <Text style={styles.gameEndMessage}>{gameEndMessage}</Text>
            {/* Show extra details if available */}
            {(gameEndDetails.reason ||
              gameEndDetails.moveSan ||
              gameEndDetails.winner ||
              gameEndDetails.finalPoints) && (
              <View style={styles.gameEndDetailsContainer}>
                {gameEndDetails.reason && <Text style={styles.gameEndDetailText}>Reason: {gameEndDetails.reason}</Text>}
                {gameEndDetails.moveSan && (
                  <Text style={styles.gameEndDetailText}>
                    Move: {gameEndDetails.moveSan}
                    {gameEndDetails.moveMaker ? ` by ${gameEndDetails.moveMaker}` : ""}
                  </Text>
                )}
                {gameEndDetails.winner && (
                  <Text style={styles.gameEndDetailText}>
                    Winner: {gameEndDetails.winner}
                    {gameEndDetails.winnerName ? ` (${gameEndDetails.winnerName})` : ""}
                  </Text>
                )}
                {gameEndDetails.finalPoints && (
                  <Text style={styles.gameEndDetailText}>
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
    backgroundColor: "#2c2c2c", // Chess.com dark background
    justifyContent: "space-between", // Distribute content vertically
    alignItems: "center",
  },
  playerInfoBlock: {
    width: "100%",
    backgroundColor: "#2c2c2c", // Match overall background
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#3a3a3a", // Subtle separator
  },
  topPlayerBlock: {
    paddingTop: 20, // Account for status bar
  },
  bottomPlayerBlock: {
    borderTopWidth: 1,
    borderBottomWidth: 0,
    borderTopColor: "#3a3a3a",
    paddingBottom: 20, // Account for bottom safe area
  },
  playerInfoLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    backgroundColor: "#666",
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  pointsCircle: {
    position: "absolute",
    bottom: -5,
    right: -5,
    backgroundColor: "#4a4a4a", // Darker gray for points circle
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#2c2c2c", // Match background
  },
  pointsText: {
    color: "#fff",
    fontSize: fontSizes.points, // Ensure this uses the correct font size for points
    fontWeight: "bold",
  },
  playerDetails: {
    flex: 1,
  },
  playerName: {
    color: "#fff",
    fontSize: fontSizes.username,
    fontWeight: "500",
  },
  youIndicator: {
    color: "#90EE90", // Green for "YOU"
    fontSize: fontSizes.rating,
    fontWeight: "bold",
    marginLeft: 5,
  },
  playerRating: {
    color: "#999",
    fontSize: fontSizes.rating,
  },
  playerInfoRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  timerContainer: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 70,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },
  activeTimer: {
    borderColor: "#90EE90", // Green border for active timer
  },
  timer: {
    color: "#fff",
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  // New styles for positioning the moves left indicators
  movesLeftRowWrapperTop: {
    width: "100%",
    alignItems: "flex-end", // Aligns the row of boxes to the right
    paddingHorizontal: 16, // Matches player info padding
    paddingBottom: 8, // Space between indicators and board
  },
  movesLeftRowWrapperBottom: {
    width: "100%",
    alignItems: "flex-end", // Aligns the row of boxes to the right
    paddingHorizontal: 16, // Matches player info padding
    paddingTop: 8, // Space between indicators and board
  },
  movesLeftContainer: {
    flexDirection: "row",
    // Removed justifyContent: "center" as alignment is handled by parent wrapper
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  moveSquare: {
    width: 20, // Increased size for number
    height: 20, // Increased size for number
    borderRadius: 4, // Slightly larger border radius
    marginHorizontal: 3, // Adjusted margin
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1, // Add border for definition
    borderColor: "#666", // Default border color
  },
  filledMoveSquare: {
    backgroundColor: "#90EE90", // Green for filled moves
    borderColor: "#90EE90", // Green border for filled moves
  },
  emptyMoveSquare: {
    backgroundColor: "#4a4a4a", // Darker gray for empty moves
    borderColor: "#666", // Gray border for empty moves
  },
  moveNumberInBox: {
    fontSize: fontSizes.moveNumberInBox, // Use the new font size
    fontWeight: "bold",
  },
  filledMoveNumberText: {
    color: "#000", // Black text for green boxes
  },
  emptyMoveNumberText: {
    color: "#999", // Gray text for empty boxes
  },
  boardContainer: {
    alignItems: "center",
    justifyContent: "center",
    // Removed flex: 1 and width: "100%" here as it's now managed by the main container's flex
  },
  boardWrapper: {
    position: "relative",
  },
  board: {
    borderRadius: 0, // No border radius for full-width board
  },
  fileCoordinates: {
    flexDirection: "row",
    position: "absolute",
    bottom: -20,
    left: 0,
  },
  rankCoordinates: {
    position: "absolute",
    right: -20,
    top: 0,
  },
  coordinateText: {
    color: "#999",
    fontSize: fontSizes.coordinates,
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
  },
  square: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  lastMoveSquare: {
    backgroundColor: "#f7ec74", // Chess.com last move highlight
  },
  selectedSquare: {
    backgroundColor: "#f7ec74", // Same as last move for consistency
  },
  possibleMoveSquare: {
    backgroundColor: "rgba(255, 255, 0, 0.3)", // Subtle highlight for possible moves
  },
  captureMoveSquare: {
    backgroundColor: "rgba(255, 0, 0, 0.3)", // Red tint for captures
  },
  piece: {
    fontWeight: "bold",
    color: "#000",
    textShadowColor: "rgba(255,255,255,0.3)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  possibleMoveDot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
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
    borderTopColor: "rgba(255, 0, 0, 0.3)", // Red tint for captures
  },
  bottomBar: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#333",
    width: "100%",
  },
  bottomBarButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 60,
  },
  bottomBarIcon: {
    fontSize: 24,
    marginBottom: 4,
    color: "#999", // Professional gray color that matches the theme
    fontWeight: "bold",
  },
  bottomBarLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  moveHistoryModal: {
    backgroundColor: "#2c2c2c",
    borderRadius: 12,
    width: "90%",
    maxWidth: 400,
    maxHeight: "70%",
    borderWidth: 1,
    borderColor: "#555",
  },
  moveHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#555",
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
    fontSize: 18,
    fontWeight: "bold",
  },
  moveHistoryScroll: {
    flex: 1,
    padding: 16,
  },
  moveRow: {
    flexDirection: "row",
    marginBottom: 8,
    alignItems: "center",
  },
  moveNumber: {
    color: "#999",
    fontSize: 14,
    width: 30,
    fontWeight: "bold",
  },
  moveText: {
    color: "#fff",
    fontSize: 14,
    width: 60,
    marginHorizontal: 8,
  },
  gameEndModal: {
    backgroundColor: "#2c2c2c",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#555",
    maxWidth: "90%",
  },
  victoryModal: {
    borderColor: "#90EE90", // Green for victory
  },
  defeatModal: {
    borderColor: "#FF6B6B", // Red for defeat
  },
  gameEndTitle: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    color: "#fff",
  },
  victoryTitle: {
    color: "#90EE90",
  },
  defeatTitle: {
    color: "#FF6B6B",
  },
  gameEndMessage: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    color: "#fff",
    lineHeight: 22,
  },
  gameEndDetailsContainer: {
    marginBottom: 16,
  },
  gameEndDetailText: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 4,
  },
  promotionModal: {
    backgroundColor: "#2c2c2c",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#555",
  },
  promotionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  promotionOptions: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 20,
    flexWrap: "wrap",
  },
  promotionOption: {
    margin: 8,
    padding: 12,
    backgroundColor: "#F0D9B5",
    borderRadius: 8,
    minWidth: 50,
    minHeight: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  promotionPiece: {
    fontSize: 28,
    textAlign: "center",
    color: "#000",
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#666",
    borderRadius: 8,
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  capturedPieces: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 4,
    minHeight: 30, // Ensure some height even if no pieces
  },
  capturedPieceGroup: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
    marginBottom: 4,
  },
  capturedPiece: {
    fontSize: 30, // Adjust size as needed
    color: "#fff", // White color for captured pieces
    marginRight: 2,
  },
  capturedCount: {
    fontSize: 12,
    color: "#999", // Lighter color for count
    fontWeight: "bold",
  },
})
