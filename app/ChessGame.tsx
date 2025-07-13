"use client"

import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Alert, Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import type { Socket } from "socket.io-client"
import { getSocketInstance } from "../utils/socketManager"

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

interface ChessGameProps {
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

export default function ChessGame({ initialGameState, userId, onNavigateToMenu }: ChessGameProps) {
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

  // Details for UI: reason, move, winner, winnerName
  const [gameEndDetails, setGameEndDetails] = useState<{
    reason?: string
    moveSan?: string
    moveMaker?: string
    winner?: string | null
    winnerName?: string | null
  }>({})

  // Timer management
  const lastUpdateRef = useRef<number>(Date.now())
  const gameStartTimeRef = useRef<number | null>(null)
  const isFirstMoveRef = useRef<boolean>(true)
  const timerRef = useRef<any>(null)
  const navigationTimeoutRef = useRef<any>(null)

  // Timer sync state - improved timer management
  function safeTimerValue(val: any): number {
    const n = Number(val)
    return isNaN(n) || n === undefined || n === null ? 0 : Math.max(0, n)
  }

  const [localTimers, setLocalTimers] = useState<{ white: number; black: number }>({
    white: safeTimerValue(initialGameState.timeControl.timers.white),
    black: safeTimerValue(initialGameState.timeControl.timers.black),
  })

  // Track the last known server state for accurate local countdown
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

  // Get screen dimensions and calculate responsive values
  const screenWidth = Dimensions.get("window").width
  const screenHeight = Dimensions.get("window").height

  // Chess.com style board sizing - full width
  const boardSize = screenWidth
  const squareSize = boardSize / 8

  // Chess.com style responsive values
  const avatarSize = 50
  const fontSizes = {
    timer: 20,
    piece: Math.min(squareSize * 0.7, 32),
    username: 16,
    rating: 14,
    coordinates: 12,
  }

  // Function to handle game ending
  const handleGameEnd = (
    result: string,
    winner: string | null,
    endReason: string,
    details?: { moveSan?: string; moveMaker?: string; winnerName?: string | null },
  ) => {
    console.log("[GAME END] Result:", result, "Winner:", winner, "Reason:", endReason)
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }

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

    setTimeout(() => {
      if (socket) {
        console.log("[SOCKET] Disconnecting from game")
        socket.disconnect()
        setSocket(null)
      }
    }, 1000)

    navigationTimeoutRef.current = setTimeout(() => {
      setShowGameEndModal(false)
      if (onNavigateToMenu) {
        onNavigateToMenu()
      }
      router.replace("/choose")
    }, 5000)
  }

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

    const userColor = gameState.userColor[userId]
    const safePlayerColor = userColor === "white" || userColor === "black" ? userColor : "white"
    setPlayerColor(safePlayerColor)
    setBoardFlipped(safePlayerColor === "black")
    setIsMyTurn(gameState.board.activeColor === safePlayerColor)

