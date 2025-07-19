"use client"
import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { useEffect, useRef, useState } from "react"
import { Alert, Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import type { Socket } from "socket.io-client"
import { getSocketInstance } from "../utils/socketManager"

// Define types for pocket pieces
interface PocketPieceStandard {
  type: string // e.g., "p", "n", "b"
}

interface PocketPieceWithTimer {
  type: string
  id: string
  capturedAt: number
}

type PocketPiece = PocketPieceStandard | PocketPieceWithTimer

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
    moveHistory?: { from: string; to: string; [key: string]: any }[]
    pocketedPieces: {
      white: PocketPiece[]
      black: PocketPiece[]
    }
    dropTimers?: {
      white: { [pieceId: string]: number }
      black: { [pieceId: string]: number }
    }
    frozenPieces?: {
      white: PocketPieceWithTimer[]
      black: PocketPieceWithTimer[]
    }
    gameStarted?: boolean
    firstMoveTimestamp?: number
    gameEnded?: boolean
    endReason?: string | null
    winner?: string | null
    endTimestamp?: number | null
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
  from?: string
  to: string
  piece?: string
  drop?: boolean
  promotion?: string
  drop?: boolean
  promotion?: string
}

interface CrazyHouseChessGameProps {
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

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"]
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"]

const screenWidth = Dimensions.get("window").width
const boardSize = screenWidth
const squareSize = boardSize / 8

export default function CrazyHouseChessGame({ initialGameState, userId, onNavigateToMenu }: CrazyHouseChessGameProps) {
const screenWidth = Dimensions.get("window").width
const boardSize = screenWidth
const squareSize = boardSize / 8

export default function CrazyHouseChessGame({ initialGameState, userId, onNavigateToMenu }: CrazyHouseChessGameProps) {
  const router = useRouter()
  const [gameState, setGameState] = useState<GameState>(initialGameState)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [possibleMoves, setPossibleMoves] = useState<string[]>([])
  const [selectedPocketPiece, setSelectedPocketPiece] = useState<string | PocketPieceWithTimer | null>(null)
  const [selectedPocket, setSelectedPocket] = useState<"white" | "black" | null>(null)
  const [isMyTurn, setIsMyTurn] = useState(false)
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white")
  const [boardFlipped, setBoardFlipped] = useState(false)
  const [moveHistory, setMoveHistory] = useState<any[]>([])
  const [moveHistory, setMoveHistory] = useState<any[]>([])
  const [showMoveHistory, setShowMoveHistory] = useState(false)
  const [promotionModal, setPromotionModal] = useState<{
    visible: boolean
    from?: string
    from?: string
    to: string
    options: string[]
    drop?: boolean
    piece?: string
    drop?: boolean
    piece?: string
  } | null>(null)
  const [showGameEndModal, setShowGameEndModal] = useState(false)
  const [gameEndMessage, setGameEndMessage] = useState("")
  const [isWinner, setIsWinner] = useState<boolean | null>(null)
  const [localTimers, setLocalTimers] = useState<{ white: number; black: number }>({
    white: initialGameState.timeControl.timers.white,
    black: initialGameState.timeControl.timers.black,
  })
  const [localDropTimers, setLocalDropTimers] = useState<{ white: number | null; black: number | null }>({
    white: null,
    black: null,
  })

  const timerRef = useRef<any>(null)
  const navigationTimeoutRef = useRef<any>(null)

  useEffect(() => {
    const gameSocket = getSocketInstance()
    if (gameSocket) {
      setSocket(gameSocket)
    } else {
      Alert.alert("Connection Error", "Failed to connect to game socket. Please try again.")
      return
    }

    const userColor = initialGameState.userColor[userId]
    setPlayerColor(userColor === "white" || userColor === "black" ? userColor : "white")
    setBoardFlipped(userColor === "black")
    setIsMyTurn(initialGameState.board.activeColor === userColor)

    // Initialize local drop timers if it's a withTimer variant
    if (initialGameState.subvariantName === "withTimer") {
      const activeColor = initialGameState.board.activeColor
      const pocket = initialGameState.board.pocketedPieces[activeColor] as PocketPieceWithTimer[]
      const dropTimersMap = new Map(Object.entries(initialGameState.board.dropTimers?.[activeColor] || {}))

      if (pocket.length > 0) {
        const firstPiece = pocket[0]
        const expirationTimestamp = dropTimersMap.get(firstPiece.id)
        if (expirationTimestamp) {
          const remaining = expirationTimestamp - Date.now()
          setLocalDropTimers((prev) => ({
            ...prev,
            [activeColor]: Math.max(0, remaining),
          }))
        }
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current)
    }
  }, [])

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
    if (timerRef.current) clearInterval(timerRef.current)

    if (gameState.status !== "active" || gameState.gameState?.gameEnded) {
      setLocalDropTimers({ white: null, black: null }) // Clear drop timers if game not active/ended
      return
    }

    timerRef.current = setInterval(() => {
      setLocalTimers((prevMainTimers) => {
        const activeColor = gameState.board.activeColor
        const now = Date.now()
        let newWhite = prevMainTimers.white
        let newBlack = prevMainTimers.black

        // Update main game clock
        if (activeColor === "white") {
          newWhite = Math.max(0, newWhite - 100)
        } else {
          newBlack = Math.max(0, newBlack - 100)
        }

        // Update drop timers if it's a "withTimer" variant
        if (gameState.subvariantName === "withTimer") {
          setLocalDropTimers((prevDropTimers) => {
            const newDropTimers = { ...prevDropTimers }
            const currentActivePlayerPocket =
              (gameState.board.pocketedPieces[activeColor] as PocketPieceWithTimer[]) || []
            const currentActivePlayerDropTimersMap = new Map(
              Object.entries(gameState.board.dropTimers?.[activeColor] || {}),
            )

            if (currentActivePlayerPocket.length > 0) {
              const firstPiece = currentActivePlayerPocket[0]
              const expirationTimestamp = currentActivePlayerDropTimersMap.get(firstPiece.id)

              if (expirationTimestamp) {
                const remaining = expirationTimestamp - now
                newDropTimers[activeColor] = Math.max(0, remaining)
              } else {
                newDropTimers[activeColor] = null // No active timer for the first piece
              }
            } else {
              newDropTimers[activeColor] = null // No pieces in pocket
            }

            // Ensure the other player's drop timer is null as only one player has an active drop timer
            const otherColor = activeColor === "white" ? "black" : "white"
            newDropTimers[otherColor] = null

            return newDropTimers
          })
        } else {
          // If not withTimer, ensure drop timers are null
          setLocalDropTimers({ white: null, black: null })
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
    gameState.gameState?.gameEnded,
    gameState.subvariantName,
    gameState.board.pocketedPieces,
    gameState.board.dropTimers,
  ])

  // Socket handlers
  function handleGameMove(data: any) {
    if (data && data.gameState) {
      console.log("Game move received:", data.gameState)
      setGameState((prevState) => {
        const newState = {
          ...prevState,
          ...data.gameState,
          board: { ...prevState.board, ...data.gameState.board },
          timeControl: {
            ...prevState.timeControl,
            ...data.gameState.timeControl,
            timers: {
              white: data.gameState.timeControl?.timers?.white ?? prevState.timeControl.timers.white,
              black: data.gameState.timeControl?.timers?.black ?? prevState.timeControl.timers.black,
            },
          },
          moves: data.gameState.moves || [],
          lastMove: data.gameState.lastMove,
          moveCount: data.gameState.moveCount,
        }

        // Re-hydrate dropTimers Maps if they come as plain objects (only for withTimer)
        if (newState.subvariantName === "withTimer" && newState.board.dropTimers) {
          newState.board.dropTimers.white = new Map(Object.entries(newState.board.dropTimers.white || {}))
          newState.board.dropTimers.black = new Map(Object.entries(newState.board.dropTimers.black || {}))
        }

        // Update local drop timers immediately based on new state
        if (newState.subvariantName === "withTimer") {
          const activeColor = newState.board.activeColor
          const pocket = newState.board.pocketedPieces[activeColor] as PocketPieceWithTimer[]
          const dropTimersMap = new Map(Object.entries(newState.board.dropTimers?.[activeColor] || {}))
          const now = Date.now()

          setLocalDropTimers((prev) => {
            const newDropTimers = { white: null, black: null } // Reset both
            if (pocket.length > 0) {
              const firstPiece = pocket[0]
              const expirationTimestamp = dropTimersMap.get(firstPiece.id)
              if (expirationTimestamp) {
                newDropTimers[activeColor] = Math.max(0, expirationTimestamp - now)
              }
            }
            return newDropTimers
          })
        } else {
          setLocalDropTimers({ white: null, black: null })
        }

        return newState
      })
      setMoveHistory(data.gameState.moves || [])
      setSelectedSquare(null)
      setPossibleMoves([])
      setSelectedPocketPiece(null)
      const userColor = data.gameState.userColor ? data.gameState.userColor[userId] : playerColor
      setIsMyTurn(data.gameState.board.activeColor === userColor)
    }
  }

  function handlePossibleMoves(data: { square: string; moves: any[] }) {
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

  function handleGameStateUpdate(data: any) {
    if (data && data.gameState) {
      setGameState((prevState) => {
        const newState = {
          ...prevState,
          ...data.gameState,
          timeControl: {
            ...prevState.timeControl,
            ...data.gameState.timeControl,
            timers: {
              white: data.gameState.timeControl?.timers?.white ?? prevState.timeControl.timers.white,
              black: data.gameState.timeControl?.timers?.black ?? prevState.timeControl.timers.black,
            },
          },
        }

        // Re-hydrate dropTimers Maps if they come as plain objects (only for withTimer)
        if (newState.subvariantName === "withTimer" && newState.board.dropTimers) {
          newState.board.dropTimers.white = new Map(Object.entries(newState.board.dropTimers.white || {}))
          newState.board.dropTimers.black = new Map(Object.entries(newState.board.dropTimers.black || {}))
        }

        // Update local drop timers immediately based on new state
        if (newState.subvariantName === "withTimer") {
          const activeColor = newState.board.activeColor
          const pocket = newState.board.pocketedPieces[activeColor] as PocketPieceWithTimer[]
          const dropTimersMap = new Map(Object.entries(newState.board.dropTimers?.[activeColor] || {}))
          const now = Date.now()

          setLocalDropTimers((prev) => {
            const newDropTimers = { white: null, black: null } // Reset both
            if (pocket.length > 0) {
              const firstPiece = pocket[0]
              const expirationTimestamp = dropTimersMap.get(firstPiece.id)
              if (expirationTimestamp) {
                newDropTimers[activeColor] = Math.max(0, expirationTimestamp - now)
              }
            }
            return newDropTimers
          })
        } else {
          setLocalDropTimers({ white: null, black: null })
        }

        return newState
      })
      setIsMyTurn(data.gameState.board.activeColor === playerColor)
    }
  }

  function handleTimerUpdate(data: any) {
    const whiteTime = data.timers?.white ?? data.white ?? localTimers.white
    const blackTime = data.timers?.black ?? data.black ?? localTimers.black
    setLocalTimers({ white: whiteTime, black: blackTime })
  }

  function handleGameEndEvent(data: any) {
    const result = data.gameState?.gameState?.result || data.gameState?.result || data.result || "unknown"
    const winner = data.gameState?.gameState?.winner || data.gameState?.winner || data.winner
    setIsWinner(winner === playerColor ? true : winner ? false : null)
    setGameEndMessage(result)
    setShowGameEndModal(true)
    setTimeout(() => {
      if (socket) socket.disconnect()
      setSocket(null)
    }, 1000)
    navigationTimeoutRef.current = setTimeout(() => {
      setShowGameEndModal(false)
      if (onNavigateToMenu) onNavigateToMenu()
      router.replace("/choose")
    }, 5000)
  }

  function handleGameError(data: any) {
    Alert.alert("Error", data.message || data.error || "An error occurred")
  }

  function handleGameWarning(data: any) {
    Alert.alert("Warning", data?.message || "Warning: Invalid move or rule violation.")
  }

  // Move logic
  function requestPossibleMoves(square: string) {
    if (!socket) return
    socket.emit("game:getPossibleMoves", { square })
  }

  function makeMove(move: Move) {
    if (!socket || !isMyTurn) return
    setIsMyTurn(false)
    setSelectedSquare(null)
    setPossibleMoves([])
    setSelectedPocketPiece(null)
    socket.emit("game:makeMove", { move, timestamp: Date.now() })
  }

  function handleSquarePress(square: string) {
    if (selectedPocketPiece && isMyTurn && selectedPocket === playerColor) {
      const pieceAtTarget = getPieceAt(square)
      if (!pieceAtTarget) {
        let pieceToDrop: string
        if (gameState.subvariantName === "withTimer") {
          // For withTimer, selectedPocketPiece is PocketPieceWithTimer
          const selectedPieceObj = selectedPocketPiece as PocketPieceWithTimer
          const playerPocket = (gameState.board.pocketedPieces[playerColor] as PocketPieceWithTimer[]) || []
          const playerDropTimers = new Map(Object.entries(gameState.board.dropTimers?.[playerColor] || {}))

          // Check if the selected piece is the *first* in the pocket and has an active timer
          const firstPieceInPocket = playerPocket.length > 0 ? playerPocket[0] : null
          const isSelectedPieceActiveDroppable =
            firstPieceInPocket &&
            firstPieceInPocket.id === selectedPieceObj.id &&
            playerDropTimers.has(selectedPieceObj.id) &&
            playerDropTimers.get(selectedPieceObj.id)! > Date.now()

          if (!isSelectedPieceActiveDroppable) {
            Alert.alert("Invalid Drop", "This piece is not currently available for drop or its timer has expired.")
            setSelectedPocketPiece(null)
            setSelectedPocket(null)
            setSelectedSquare(null)
            setPossibleMoves([])
            return
          }
          pieceToDrop = selectedPieceObj.type
        } else {
          // For standard, selectedPocketPiece is just the piece type string
          pieceToDrop = selectedPocketPiece as string
        }

        makeMove({ to: square, piece: pieceToDrop, drop: true })
      } else {
        Alert.alert("Invalid Drop", "You can only drop a piece on an empty square.")
      }
      setSelectedPocketPiece(null)
      setSelectedPocket(null)
      setSelectedSquare(null)
      setPossibleMoves([])
      return
    }

    if (selectedSquare === square) {
      setSelectedSquare(null)
      setPossibleMoves([])
      return
    }

    if (selectedSquare && possibleMoves.includes(square)) {
      // Promotion check
      const piece = getPieceAt(selectedSquare)
      const isPromotion =
        piece &&
        ((piece.toLowerCase() === "p" && playerColor === "white" && square[1] === "8") ||
          (piece.toLowerCase() === "p" && playerColor === "black" && square[1] === "1"))

      if (isPromotion) {
        setPromotionModal({ visible: true, from: selectedSquare, to: square, options: ["q", "r", "b", "n"] })
        return
      }
      makeMove({ from: selectedSquare, to: square })
      setPromotionModal(null)
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

  function handlePromotionSelect(promotion: string) {
    if (promotionModal) {
      if (promotionModal.drop && promotionModal.piece) {
        makeMove({ to: promotionModal.to, piece: promotionModal.piece, drop: true, promotion })
      } else {
        makeMove({ from: promotionModal.from, to: promotionModal.to, promotion })
      }
      setPromotionModal(null)
      setSelectedSquare(null)
      setPossibleMoves([])
    }
  }

  function getPieceAt(square: string): string | null {
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
        if (col === fileIndex) return c
        col++
      }
    }
    return null
  }

  function isPieceOwnedByPlayer(piece: string, color: "white" | "black"): boolean {
    return color === "white" ? piece === piece.toUpperCase() : piece === piece.toLowerCase()
  }

  function formatTime(milliseconds: number): string {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0:00"
    const totalSeconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  function formatDropTime(milliseconds: number): string {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0.0"
    const seconds = Math.floor(milliseconds / 1000)
    const tenths = Math.floor((milliseconds % 1000) / 100)
    return `${seconds}.${tenths}`
  }

  // Pocket panel
  function renderPocketPanel(color: "white" | "black") {
    const pocket = gameState.board.pocketedPieces[color] || []
    const isMyPocket = playerColor === color
    const isMyTurnForPocket = gameState.board.activeColor === color && isMyTurn

    if (gameState.subvariantName === "withTimer") {
      const frozen = gameState.board.frozenPieces?.[color] || []
      const dropTimersMap = new Map(Object.entries(gameState.board.dropTimers?.[color] || {}))

      let activeDroppablePiece: PocketPieceWithTimer | null = null
      let activeDropTimerRemaining: number | null = null

      if (pocket.length > 0) {
        const firstPiece = pocket[0] as PocketPieceWithTimer
        const expirationTimestamp = dropTimersMap.get(firstPiece.id)
        if (expirationTimestamp) {
          const remaining = expirationTimestamp - Date.now()
          if (remaining > 0) {
            activeDroppablePiece = firstPiece
            activeDropTimerRemaining = remaining
          }
        }
      }

      return (
        <View style={styles.pocketPanel}>
          <Text style={styles.pocketLabel}>{color === "white" ? "White Pocket" : "Black Pocket"}</Text>
          <View style={styles.pocketPieces}>
            {activeDroppablePiece && (
              <TouchableOpacity
                key={activeDroppablePiece.id}
                style={[
                  styles.pocketPiece,
                  (selectedPocketPiece as PocketPieceWithTimer)?.id === activeDroppablePiece.id &&
                  selectedPocket === color
                    ? styles.selectedPocketPiece
                    : null,
                ]}
                onPress={() => {
                  setSelectedPocketPiece(activeDroppablePiece)
                  setSelectedPocket(color)
                }}
                disabled={!isMyTurnForPocket}
              >
                <Text style={styles.pieceText}>{PIECE_SYMBOLS[activeDroppablePiece.type]}</Text>
                {activeDropTimerRemaining !== null && (
                  <Text style={styles.dropTimerText}>{formatDropTime(localDropTimers[color] || 0)}</Text>
                )}
              </TouchableOpacity>
            )}
            {frozen.map((piece) => (
              <View key={piece.id} style={styles.frozenPocketPiece}>
                <Text style={styles.pieceText}>{PIECE_SYMBOLS[piece.type]}</Text>
              </View>
            ))}
          </View>
        </View>
      )
    } else {
      // Standard Crazyhouse variant (pocketedPieces are strings)
      const pieceCounts: { [key: string]: number } = {}
      pocket.forEach((piece) => {
        const pieceType = (piece as PocketPieceStandard).type || (piece as string) // Handle both potential types
        pieceCounts[pieceType] = (pieceCounts[pieceType] || 0) + 1
      })

      return (
        <View style={styles.pocketPanel}>
          <Text style={styles.pocketLabel}>{color === "white" ? "White Pocket" : "Black Pocket"}</Text>
          <View style={styles.pocketPieces}>
            {Object.entries(pieceCounts).map(([pieceType, count]) => (
              <TouchableOpacity
                key={pieceType}
                style={[
                  styles.pocketPiece,
                  selectedPocketPiece === pieceType && selectedPocket === color ? styles.selectedPocketPiece : null,
                ]}
                onPress={() => {
                  setSelectedPocketPiece(pieceType)
                  setSelectedPocket(color)
                }}
                disabled={!isMyTurnForPocket}
              >
                <Text style={styles.pieceText}>{PIECE_SYMBOLS[pieceType]}</Text>
                {count > 1 && <Text style={styles.pocketCount}>x{count}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )
    }
  }

  // Board rendering
  function renderSquare(file: string, rank: string) {
    const square = `${file}${rank}`
    const isLight = (FILES.indexOf(file) + Number.parseInt(rank)) % 2 === 0
    const isSelected = selectedSquare === square
    const isPossibleMove = possibleMoves.includes(square)
    const piece = getPieceAt(square)

    return (
      <TouchableOpacity
        key={square}
        style={[
          styles.square,
          { width: squareSize, height: squareSize, backgroundColor: isLight ? "#F0D9B5" : "#769656" },
          isSelected && styles.selectedSquare,
          isPossibleMove && styles.possibleMoveSquare,
        ]}
        onPress={() => handleSquarePress(square)}
      >
        {piece && <Text style={styles.pieceText}>{PIECE_SYMBOLS[piece]}</Text>}
        {isPossibleMove && !piece && <View style={styles.possibleMoveDot} />}
        {isPossibleMove && piece && <View style={styles.captureIndicator} />}
      </TouchableOpacity>
    )
  }

  function renderBoard() {
  function renderBoard() {
    const files = boardFlipped ? [...FILES].reverse() : FILES
    const ranks = boardFlipped ? [...RANKS].reverse() : RANKS
    return (
      <View style={styles.boardContainer}>
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

  // Player info
  function renderPlayerInfo(color: "white" | "black", isTop: boolean) {
    const player = gameState.players[color]
    if (!player) return null

    const timer = localTimers[color]
    const isActivePlayer = gameState.board.activeColor === color
    const isMe = playerColor === color

    return (
      <View style={[styles.playerInfoBlock, isTop ? styles.topPlayerBlock : styles.bottomPlayerBlock]}>
        <View style={styles.playerDetails}>
          <Text style={styles.playerName}>
            {player.username} {isMe && <Text style={styles.youIndicator}>YOU</Text>}
          </Text>
          <Text style={styles.playerRating}>({player.rating})</Text>
        </View>
        <View style={[styles.timerContainer, isActivePlayer && styles.activeTimer]}>
          <Text style={styles.timer}>{formatTime(timer)}</Text>
        </View>
      </View>
    )
  }

  // Move history modal
  function renderMoveHistory() {
    if (!showMoveHistory) return null
    const moves = moveHistory

    return (
      <Modal visible={showMoveHistory} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.moveHistoryModal}>
            <View style={styles.moveHistoryHeader}>
              <Text style={styles.moveHistoryTitle}>Moves</Text>
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
    )
  }

  // Promotion modal
  function renderPromotionModal() {
    if (!promotionModal || !promotionModal.visible) return null

    return (
      <Modal visible={promotionModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.promotionModal}>
            <Text style={styles.promotionTitle}>Choose Promotion Piece</Text>
            <View style={styles.promotionOptions}>
              {promotionModal.options.map((p) => (
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
    )
  }

  // Game end modal
  function renderGameEndModal() {
    if (!showGameEndModal) return null

    return (
      <Modal visible={showGameEndModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.gameEndModal}>
            <Text style={styles.gameEndTitle}>
              {isWinner === true ? "VICTORY!" : isWinner === false ? "DEFEAT" : "GAME OVER"}
            </Text>
            <Text style={styles.gameEndMessage}>{gameEndMessage}</Text>
            <Text style={styles.gameEndTitle}>
              {isWinner === true ? "VICTORY!" : isWinner === false ? "DEFEAT" : "GAME OVER"}
            </Text>
            <Text style={styles.gameEndMessage}>{gameEndMessage}</Text>
          </View>
        </View>
      </Modal>
    )
  }

  // Flip board
  function handleFlipBoard() {
    setBoardFlipped(!boardFlipped)
  }

  const opponentColor = playerColor === "white" ? "black" : "white"

  return (
    <View style={styles.container}>
      {renderPlayerInfo(opponentColor, true)}
      {renderPocketPanel(opponentColor)}
      {renderBoard()}
      {renderPocketPanel(playerColor)}
      {renderPlayerInfo(playerColor, false)}

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
            if (socket && gameState.status === "active") socket.emit("game:resign")
          }}
        >
          <Text style={styles.bottomBarIcon}>✕</Text>
          <Text style={styles.bottomBarLabel}>Resign</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bottomBarButton}
          onPress={() => {
            if (socket && gameState.status === "active") socket.emit("game:offerDraw")
          }}
        >
          <Text style={styles.bottomBarIcon}>½</Text>
          <Text style={styles.bottomBarLabel}>Draw</Text>
        </TouchableOpacity>
      </View>

      {renderMoveHistory()}
      {renderGameEndModal()}
      {renderPromotionModal()}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#222", alignItems: "center" },
  boardContainer: { alignItems: "center", justifyContent: "center" },
  board: {},
  row: { flexDirection: "row" },
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
    borderWidth: 1,
    borderColor: "#444",
  },
  selectedSquare: { backgroundColor: "#f7ec74" },
  possibleMoveSquare: { backgroundColor: "rgba(255,255,0,0.3)" },
  pieceText: { fontSize: 28, color: "#fff", fontWeight: "bold" },
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
    backgroundColor: "rgba(0,0,0,0.3)",
    opacity: 0.8,
  },
  captureIndicator: {
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
  playerInfoBlock: {
    width: "100%",
    backgroundColor: "#222",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  topPlayerBlock: { paddingTop: 20 },
  bottomPlayerBlock: { borderTopWidth: 1, borderBottomWidth: 0, borderTopColor: "#333", paddingBottom: 20 },
  playerDetails: { flex: 1 },
  playerName: { color: "#fff", fontSize: 18, fontWeight: "500" },
  youIndicator: { color: "#90EE90", fontSize: 14, fontWeight: "bold", marginLeft: 5 },
  playerRating: { color: "#999", fontSize: 14 },
  timerContainer: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 70,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  activeTimer: { borderColor: "#90EE90" },
  timer: { color: "#fff", fontWeight: "bold", fontFamily: "monospace", fontSize: 20 },
  pocketPanel: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  pocketLabel: { color: "#fff", marginRight: 8 },
  pocketPieces: { flexDirection: "row" },
  pocketPiece: { backgroundColor: "#333", borderRadius: 4, padding: 8, marginHorizontal: 2 },
  selectedPocketPiece: { backgroundColor: "#60a5fa" },
  pocketCount: { color: "#a1a1aa", fontSize: 12, marginLeft: 2 },
  dropTimerText: { color: "#fff", fontSize: 12, marginTop: 4, fontFamily: "monospace" },
  frozenPocketPiece: {
    backgroundColor: "#555", // A different background for frozen pieces
    borderRadius: 4,
    padding: 8,
    marginHorizontal: 2,
    opacity: 0.6, // Make them slightly transparent
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
  bottomBarIcon: { fontSize: 24, marginBottom: 4, color: "#999", fontWeight: "bold" },
  bottomBarLabel: { color: "#fff", fontSize: 12, fontWeight: "500" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  moveHistoryModal: {
    backgroundColor: "#222",
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
  moveHistoryTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  closeButton: { padding: 8 },
  closeButtonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  moveHistoryScroll: { flex: 1, padding: 16 },
  moveRow: { flexDirection: "row", marginBottom: 8, alignItems: "center" },
  moveNumber: { color: "#999", fontSize: 14, width: 30, fontWeight: "bold" },
  moveText: { color: "#fff", fontSize: 14, width: 60, marginHorizontal: 8 },
  gameEndModal: {
    backgroundColor: "#222",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#555",
    maxWidth: "90%",
  },
  gameEndTitle: { fontSize: 24, fontWeight: "bold", textAlign: "center", marginBottom: 16, color: "#fff" },
  gameEndMessage: { fontSize: 16, textAlign: "center", marginBottom: 20, color: "#fff", lineHeight: 22 },
  promotionModal: {
    backgroundColor: "#222",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#555",
  },
  promotionTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 20, textAlign: "center" },
  promotionOptions: { flexDirection: "row", justifyContent: "center", marginBottom: 20, flexWrap: "wrap" },
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
  promotionPiece: { fontSize: 28, textAlign: "center", color: "#000" },
  cancelButton: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#666", borderRadius: 8 },
  cancelButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
})
