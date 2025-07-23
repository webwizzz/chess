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
  subvariantName?: string // "withTimer" or undefined/other for standard
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
    moveHistory?: { from: string; to: string; drop?: boolean; piece?: string; [key: string]: any }[]
    repetitionMap?: any
    gameStarted?: boolean
    firstMoveTimestamp?: number
    capturedPieces?: {
      white: string[]
      black: string[]
    }
    pocketPanel?: {
      white: string[]
      black: string[]
    }
    pocketTimers?: {
      white: PocketTimer[]
      black: PocketTimer[]
    }
    pocketTimeLimit?: number
    gameVariant?: string
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
    check?: boolean
    checkmate?: boolean
    stalemate?: boolean
    insufficientMaterial?: boolean
    threefoldRepetition?: boolean
    fiftyMoveRule?: boolean
    gameEnded?: boolean
    result?: string
    winner?: string | null
    endReason?: string | null
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
  from?: string
  to: string
  piece?: string
  drop?: boolean
  promotion?: string
}

interface CrazyHouseChessGameProps {
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
const boardSize = screenWidth
const squareSize = boardSize / 8

export default function CrazyHouseChessGame({ initialGameState, userId, onNavigateToMenu }: CrazyHouseChessGameProps) {
  const router = useRouter()
  const [gameState, setGameState] = useState<GameState>(initialGameState)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [possibleMoves, setPossibleMoves] = useState<string[]>([])
  const [possibleDrops, setPossibleDrops] = useState<string[]>([])
  const [isMyTurn, setIsMyTurn] = useState(false)
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white")
  const [boardFlipped, setBoardFlipped] = useState(false)
  const [moveHistory, setMoveHistory] = useState<any[]>([])
  const [showMoveHistory, setShowMoveHistory] = useState(false)
  const [promotionModal, setPromotionModal] = useState<{
    visible: boolean
    from?: string
    to: string
    options: string[]
    drop?: boolean
    piece?: string
  } | null>(null)
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
  const timerRef = useRef<any>(null)
  const navigationTimeoutRef = useRef<any>(null)

  // Screen dimensions
  const screenWidth = Dimensions.get("window").width
  const screenHeight = Dimensions.get("window").height
  const isTablet = Math.min(screenWidth, screenHeight) > 600
  const isSmallScreen = Math.min(screenWidth, screenHeight) < 400

  // Calculate board size
  const containerPadding = isTablet ? 24 : isSmallScreen ? 12 : 16
  const availableWidth = screenWidth - containerPadding * 2
  const pocketPanelWidth = Math.min(120, availableWidth * 0.25)
  const boardSize = Math.min(availableWidth - pocketPanelWidth - 16, screenHeight * 0.5, isTablet ? 400 : 320)
  const squareSize = boardSize / 8

  // Timer sync state
  function safeTimerValue(val: any): number {
    const n = Number(val)
    return isNaN(n) || n === undefined || n === null ? 0 : Math.max(0, n)
  }

  const [localTimers, setLocalTimers] = useState<{ white: number; black: number }>({
    white: safeTimerValue(initialGameState.timeControl.timers.white),
    black: safeTimerValue(initialGameState.timeControl.timers.black),
  })

  const [localPocketTimers, setLocalPocketTimers] = useState<{
    white: PocketTimer[]
    black: PocketTimer[]
  }>({
    white: initialGameState.board.pocketTimers?.white || [],
    black: initialGameState.board.pocketTimers?.black || [],
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
  const isWithTimerVariant = useCallback(() => {
    return (
      gameState.board.gameVariant === "crazyhouse" ||
      gameState.subvariantName?.includes("withTimer") ||
      gameState.board.pocketTimeLimit !== undefined
    )
  }, [gameState.board.gameVariant, gameState.subvariantName, gameState.board.pocketTimeLimit])

  const getPieceAt = useCallback(
    (square: string): string | null => {
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

  // Format time display
  const formatTime = useCallback((milliseconds: number): string => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0:00"
    const totalSeconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }, [])

  // Format pocket timer display
  const formatPocketTime = useCallback((milliseconds: number): string => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0"
    return Math.ceil(milliseconds / 1000).toString()
  }, [])

  // Update pocket timers for withTimer variant
  const updatePocketTimers = useCallback(() => {
    if (!isWithTimerVariant()) return

    const currentTime = Date.now()
    setLocalPocketTimers((prev) => {
      const newTimers = { white: [...prev.white], black: [...prev.black] }
      let hasChanges = false
      ;(["white", "black"] as const).forEach((color) => {
        newTimers[color] = newTimers[color].filter((timer) => {
          const remaining = timer.expiresAt - currentTime
          if (remaining <= 0) {
            console.log(`[POCKET] ${color} ${timer.piece} expired`)
            hasChanges = true
            return false
          }
          timer.remainingTime = remaining
          return true
        })
      })

      return hasChanges ? newTimers : prev
    })
  }, [isWithTimerVariant])

  // Handle game ending
  const handleGameEnd = useCallback(
    (
      result: string,
      winner: string | null,
      endReason: string,
      details?: { moveSan?: string; moveMaker?: string; winnerName?: string | null },
    ) => {
      console.log("[GAME END] Result:", result, "Winner:", winner, "Reason:", endReason)

      // Stop all timers
      if (timerRef.current) clearInterval(timerRef.current)
      if (pocketTimerRef.current) clearInterval(pocketTimerRef.current)

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

      // Disconnect socket after delay
      setTimeout(() => {
        if (socket) {
          console.log("[SOCKET] Disconnecting from game")
          socket.disconnect()
          setSocket(null)
        }
      }, 1000)

      // Auto-navigate to menu
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

  // Navigate to menu manually
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
      console.log("Connected to Crazyhouse game socket")
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
      if (timerRef.current) clearInterval(timerRef.current)
      if (pocketTimerRef.current) clearInterval(pocketTimerRef.current)
      if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current)
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

  // Timer management effect
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (gameState.status !== "active" || gameState.gameState?.gameEnded) return

    // Update server sync reference
    const now = Date.now()
    const currentWhiteTime = safeTimerValue(gameState.timeControl.timers.white)
    const currentBlackTime = safeTimerValue(gameState.timeControl.timers.black)
    const moveCount = gameState.moves?.length || gameState.board?.moveHistory?.length || 0
    const isFirstMove = moveCount === 0

    // Initialize local timers immediately
    setLocalTimers({
      white: currentWhiteTime,
      black: currentBlackTime,
    })

    lastServerSync.current = {
      white: currentWhiteTime,
      black: currentBlackTime,
      activeColor: gameState.board.activeColor,
      timestamp: now,
      turnStartTime: gameState.board.turnStartTimestamp || now,
      isFirstMove: isFirstMove,
    }

    console.log("[TIMER] Setting up timer for active color:", gameState.board.activeColor)
    console.log("[TIMER] Initial times - White:", currentWhiteTime, "Black:", currentBlackTime)

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
        }

        // Check for timeout
        if (newWhite <= 0 && !gameState.gameState?.gameEnded) {
          console.log("WHITE TIMEOUT DETECTED")
          handleGameEnd("timeout", "black", "White ran out of time")
          return { white: 0, black: newBlack }
        }
        if (newBlack <= 0 && !gameState.gameState?.gameEnded) {
          console.log("BLACK TIMEOUT DETECTED")
          handleGameEnd("timeout", "white", "Black ran out of time")
          return { white: newWhite, black: 0 }
        }

        return { white: newWhite, black: newBlack }
      })
    }, 100)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
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

  // Pocket timer management effect (for withTimer variant)
  useEffect(() => {
    if (!isWithTimerVariant()) return

    if (pocketTimerRef.current) clearInterval(pocketTimerRef.current)

    pocketTimerRef.current = setInterval(() => {
      updatePocketTimers()
    }, 100)

    return () => {
      if (pocketTimerRef.current) clearInterval(pocketTimerRef.current)
    }
  }, [isWithTimerVariant, updatePocketTimers])

  // Socket event handlers (same as before but with Alert instead of alert)
  const handleGameMove = useCallback(
    (data: any) => {
      console.log("[MOVE] Move received:", data)
      if (data && data.gameState) {
        // Extract timer values
        const newWhiteTime = safeTimerValue(
          data.gameState.timeControl?.timers?.white || data.gameState.board?.whiteTime,
        )
        const newBlackTime = safeTimerValue(
          data.gameState.timeControl?.timers?.black || data.gameState.board?.blackTime,
        )

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

        // Check if game ended
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

        // Update game state
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

        // Update pocket timers if withTimer variant
        if (isWithTimerVariant() && data.gameState.board.pocketTimers) {
          setLocalPocketTimers({
            white: data.gameState.board.pocketTimers.white || [],
            black: data.gameState.board.pocketTimers.black || [],
          })
        }

        // Update local timers
        setLocalTimers({ white: newWhiteTime, black: newBlackTime })
        setMoveHistory(data.gameState.moves || [])
        setSelectedSquare(null)
        setSelectedPocketPiece(null)
        setPossibleMoves([])
        setPossibleDrops([])

        // Update turn state
        const userColor = data.gameState.userColor ? data.gameState.userColor[userId] : playerColor
        const activeColor = data.gameState.board.activeColor
        const newIsMyTurn = activeColor === userColor
        setIsMyTurn(newIsMyTurn)
      }
    },
    [gameState.timeControl.timers, handleGameEnd, userId, playerColor, isWithTimerVariant],
  )

  function handlePossibleMoves(data: { square: string; moves: any[] }) {
    let moves: string[] = []
    if (Array.isArray(data.moves) && data.moves.length > 0) {
      if (typeof data.moves[0] === "object" && data.moves[0].to) {
        moves = data.moves.map((m: any) => m.to)
      } else if (typeof data.moves[0] === "string") {
        moves = data.moves
      }
    }
    setPossibleMoves(moves)
  }

  // Other socket handlers (simplified for brevity - same logic as web version)
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

        // Extract timer values
        const newWhiteTime = safeTimerValue(
          data.gameState.timeControl?.timers?.white || data.gameState.board?.whiteTime,
        )
        const newBlackTime = safeTimerValue(
          data.gameState.timeControl?.timers?.black || data.gameState.board?.blackTime,
        )

        // Update server sync reference
        const now = Date.now()
        lastServerSync.current = {
          white: newWhiteTime,
          black: newBlackTime,
          activeColor: data.gameState.board.activeColor,
          timestamp: now,
          turnStartTime: data.gameState.board.turnStartTimestamp || now,
          isFirstMove: (data.gameState.moves?.length || data.gameState.board?.moveHistory?.length || 0) === 0,
        }

        setGameState((prevState) => ({
          ...prevState,
          ...data.gameState,
          timeControl: {
            ...prevState.timeControl,
            ...data.gameState.timeControl,
            timers: {
              white: newWhiteTime,
              black: newBlackTime,
            },
          },
        }))

        setLocalTimers({ white: newWhiteTime, black: newBlackTime })
        setIsMyTurn(data.gameState.board.activeColor === playerColor)
      }
    },
    [handleGameEnd, playerColor, gameState.timeControl.timers],
  )

  const handleTimerUpdate = useCallback(
    (data: any) => {
      console.log("Timer update:", data)

      // Check for game ending
      if (data.gameEnded || data.shouldNavigateToMenu) {
        const result = data.endReason || "timeout"
        const winner = data.winner || data.winnerColor
        handleGameEnd(result, winner, result)
        return
      }

      // Handle timer update formats
      let whiteTime: number
      let blackTime: number

      if (data.timers && typeof data.timers === "object") {
        whiteTime = safeTimerValue(data.timers.white)
        blackTime = safeTimerValue(data.timers.black)
      } else if (typeof data.white === "number" && typeof data.black === "number") {
        whiteTime = safeTimerValue(data.white)
        blackTime = safeTimerValue(data.black)
      } else {
        whiteTime = safeTimerValue(data.white ?? data.timers?.white ?? gameState.timeControl.timers.white)
        blackTime = safeTimerValue(data.black ?? data.timers?.black ?? gameState.timeControl.timers.black)
      }

      console.log("[TIMER UPDATE] White:", whiteTime, "Black:", blackTime)

      // Update server sync reference
      lastServerSync.current = {
        white: whiteTime,
        black: blackTime,
        activeColor: data.activeColor || gameState.board.activeColor,
        timestamp: Date.now(),
        turnStartTime: data.turnStartTimestamp || Date.now(),
        isFirstMove: (gameState.moves?.length || gameState.board?.moveHistory?.length || 0) === 0,
      }

      // Update local timers
      setLocalTimers({ white: whiteTime, black: blackTime })

      setGameState((prevState) => ({
        ...prevState,
        timeControl: {
          ...prevState.timeControl,
          timers: { white: whiteTime, black: blackTime },
        },
        board: {
          ...prevState.board,
          activeColor: data.activeColor || prevState.board.activeColor,
        },
      }))
    },
    [
      handleGameEnd,
      gameState.board.activeColor,
      gameState.moves?.length,
      gameState.board?.moveHistory?.length,
      gameState.timeControl.timers,
    ],
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

  // Add this new state and effect after the existing useState declarations:
  const [socketConnected, setSocketConnected] = useState(false)

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

  // Add this effect after the existing useEffects:
  useEffect(() => {
    if (!socket) return

    const handleConnect = () => {
      console.log("[SOCKET] Connected")
      setSocketConnected(true)
    }

    const handleDisconnect = () => {
      console.log("[SOCKET] Disconnected")
      setSocketConnected(false)
    }

    const handleConnectError = (error: any) => {
      console.error("[SOCKET] Connection error:", error)
      setSocketConnected(false)
      Alert.alert("Connection Error", "Failed to connect to game server. Please check your internet connection.")
    }

    socket.on("connect", handleConnect)
    socket.on("disconnect", handleDisconnect)
    socket.on("connect_error", handleConnectError)

    // Check initial connection state
    setSocketConnected(socket.connected)

    return () => {
      socket.off("connect", handleConnect)
      socket.off("disconnect", handleDisconnect)
      socket.off("connect_error", handleConnectError)
    }
  }, [socket])

  // Game interaction functions
  const requestPossibleMoves = useCallback(
    (square: string) => {
      if (!socket) {
        console.log("[DEBUG] requestPossibleMoves: No socket connection.")
        Alert.alert("Connection Error", "No socket connection. Cannot request moves.")
        return
      }
      if (!socket.connected) {
        console.log("[DEBUG] requestPossibleMoves: Socket not connected.")
        Alert.alert("Connection Error", "Socket not connected. Cannot request moves.")
        return
      }
      console.log("[DEBUG] Emitting game:getPossibleMoves for square:", square)
      socket.emit("game:getPossibleMoves", { square })
    },
    [socket],
  )

  const makeMove = useCallback(
    (move: Move) => {
      console.log(
        "[DEBUG] Attempting to make move",
        move,
        "isMyTurn:",
        isMyTurn,
        "socket connected:",
        !!socket?.connected,
      )

      if (!socket) {
        console.log("[DEBUG] No socket connection")
        Alert.alert("Connection Error", "No socket connection. Please check your internet connection.")
        return
      }

      if (!socket.connected) {
        console.log("[DEBUG] Socket not connected")
        Alert.alert("Connection Error", "Socket not connected. Please try again.")
        return
      }

      if (!isMyTurn) {
        console.log("[DEBUG] Not your turn")
        Alert.alert("Invalid Move", "It's not your turn.")
        return
      }

      // Immediately update local state (optimistic update)
      setIsMyTurn(false)
      setSelectedSquare(null)
      setSelectedPocketPiece(null)
      setPossibleMoves([])
      setPossibleDrops([])

      const moveData = {
        move: {
          from: move.from,
          to: move.to,
          promotion: move.promotion,
          drop: move.drop,
          piece: move.piece,
        },
        timestamp: Date.now(),
      }

      console.log("[DEBUG] Emitting move:", moveData)
      socket.emit("game:makeMove", moveData)

      // Add timeout to reset state if no response
      setTimeout(() => {
        if (!socket?.connected) {
          console.log("[DEBUG] Move timeout - resetting state")
          setIsMyTurn(gameState.board.activeColor === playerColor)
        }
      }, 5000)
    },
    [socket, isMyTurn, gameState.board.activeColor, playerColor],
  )

  const handleSquarePress = useCallback(
    (square: string) => {
      // If we have a selected pocket piece, try to drop it
      if (selectedPocketPiece && possibleDrops.includes(square)) {
        makeMove({
          from: "@",
          to: square,
          drop: true,
          piece: selectedPocketPiece,
        })
        setSelectedPocketPiece(null)
        setPossibleDrops([])
        return
      }

      // Regular square selection logic
      if (selectedSquare === square) {
        setSelectedSquare(null)
        setPossibleMoves([])
        return
      }

      if (selectedSquare && possibleMoves.includes(square)) {
        // Check for promotion
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

      // Select piece if it's player's turn and piece belongs to them
      const piece = getPieceAt(square)
      if (isMyTurn && piece && isPieceOwnedByPlayer(piece, playerColor)) {
        setSelectedSquare(square)
        setSelectedPocketPiece(null) // Clear pocket selection
        setPossibleDrops([])
        requestPossibleMoves(square)
      } else {
        setSelectedSquare(null)
        setPossibleMoves([])
      }
    },
    [
      selectedPocketPiece,
      possibleDrops,
      selectedSquare,
      possibleMoves,
      isMyTurn,
      playerColor,
      makeMove,
      getPieceAt,
      isPieceOwnedByPlayer,
      requestPossibleMoves,
    ],
  )

  const handlePocketPiecePress = useCallback(
    (piece: string) => {
      if (!isMyTurn) {
        Alert.alert("Invalid Action", "It's not your turn to drop pieces.")
        return
      }
      if (!socket?.connected) {
        Alert.alert("Connection Error", "Not connected to server. Cannot drop piece.")
        return
      }

      if (selectedPocketPiece === piece) {
        // Deselect
        setSelectedPocketPiece(null)
        setPossibleDrops([])
      } else {
        // Select pocket piece and get possible drops
        setSelectedPocketPiece(piece)
        setSelectedSquare(null) // Clear board selection
        setPossibleMoves([])

        // Request possible drop squares
        console.log("[DEBUG] Emitting game:getPossibleDrops for piece:", piece)
        console.log("[DEBUG] Emitting game:getPossibleDrops for piece:", piece)
        socket.emit("game:getPossibleDrops", { piece })
      }
    },
    [isMyTurn, selectedPocketPiece, socket],
  )

  // Handle promotion selection
  const handlePromotionSelect = useCallback(
    (promotion: string) => {
      if (promotionModal) {
        makeMove({
          from: promotionModal.from,
          to: promotionModal.to,
          promotion,
        })
        setPromotionModal(null)
        setSelectedSquare(null)
        setPossibleMoves([])
      }
    },
    [promotionModal, makeMove],
  )

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

  // Render captured pieces
  const renderCapturedPieces = useCallback(
    (color: "white" | "black") => {
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
    },
    [gameState.board.capturedPieces],
  )

  // Render pocket panel
  const renderPocketPanel = useCallback(
    (color: "white" | "black") => {
      const pocketPieces = gameState.board.pocketPanel?.[color] || gameState.gameState?.pocketPanel?.[color] || []
      const pocketTimers = isWithTimerVariant() ? localPocketTimers[color] || [] : []

      if (pocketPieces.length === 0) {
        return (
          <View style={[styles.pocketPanel, { width: pocketPanelWidth }]}>
            <Text style={styles.pocketTitle}>
              {color === "white" ? "♔" : "♚"} {color.toUpperCase()}
            </Text>
            <Text style={styles.emptyPocketText}>No pieces</Text>
          </View>
        )
      }

      // Group pieces by type
      const pieceCounts: { [key: string]: number } = {}
      pocketPieces.forEach((piece) => {
        pieceCounts[piece] = (pieceCounts[piece] || 0) + 1
      })

      return (
        <View style={[styles.pocketPanel, { width: pocketPanelWidth }]}>
          <Text style={styles.pocketTitle}>
            {color === "white" ? "♔" : "♚"} {color.toUpperCase()}
          </Text>
          <ScrollView style={styles.pocketScroll} showsVerticalScrollIndicator={false}>
            {Object.entries(pieceCounts).map(([piece, count]) => {
              const pieceSymbol =
                color === "white"
                  ? PIECE_SYMBOLS[piece.toUpperCase() as keyof typeof PIECE_SYMBOLS]
                  : PIECE_SYMBOLS[piece.toLowerCase() as keyof typeof PIECE_SYMBOLS]

              // Find timer for this piece (if withTimer variant)
              const timer = pocketTimers.find((t) => t.piece === piece)
              const isSelected = selectedPocketPiece === piece
              const canSelect = isMyTurn && playerColor === color

              return (
                <TouchableOpacity
                  key={piece}
                  onPress={() => canSelect && handlePocketPiecePress(piece)}
                  disabled={!canSelect}
                  style={[
                    styles.pocketPiece,
                    isSelected && styles.selectedPocketPiece,
                    !canSelect && styles.disabledPocketPiece,
                  ]}
                >
                  <Text style={styles.pocketPieceSymbol}>{pieceSymbol}</Text>
                  {count > 1 && (
                    <View style={styles.pocketPieceCount}>
                      <Text style={styles.pocketPieceCountText}>{count}</Text>
                    </View>
                  )}
                  {timer && isWithTimerVariant() && (
                    <View style={styles.pocketTimer}>
                      <Text style={styles.pocketTimerText}>{formatPocketTime(timer.remainingTime)}s</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
          {isWithTimerVariant() && <Text style={styles.timerWarning}>⏱️ 10s limit</Text>}
        </View>
      )
    },
    [
      gameState.board.pocketPanel,
      gameState.gameState?.pocketPanel,
      localPocketTimers,
      isWithTimerVariant,
      selectedPocketPiece,
      isMyTurn,
      playerColor,
      handlePocketPiecePress,
      formatPocketTime,
      pocketPanelWidth,
    ],
  )

  // Render square
  const renderSquare = useCallback(
    (file: string, rank: string) => {
      const square = `${file}${rank}`
      const isLight = (FILES.indexOf(file) + Number.parseInt(rank)) % 2 === 0
      const isSelected = selectedSquare === square
      const isPossibleMove = possibleMoves.includes(square)
      const isPossibleDrop = possibleDrops.includes(square)

      console.log(
        `Square ${square}: isSelected=${isSelected}, isPossibleMove=${isPossibleMove}, isPossibleDrop=${isPossibleDrop}, possibleMoves=${JSON.stringify(possibleMoves)}`,
      )

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

      // Determine border styling
      let borderColor = "transparent"
      let borderWidth = 0

      if (isPossibleDrop) {
        borderColor = "#a855f7" // Purple for drops
        borderWidth = 3
      } else if (isPossibleMove) {
        borderColor = "#4ade80" // Green for moves
        borderWidth = 3
      } else if (isSelected) {
        borderColor = "#60a5fa" // Blue for selected
        borderWidth = 3
      } else if (isLastMove) {
        borderColor = "rgba(251, 191, 36, 0.7)" // Yellow for last move, slightly transparent
        borderWidth = 2
      }

      return (
        <TouchableOpacity
          key={square}
          onPress={() => handleSquarePress(square)}
          style={[
            styles.square,
            {
              width: squareSize,
              height: squareSize,
              backgroundColor: isLight ? "#F0D9B5" : "#B58863",
              borderColor,
              borderWidth,
            },
          ]}
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
                  fontSize: Math.min(squareSize * 0.7, isTablet ? 32 : isSmallScreen ? 20 : 24),
                },
              ]}
            >
              {PIECE_SYMBOLS[piece as keyof typeof PIECE_SYMBOLS]}
            </Text>
          )}

          {/* Move indicators */}
          {isPossibleMove && !piece && <View style={styles.possibleMoveDot} />}
          {isPossibleMove && piece && <View style={styles.captureIndicator} />}
          {isPossibleDrop && <View style={styles.dropIndicator} />}
        </TouchableOpacity>
      )
    },
    [
      selectedSquare,
      possibleMoves,
      possibleDrops,
      gameState.board,
      gameState.lastMove,
      getPieceAt,
      handleSquarePress,
      squareSize,
      isTablet,
      isSmallScreen,
    ],
  )

  function renderBoard() {
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
  }, [boardFlipped, renderSquare, boardSize])

  // Render player info
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

      const timer = safeTimerValue(localTimers[color])
      const isActive = gameState.board.activeColor === color && gameState.status === "active"
      const isMe = playerColor === color
      const materialAdvantage = calculateMaterialAdvantage()
      const advantage = materialAdvantage[color] - materialAdvantage[color === "white" ? "black" : "white"]

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
            </View>
            <View style={[styles.timerContainer, isActive && styles.activeTimerContainer]}>
              <Text style={[styles.timerText, isActive && styles.activeTimerText]}>⏱️ {formatTime(timer)}</Text>
            </View>
          </View>
          {renderCapturedPieces(color)}
          {isMe && isActive && <Text style={styles.yourTurnIndicator}>🎯 Your move!</Text>}
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
      formatTime,
      renderCapturedPieces,
    ],
  )

  // Update the renderGameInfo function to show connection status:
  const renderGameInfo = useCallback(() => {
    const gs = gameState.gameState || {}

    if (gameState.status === "ended" || gs.gameEnded) {
      return (
        <View style={styles.gameStatusContainer}>
          <Text style={styles.gameOverText}>🏁 Game Ended 🏁</Text>
        </View>
      )
    }

    const activePlayerName = gameState.players[gameState.board.activeColor]?.username || gameState.board.activeColor
    const isMyTurnActive = gameState.board.activeColor === playerColor
    const variantDisplay = isWithTimerVariant() ? "Crazyhouse (Timer)" : "Crazyhouse"

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
              {moves.map((move, idx) => (
                <View key={idx} style={styles.moveRow}>
                  <Text style={styles.moveNumber}>{idx + 1}.</Text>
                  <Text style={styles.moveText}>{move.san || `${move.from || ""}-${move.to || ""}`}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
                    <Text style={styles.promotionPiece}>
                      {
                        PIECE_SYMBOLS[
                          (playerColor === "white" ? option.toUpperCase() : option) as keyof typeof PIECE_SYMBOLS
                        ]
                      }
                    </Text>
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
          <View style={styles.gameEndModal}>
            <Text style={styles.gameEndTitle}>
              {isWinner === true ? "VICTORY!" : isWinner === false ? "DEFEAT" : "GAME OVER"}
            </Text>
            <Text style={styles.gameEndMessage}>{gameEndMessage}</Text>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#222", alignItems: "center" },
  boardContainer: { alignItems: "center", justifyContent: "center" },
  board: {},
  row: { flexDirection: "row" },
  square: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: "#444",
  },
  selectedSquare: { backgroundColor: "#f7ec74" },
  possibleMoveSquare: { backgroundColor: "rgba(255,255,0,0.3)" },
  pieceText: { fontSize: 28, color: "#fff", fontWeight: "bold" },
  possibleMoveDot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.3)",
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
    borderTopColor: "rgba(255,0,0,0.3)",
  },
  playerInfoBlock: {
    width: "100%",
    backgroundColor: "#222",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
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
    marginRight: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: "center",
    lineHeight: 24,
  },
  playerName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  activePlayerName: {
    color: "#4ade80",
  },
  youIndicator: {
    color: "#a1a1aa",
    fontSize: 12,
    marginLeft: 8,
  },
  playerRating: {
    color: "#a1a1aa",
    fontSize: 12,
    marginTop: 2,
  },
  materialAdvantage: {
    color: "#4ade80",
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 2,
  },
  timerContainer: {
    backgroundColor: "#555",
    padding: 8,
    borderRadius: 6,
  },
  activeTimerContainer: {
    backgroundColor: "#4ade80",
  },
  timerText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  activeTimerText: {
    color: "#000",
  },
  capturedPieces: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  capturedPieceGroup: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  capturedPiece: {
    fontSize: 14,
    color: "#a1a1aa",
  },
  capturedCount: {
    color: "#a1a1aa",
    fontSize: 10,
    marginLeft: 2,
  },
  yourTurnIndicator: {
    color: "#4ade80",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 8,
  },
  gameStatusContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  gameOverText: {
    color: "#ef4444",
    fontSize: 18,
    fontWeight: "bold",
  },
  turnIndicator: {
    color: "#a1a1aa",
    fontSize: 16,
    marginBottom: 4,
  },
  myTurnIndicator: {
    color: "#4ade80",
  },
  variantName: {
    color: "#60a5fa",
    fontSize: 12,
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    gap: 8,
  },
  historyButton: {
    backgroundColor: "#60a5fa",
    padding: 8,
    borderRadius: 6,
  },
  historyButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  moveHistoryModal: {
    backgroundColor: "#333",
    borderRadius: 8,
    padding: 16,
    width: "80%",
    maxHeight: "60%",
  },
  moveHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  moveHistoryTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  closeButton: {
    backgroundColor: "#ef4444",
    padding: 8,
    borderRadius: 4,
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 12,
  },
  moveHistoryScroll: {
    maxHeight: 200,
  },
  emptyHistoryText: {
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
  moveRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  moveNumber: {
    color: "#a1a1aa",
    fontSize: 12,
    width: 30,
  },
  moveText: {
    color: "#fff",
    fontSize: 12,
  },
  promotionModal: {
    backgroundColor: "#333",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  promotionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 16,
  },
  promotionOptions: {
    flexDirection: "row",
    gap: 16,
  },
  promotionOption: {
    backgroundColor: "#60a5fa",
    padding: 12,
    borderRadius: 8,
  },
  promotionPiece: {
    fontSize: 24,
    color: "#fff",
  },
  gameEndModal: {
    backgroundColor: "#333",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    width: "80%",
  },
  gameEndMessage: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  gameEndReason: {
    color: "#a1a1aa",
    fontSize: 12,
    marginBottom: 8,
  },
  gameEndMove: {
    color: "#a1a1aa",
    fontSize: 12,
    marginBottom: 8,
  },
  gameEndWinner: {
    color: "#4ade80",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 16,
  },
  menuButton: {
    backgroundColor: "#60a5fa",
    padding: 12,
    borderRadius: 8,
  },
  menuButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  connectionStatus: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#fff", // Default color, will be overridden by red/green
  },
})