    const moveCount = gameState.moves?.length || gameState.board?.moveHistory?.length || 0
    isFirstMoveRef.current = moveCount === 0
    console.log("[INIT] Move count:", moveCount, "Is first move:", isFirstMoveRef.current)

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
  }, [socket, playerColor])

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }

    if (gameState.status !== "active" || gameState.gameState?.gameEnded) {
      return
    }

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

      if (wasFirstMove) {
        console.log("[MOVE] First move detected - preserving initial timer values")
        newWhiteTime = localTimers.white
        newBlackTime = localTimers.black
      }

      lastServerSync.current = {
        white: newWhiteTime,
        black: newBlackTime,
        activeColor: data.gameState.board.activeColor,
        timestamp: now,
        turnStartTime: data.gameState.board.turnStartTimestamp || now,
        isFirstMove: newMoveCount === 0,
      }

      console.log("[MOVE] Updated server sync - Active color:", data.gameState.board.activeColor)

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

      setLocalTimers({
        white: newWhiteTime,
        black: newBlackTime,
      })

      console.log("[MOVE] Updated local timers to - White:", newWhiteTime, "Black:", newBlackTime)

      setMoveHistory(data.gameState.moves || [])
      setSelectedSquare(null)
      setPossibleMoves([])

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
    console.log("Game state update:", data)
    if (data && data.gameState) {
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
    if (data.gameEnded || data.shouldNavigateToMenu) {
      const result = data.endReason || "timeout"
      const winner = data.winner
      handleGameEnd(result, winner, result)
      return
    }

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

    const moveCount = gameState.moves?.length || gameState.board?.moveHistory?.length || 0
    const isFirstMove = moveCount === 0

    lastServerSync.current = {
      white: whiteTime,
      black: blackTime,
      activeColor: gameState.board.activeColor,
      timestamp: Date.now(),
      turnStartTime: Date.now(),
      isFirstMove: isFirstMove,
    }

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

  const handleTimerUpdate = (data: any) => {
    handleGameTimerUpdate(data)
  }

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

  const handleGameError = (data: any) => {
    console.log("Game error:", data)
    Alert.alert("Error", data.message || data.error || "An error occurred")
  }

  const handleGameWarning = (data: any) => {
    const message = data?.message || "Warning: Invalid move or rule violation."
    Alert.alert("Warning", message)
  }

  const requestPossibleMoves = (square: string) => {
    if (!socket) return
    socket.emit("game:getPossibleMoves", {
      square: square,
    })
  }

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
      setSelectedSquare(null)
      setPossibleMoves([])
      return
    }

    if (selectedSquare && possibleMoves.includes(square)) {
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
            <Text style={[styles.capturedPiece, { fontSize: fontSizes.coordinates }]}>
              {PIECE_SYMBOLS[piece as keyof typeof PIECE_SYMBOLS]}
            </Text>
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

  const renderPlayerInfo = (color: "white" | "black", isTop: boolean) => {
    const player = gameState.players[color]
    if (!player) return null

    const timer = safeTimerValue(localTimers[color])
    const isMe = playerColor === color
    const isActivePlayer = gameState.board.activeColor === color

    return (
      <View style={[styles.playerContainer, isTop ? styles.topPlayer : styles.bottomPlayer]}>
        <View style={styles.playerInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{player.username.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.playerDetails}>
            <View style={styles.playerNameRow}>
              <Text style={styles.playerName}>{player.username}</Text>
              <Text style={styles.playerRating}>({player.rating})</Text>
            </View>
            {renderCapturedPieces(color)}
          </View>
        </View>
        <View style={[styles.timerContainer, isActivePlayer && styles.activeTimer]}>
          <Text style={[styles.timer, { fontSize: fontSizes.timer }]}>{formatTime(timer)}</Text>
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

  const topPlayerColor = boardFlipped ? playerColor : playerColor === "white" ? "black" : "white"
  const bottomPlayerColor = boardFlipped ? (playerColor === "white" ? "black" : "white") : playerColor

  return (
    <View style={styles.container}>
      {/* Top Player */}
      {renderPlayerInfo(topPlayerColor, true)}

      {/* Chess Board */}
      {renderBoard()}

      {/* Bottom Player */}
      {renderPlayerInfo(bottomPlayerColor, false)}

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
          <View style={styles.gameEndModal}>
            <Text style={styles.gameEndTitle}>
              {isWinner === true ? "🎉 VICTORY! 🎉" : isWinner === false ? "😔 DEFEAT 😔" : "🏁 GAME OVER 🏁"}
            </Text>
            <Text style={styles.gameEndMessage}>{gameEndMessage}</Text>
            {(gameEndDetails.reason || gameEndDetails.moveSan || gameEndDetails.winner) && (
              <View style={styles.gameEndDetails}>
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
    justifyContent: "flex-start", // Changed from "space-between"
  },
  playerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#2c2c2c",
  },
  topPlayer: {
    paddingTop: 20, // Extra padding for status bar
  },
  bottomPlayer: {
    paddingBottom: 20,
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    backgroundColor: "#666",
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  playerDetails: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  playerName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    marginRight: 8,
  },
  playerRating: {
    color: "#999",
    fontSize: 14,
  },
  timerContainer: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 70,
    alignItems: "center",
  },
  activeTimer: {
    backgroundColor: "#4a4a4a",
  },
  timer: {
    color: "#fff",
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  capturedPieces: {
    flexDirection: "row",
    alignItems: "center",
  },
  capturedPieceGroup: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 4,
  },
  capturedPiece: {
    color: "#999",
    fontSize: 12,
  },
  capturedCount: {
    color: "#999",
    fontSize: 10,
    marginLeft: 2,
  },
  boardContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    marginVertical: 10, // Add some margin
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
    fontSize: 12,
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
  gameEndTitle: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    color: "#fff",
  },
  gameEndMessage: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    color: "#fff",
    lineHeight: 22,
  },
  gameEndDetails: {
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
  bottomBar: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: "space-around",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#333",
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
})
