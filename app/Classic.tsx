"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, SafeAreaView, StatusBar, Alert } from "react-native"
import { useRouter, useLocalSearchParams } from "expo-router"

// Types
type PieceType = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn"
type PieceColor = "white" | "black"

interface ChessPiece {
  type: PieceType
  color: PieceColor
  hasMoved?: boolean
  id?: string
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
  gameResult: "ongoing" | "white-wins" | "black-wins" | "draw"
  enPassantTarget: Position | null
  whiteCanCastleKingside: boolean
  whiteCanCastleQueenside: boolean
  blackCanCastleKingside: boolean
  blackCanCastleQueenside: boolean
  moveHistory: string[]
  fiftyMoveCounter: number
  positionHistory: string[]
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

// Generate unique ID for pieces
const generatePieceId = () => Math.random().toString(36).substring(7)

// Initial board setup with unique IDs
const createInitialBoard = (): Board => {
  const board: Board = Array(8)
    .fill(null)
    .map(() => Array(8).fill(null))

  // Place pawns
  for (let col = 0; col < 8; col++) {
    board[1][col] = { type: "pawn", color: "black", id: generatePieceId() }
    board[6][col] = { type: "pawn", color: "white", id: generatePieceId() }
  }

  // Place other pieces
  const pieceOrder: PieceType[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"]

  for (let col = 0; col < 8; col++) {
    board[0][col] = { type: pieceOrder[col], color: "black", id: generatePieceId() }
    board[7][col] = { type: pieceOrder[col], color: "white", id: generatePieceId() }
  }

  return board
}

// Convert board to string for position comparison
const boardToString = (
  board: Board,
  currentPlayer: PieceColor,
  castlingRights: any,
  enPassant: Position | null,
): string => {
  let str = ""
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece) {
        str += `${piece.color[0]}${piece.type[0]}${row}${col}`
      } else {
        str += "00"
      }
    }
  }
  str += currentPlayer[0]
  str += castlingRights.whiteKingside ? "K" : ""
  str += castlingRights.whiteQueenside ? "Q" : ""
  str += castlingRights.blackKingside ? "k" : ""
  str += castlingRights.blackQueenside ? "q" : ""
  str += enPassant ? `${enPassant.row}${enPassant.col}` : "00"
  return str
}

const ChessApp: React.FC = () => {
  const router = useRouter()
  const { timeBase, timeIncrement, timeLabel } = useLocalSearchParams()

  // Parse time control or fallback to default
  const base = timeBase ? parseInt(timeBase as string, 10) : 10
  const increment = timeIncrement ? parseInt(timeIncrement as string, 10) : 0

  const [gameState, setGameState] = useState<GameState>({
    board: createInitialBoard(),
    currentPlayer: "white",
    whiteTime: base * 60, // base minutes to seconds
    blackTime: base * 60,
    whiteMoves: 0,
    blackMoves: 0,
    capturedByWhite: [],
    capturedByBlack: [],
    gameStatus: "Game in progress",
    isGameActive: true,
    gameResult: "ongoing",
    enPassantTarget: null,
    whiteCanCastleKingside: true,
    whiteCanCastleQueenside: true,
    blackCanCastleKingside: true,
    blackCanCastleQueenside: true,
    moveHistory: [],
    fiftyMoveCounter: 0,
    positionHistory: [],
  })

  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null)
  const [validMoves, setValidMoves] = useState<Position[]>([])

  // Timer effect
  useEffect(() => {
    if (!gameState.isGameActive || gameState.gameResult !== "ongoing") return

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
            gameResult: prev.currentPlayer === "white" ? "black-wins" : "white-wins",
            gameStatus: `${prev.currentPlayer === "white" ? "Black" : "White"} wins on time!`,
          }
        }
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [gameState.currentPlayer, gameState.isGameActive, gameState.gameResult])

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

  // Get all possible moves for a piece (including special moves)
  const getPossibleMoves = useCallback(
    (piece: ChessPiece, fromRow: number, fromCol: number, board: Board, gameState: GameState): Position[] => {
      const moves: Position[] = []
      const { type, color } = piece

      const addMove = (row: number, col: number, isSpecialMove = false) => {
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

          // En passant
          if (gameState.enPassantTarget) {
            const enPassantRow = gameState.enPassantTarget.row
            const enPassantCol = gameState.enPassantTarget.col
            if (
              fromRow === (color === "white" ? 3 : 4) &&
              Math.abs(fromCol - enPassantCol) === 1 &&
              enPassantRow === fromRow + direction
            ) {
              moves.push({ row: enPassantRow, col: enPassantCol })
            }
          }
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

          // Castling
          if (!piece.hasMoved) {
            const row = color === "white" ? 7 : 0

            // Kingside castling
            if (
              (color === "white" ? gameState.whiteCanCastleKingside : gameState.blackCanCastleKingside) &&
              !board[row][5] &&
              !board[row][6] &&
              board[row][7] &&
              board[row][7].type === "rook" &&
              !board[row][7].hasMoved
            ) {
              moves.push({ row, col: 6 })
            }

            // Queenside castling
            if (
              (color === "white" ? gameState.whiteCanCastleQueenside : gameState.blackCanCastleQueenside) &&
              !board[row][1] &&
              !board[row][2] &&
              !board[row][3] &&
              board[row][0] &&
              board[row][0].type === "rook" &&
              !board[row][0].hasMoved
            ) {
              moves.push({ row, col: 2 })
            }
          }
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
    (board: Board, kingColor: PieceColor, gameState: GameState): boolean => {
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
            const moves = getPossibleMoves(piece, row, col, board, gameState)
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

  // Check if a square is under attack
  const isSquareUnderAttack = useCallback(
    (board: Board, targetRow: number, targetCol: number, attackingColor: PieceColor, gameState: GameState): boolean => {
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const piece = board[row][col]
          if (piece && piece.color === attackingColor) {
            const moves = getPossibleMoves(piece, row, col, board, gameState)
            if (moves.some((move) => move.row === targetRow && move.col === targetCol)) {
              return true
            }
          }
        }
      }
      return false
    },
    [getPossibleMoves],
  )

  // Get all legal moves for current player
  const getAllLegalMoves = useCallback(
    (board: Board, playerColor: PieceColor, gameState: GameState): Position[][] => {
      const allMoves: Position[][] = []

      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const piece = board[row][col]
          if (piece && piece.color === playerColor) {
            const possibleMoves = getPossibleMoves(piece, row, col, board, gameState)
            const legalMoves: Position[] = []

            for (const move of possibleMoves) {
              // Test if move is legal (doesn't put own king in check)
              const testBoard = board.map((r) => [...r])
              const capturedPiece = testBoard[move.row][move.col]

              // Handle en passant capture
              if (
                piece.type === "pawn" &&
                gameState.enPassantTarget &&
                move.row === gameState.enPassantTarget.row &&
                move.col === gameState.enPassantTarget.col
              ) {
                const capturedPawnRow = playerColor === "white" ? move.row + 1 : move.row - 1
                testBoard[capturedPawnRow][move.col] = null
              }

              testBoard[move.row][move.col] = piece
              testBoard[row][col] = null

              // Handle castling
              if (piece.type === "king" && Math.abs(move.col - col) === 2) {
                const rookFromCol = move.col > col ? 7 : 0
                const rookToCol = move.col > col ? 5 : 3
                const rook = testBoard[row][rookFromCol]
                testBoard[row][rookToCol] = rook
                testBoard[row][rookFromCol] = null

                // Check if king passes through check
                const passingCol = move.col > col ? col + 1 : col - 1
                if (
                  isSquareUnderAttack(board, row, passingCol, playerColor === "white" ? "black" : "white", gameState)
                ) {
                  return false
                }
              }

              if (!isKingInCheck(testBoard, playerColor, gameState)) {
                // Additional check for castling - king cannot pass through check
                if (piece.type === "king" && Math.abs(move.col - col) === 2) {
                  const passingCol = move.col > col ? col + 1 : col - 1
                  if (
                    !isSquareUnderAttack(board, row, passingCol, playerColor === "white" ? "black" : "white", gameState)
                  ) {
                    legalMoves.push(move)
                  }
                } else {
                  legalMoves.push(move)
                }
              }
            }

            if (legalMoves.length > 0) {
              allMoves.push(legalMoves)
            }
          }
        }
      }

      return allMoves
    },
    [getPossibleMoves, isKingInCheck, isSquareUnderAttack],
  )

  // Check for checkmate or stalemate
  const checkGameEnd = useCallback(
    (board: Board, playerColor: PieceColor, gameState: GameState): "checkmate" | "stalemate" | "ongoing" => {
      const allLegalMoves = getAllLegalMoves(board, playerColor, gameState)
      const hasLegalMoves = allLegalMoves.some((moves) => moves.length > 0)

      if (!hasLegalMoves) {
        const inCheck = isKingInCheck(board, playerColor, gameState)
        return inCheck ? "checkmate" : "stalemate"
      }

      return "ongoing"
    },
    [getAllLegalMoves, isKingInCheck],
  )

  // Check for insufficient material
  const hasInsufficientMaterial = useCallback((board: Board): boolean => {
    const pieces: ChessPiece[] = []
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col]) {
          pieces.push(board[row][col]!)
        }
      }
    }

    // King vs King
    if (pieces.length === 2) return true

    // King and Bishop vs King or King and Knight vs King
    if (pieces.length === 3) {
      const nonKings = pieces.filter((p) => p.type !== "king")
      return nonKings.length === 1 && (nonKings[0].type === "bishop" || nonKings[0].type === "knight")
    }

    return false
  }, [])

  // Check for threefold repetition
  const checkThreefoldRepetition = useCallback((positionHistory: string[], currentPosition: string): boolean => {
    const positions = [...positionHistory, currentPosition]
    const positionCount = positions.filter((pos) => pos === currentPosition).length
    return positionCount >= 3
  }, [])

  // Handle square press
  const handleSquarePress = useCallback(
    (row: number, col: number) => {
      if (!gameState.isGameActive || gameState.gameResult !== "ongoing") return

      if (selectedSquare) {
        const isValidMove = validMoves.some((move) => move.row === row && move.col === col)

        if (isValidMove) {
          const newBoard = gameState.board.map((r) => [...r])
          const piece = newBoard[selectedSquare.row][selectedSquare.col]
          const capturedPiece = newBoard[row][col]

          if (piece) {
            const moveNotation = ""
            let isCapture = !!capturedPiece
            let isEnPassant = false
            let isCastling = false
            let isPromotion = false

            // Handle en passant
            if (
              piece.type === "pawn" &&
              gameState.enPassantTarget &&
              row === gameState.enPassantTarget.row &&
              col === gameState.enPassantTarget.col
            ) {
              const capturedPawnRow = gameState.currentPlayer === "white" ? row + 1 : row - 1
              newBoard[capturedPawnRow][col] = null
              isEnPassant = true
              isCapture = true
            }

            // Handle castling
            if (piece.type === "king" && Math.abs(col - selectedSquare.col) === 2) {
              const rookFromCol = col > selectedSquare.col ? 7 : 0
              const rookToCol = col > selectedSquare.col ? 5 : 3
              const rook = newBoard[row][rookFromCol]
              if (rook) {
                newBoard[row][rookToCol] = { ...rook, hasMoved: true }
                newBoard[row][rookFromCol] = null
              }
              isCastling = true
            }

            // Make the move
            newBoard[row][col] = { ...piece, hasMoved: true }
            newBoard[selectedSquare.row][selectedSquare.col] = null

            // Handle pawn promotion
            if (piece.type === "pawn" && (row === 0 || row === 7)) {
              newBoard[row][col] = { ...piece, type: "queen", hasMoved: true }
              isPromotion = true
            }

            // Check if this move puts own king in check
            if (!isKingInCheck(newBoard, gameState.currentPlayer, gameState)) {
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

                // Update castling rights
                if (piece.type === "king") {
                  if (gameState.currentPlayer === "white") {
                    newState.whiteCanCastleKingside = false
                    newState.whiteCanCastleQueenside = false
                  } else {
                    newState.blackCanCastleKingside = false
                    newState.blackCanCastleQueenside = false
                  }
                } else if (piece.type === "rook") {
                  if (gameState.currentPlayer === "white") {
                    if (selectedSquare.col === 0) newState.whiteCanCastleQueenside = false
                    if (selectedSquare.col === 7) newState.whiteCanCastleKingside = false
                  } else {
                    if (selectedSquare.col === 0) newState.blackCanCastleQueenside = false
                    if (selectedSquare.col === 7) newState.blackCanCastleKingside = false
                  }
                }

                // Update en passant target
                if (piece.type === "pawn" && Math.abs(row - selectedSquare.row) === 2) {
                  newState.enPassantTarget = {
                    row: selectedSquare.row + (row - selectedSquare.row) / 2,
                    col: col,
                  }
                } else {
                  newState.enPassantTarget = null
                }

                // Update fifty move counter
                if (piece.type === "pawn" || isCapture) {
                  newState.fiftyMoveCounter = 0
                } else {
                  newState.fiftyMoveCounter = prev.fiftyMoveCounter + 1
                }

                // Add position to history
                const currentPosition = boardToString(
                  newBoard,
                  gameState.currentPlayer === "white" ? "black" : "white",
                  {
                    whiteKingside: newState.whiteCanCastleKingside,
                    whiteQueenside: newState.whiteCanCastleQueenside,
                    blackKingside: newState.blackCanCastleKingside,
                    blackQueenside: newState.blackCanCastleQueenside,
                  },
                  newState.enPassantTarget,
                )
                newState.positionHistory = [...prev.positionHistory, currentPosition]

                // Switch players
                const nextPlayer = gameState.currentPlayer === "white" ? "black" : "white"
                newState.currentPlayer = nextPlayer

                // Check for game end conditions
                const gameEndStatus = checkGameEnd(newBoard, nextPlayer, newState)

                if (gameEndStatus === "checkmate") {
                  newState.gameResult = gameState.currentPlayer === "white" ? "white-wins" : "black-wins"
                  newState.gameStatus = `Checkmate! ${gameState.currentPlayer === "white" ? "White" : "Black"} wins!`
                  newState.isGameActive = false
                } else if (gameEndStatus === "stalemate") {
                  newState.gameResult = "draw"
                  newState.gameStatus = "Stalemate! Game is drawn."
                  newState.isGameActive = false
                } else if (hasInsufficientMaterial(newBoard)) {
                  newState.gameResult = "draw"
                  newState.gameStatus = "Draw by insufficient material."
                  newState.isGameActive = false
                } else if (newState.fiftyMoveCounter >= 100) {
                  newState.gameResult = "draw"
                  newState.gameStatus = "Draw by fifty-move rule."
                  newState.isGameActive = false
                } else if (checkThreefoldRepetition(prev.positionHistory, currentPosition)) {
                  newState.gameResult = "draw"
                  newState.gameStatus = "Draw by threefold repetition."
                  newState.isGameActive = false
                } else if (isKingInCheck(newBoard, nextPlayer, newState)) {
                  newState.gameStatus = `${nextPlayer === "white" ? "White" : "Black"} is in check!`
                } else {
                  newState.gameStatus = "Game in progress"
                }

                return newState
              })
            } else {
              Alert.alert("Invalid Move", "This move would put your king in check!")
            }
          }
        }

        setSelectedSquare(null)
        setValidMoves([])
      } else {
        const piece = gameState.board[row][col]
        if (piece && piece.color === gameState.currentPlayer) {
          setSelectedSquare({ row, col })
          const moves = getPossibleMoves(piece, row, col, gameState.board, gameState)

          // Filter out illegal moves that would put king in check
          const legalMoves = moves.filter((move) => {
            const testBoard = gameState.board.map((r) => [...r])

            // Handle en passant capture
            if (
              piece.type === "pawn" &&
              gameState.enPassantTarget &&
              move.row === gameState.enPassantTarget.row &&
              move.col === gameState.enPassantTarget.col
            ) {
              const capturedPawnRow = gameState.currentPlayer === "white" ? move.row + 1 : move.row - 1
              testBoard[capturedPawnRow][move.col] = null
            }

            testBoard[move.row][move.col] = piece
            testBoard[row][col] = null

            // Handle castling
            if (piece.type === "king" && Math.abs(move.col - col) === 2) {
              const rookFromCol = move.col > col ? 7 : 0
              const rookToCol = move.col > col ? 5 : 3
              const rook = testBoard[row][rookFromCol]
              testBoard[row][rookToCol] = rook
              testBoard[row][rookFromCol] = null

              // Check if king passes through check
              const passingCol = move.col > col ? col + 1 : col - 1
              if (
                isSquareUnderAttack(
                  gameState.board,
                  row,
                  passingCol,
                  gameState.currentPlayer === "white" ? "black" : "white",
                  gameState,
                )
              ) {
                return false
              }
            }

            return !isKingInCheck(testBoard, gameState.currentPlayer, gameState)
          })

          setValidMoves(legalMoves)
        }
      }
    },
    [
      selectedSquare,
      validMoves,
      gameState,
      getPossibleMoves,
      isKingInCheck,
      isSquareUnderAttack,
      checkGameEnd,
      hasInsufficientMaterial,
      checkThreefoldRepetition,
    ],
  )

  // Reset game
  const resetGame = () => {
    setGameState({
      board: createInitialBoard(),
      currentPlayer: "white",
      whiteTime: base * 60,
      blackTime: base * 60,
      whiteMoves: 0,
      blackMoves: 0,
      capturedByWhite: [],
      capturedByBlack: [],
      gameStatus: "Game in progress",
      isGameActive: true,
      gameResult: "ongoing",
      enPassantTarget: null,
      whiteCanCastleKingside: true,
      whiteCanCastleQueenside: true,
      blackCanCastleKingside: true,
      blackCanCastleQueenside: true,
      moveHistory: [],
      fiftyMoveCounter: 0,
      positionHistory: [],
    })
    setSelectedSquare(null)
    setValidMoves([])
  }

  // Add increment after each move
  const handleMove = (from: Position, to: Position) => {
    const piece = gameState.board[from.row][from.col]
    const target = gameState.board[to.row][to.col]

    // Make the move
    const newBoard = gameState.board.map((r) => [...r])
    newBoard[to.row][to.col] = { ...piece, hasMoved: true }
    newBoard[from.row][from.col] = null

    // Handle pawn promotion
    if (piece && piece.type === "pawn" && (to.row === 0 || to.row === 7)) {
      newBoard[to.row][to.col] = { ...piece, type: "queen", hasMoved: true, color: piece.color, id: piece.id }
    }

    setGameState((prev) => {
      let newWhiteTime = prev.whiteTime
      let newBlackTime = prev.blackTime
      if (prev.currentPlayer === "white") newWhiteTime += increment
      else newBlackTime += increment

      // Defensive: ensure piece is not null
      const piece = prev.board[from.row][from.col]
      const target = prev.board[to.row][to.col]
      if (!piece) return prev

      // Make the move
      let newBoard = prev.board.map((row) => row.slice())
      newBoard[from.row][from.col] = null
      newBoard[to.row][to.col] = { ...piece, hasMoved: true, type: piece.type, color: piece.color, id: piece.id }

      // Pawn promotion
      if (piece && piece.type === "pawn" && (to.row === 0 || to.row === 7)) {
        newBoard[to.row][to.col] = { ...piece, type: "queen", hasMoved: true, color: piece.color, id: piece.id }
      }

      return {
        ...prev,
        board: newBoard,
        whiteTime: newWhiteTime,
        blackTime: newBlackTime,
        whiteCanCastleKingside: piece && piece.type === "king" ? false : prev.whiteCanCastleKingside,
        whiteCanCastleQueenside: piece && piece.type === "king" ? false : prev.whiteCanCastleQueenside,
        blackCanCastleKingside: piece && piece.type === "king" ? false : prev.blackCanCastleKingside,
        blackCanCastleQueenside: piece && piece.type === "king" ? false : prev.blackCanCastleQueenside,
        enPassantTarget: piece && piece.type === "pawn" && Math.abs(to.row - from.row) === 2 ? { row: (from.row + to.row) / 2, col: to.col } : null,
        fiftyMoveCounter: piece && (piece.type === "pawn" || !!target) ? 0 : prev.fiftyMoveCounter + 1,
      }
    })
  }

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
        {isValidMove && piece && <View style={styles.captureIndicator} />}
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

      {/* Game status and controls */}
      <View style={styles.statusContainer}>
        <Text style={[styles.gameStatus, gameState.gameResult !== "ongoing" && styles.gameEndStatus]}>
          {gameState.gameStatus}
        </Text>

        {gameState.gameResult !== "ongoing" && (
          <TouchableOpacity style={styles.resetButton} onPress={resetGame}>
            <Text style={styles.resetButtonText}>New Game</Text>
          </TouchableOpacity>
        )}

        <View style={styles.gameInfo}>
          <Text style={styles.infoText}>Fifty-move counter: {gameState.fiftyMoveCounter}/100</Text>
          {gameState.enPassantTarget && <Text style={styles.infoText}>En passant available</Text>}
        </View>
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
  captureIndicator: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ef4444",
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
    marginBottom: 8,
  },
  gameEndStatus: {
    color: "#81b64c",
    fontSize: 18,
    fontWeight: "bold",
  },
  resetButton: {
    backgroundColor: "#81b64c",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  resetButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  gameInfo: {
    marginTop: 10,
    alignItems: "center",
  },
  infoText: {
    color: "#ccc",
    fontSize: 12,
    marginVertical: 2,
  },
})

export default ChessApp
