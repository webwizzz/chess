"use client"

import { useRouter } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native"
import Svg, { Path } from "react-native-svg"
import type { Socket } from "socket.io-client"
import { getSocket, getSocketInstance } from "../utils/socketManager"
import VariantCard from "./components/VariantCard"
import ChessGame from "./chessboards/classic"
import DecayChessGame from "./chessboards/Decay"
import SixPointerChessGame from "./chessboards/SixPointer"
import CrazyHouseChessGame from "./chessboards/crazyHouse"

// Re-use the GameState interface or import it if defined in a shared file
interface GameState {
  sessionId: string
  variantName: string
  subvariantName?: string
  description: string
  players: {
    white: {
      userId: string
      username: string
      rating: number
      avatar: string | null
      title: string | null
    }
    black: {
      userId: string
      username: string
      rating: number
      avatar: string | null
      title: string | null
    }
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
      white: string[]
      black: string[]
    }
    dropTimers?: {
      white: { [piece: string]: number }
      black: { [piece: string]: number }
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
  }
  status: string
  result: string
  moves: string[]
  moveCount: number
  lastMove: string | null
  gameState: {
    check: boolean
    checkmate: boolean
    stalemate: boolean
  }
  userColor: {
    [key: string]: "white" | "black"
  }
}

interface TournamentOption {
  title: string
  description: string
  action: string
  rules: string
  height: number
}

interface TournamentDetails {
  id: string
  name: string
  capacity: number
  startTime: number
  duration: number
  entryFee: number
  prizePool: number
  status: "open" | "in-progress" | "finished"
  participantsCount: number
  createdAt: number
}

interface TournamentScreenProps {
  userId: string;
}

export default function TournamentScreen({ userId }: TournamentScreenProps) {
  const router = useRouter()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [activeTournament, setActiveTournament] = useState<TournamentDetails | null>(null)
  const [isJoiningTournament, setIsJoiningTournament] = useState(false)
  const [isTournamentQueueing, setIsTournamentQueueing] = useState(false)
  const [opponent, setOpponent] = useState<string | null>(null)
  const [timer, setTimer] = useState(0)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [isMatchFound, setIsMatchFound] = useState(false)
  const [loading, setLoading] = useState(false)
  const [gameSocket, setGameSocket] = useState<Socket | null>(null)
  const [matchedVariant, setMatchedVariant] = useState<string | null>(null)
  const [matchedSubvariant, setMatchedSubvariant] = useState<string | null>(null)
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [selectedRulesTitle, setSelectedRulesTitle] = useState("")
  const [selectedRulesContent, setSelectedRulesContent] = useState("")

  // Tournament options data with specific heights
  const tournamentOptions = [
    {
      title: "Leaderboard",
      description: "View tournament rankings and top players",
      action: "leaderboard",
      rules:
        "Tournament leaderboard shows player rankings based on their performance in tournaments. Points are awarded based on placement: 1st place gets 100 points, 2nd gets 75 points, 3rd gets 50 points, and participation gives 10 points.",
      flex: 0.2,
      isMainCard: false,
    },
    {
      title: "Victory Rush",
      description: activeTournament
        ? `${activeTournament.name} - ${activeTournament.participantsCount}/${activeTournament.capacity} players`
        : "Join the current active tournament",
      action: "tournament",
      rules: activeTournament
        ? `Tournament: ${activeTournament.name}\nEntry Fee: ₹${activeTournament.entryFee}\nPrize Pool: ₹${activeTournament.prizePool}\nCapacity: ${activeTournament.capacity} players\nStatus: ${activeTournament.status.toUpperCase()}`
        : "No active tournament available. Join to create or participate in tournaments.",
      flex: 0.6,
      isMainCard: true,
      image: require("../assets/ttt.png"),
    },
    {
      title: "Rules & Terms",
      description: "Tournament rules and terms of service",
      action: "rules",
      rules:
        "Tournament Rules:\n\n1. Fair Play: No cheating or external assistance allowed\n2. Time Control: Standard tournament time controls apply\n3. Conduct: Respectful behavior required at all times\n4. Entry Fees: Non-refundable once tournament starts\n5. Prizes: Distributed based on final standings\n6. Disputes: Contact support for any issues\n\nTerms of Service:\n- Players must be 13+ years old\n- Account suspension for rule violations\n- Prize distribution within 24 hours of tournament completion",
      flex: 0.2,
      isMainCard: false,
    },
  ]

  // Custom Info Icon Component
  const InfoIcon = () => (
    <Svg width="24" height="24" viewBox="0 0 100 100">
      <Path
        d="M 30.306641 17.960938 C 23.138641 17.960938 17.306641 23.792938 17.306641 30.960938 L 17.306641 69.960938 C 17.306641 77.128938 23.138641 82.960938 30.306641 82.960938 L 69.306641 82.960938 C 76.474641 82.960938 82.306641 77.128938 82.306641 69.960938 L 82.306641 30.960938 C 82.306641 23.791938 76.475641 17.960938 69.306641 17.960938 L 30.306641 17.960938 z M 30.306641 19.960938 L 69.306641 19.960938 C 75.371641 19.960938 80.306641 24.895937 80.306641 30.960938 L 80.306641 69.960938 C 80.306641 76.025937 75.371641 80.960938 69.306641 80.960938 L 30.306641 80.960938 C 24.241641 80.960938 19.306641 76.025937 19.306641 69.960938 L 19.306641 30.960938 C 19.306641 24.895937 24.241641 19.960938 30.306641 19.960938 z M 33.144531 22.960938 C 27.168531 22.960938 22.306641 27.822828 22.306641 33.798828 L 22.306641 67.123047 C 22.306641 73.099047 27.168531 77.960938 33.144531 77.960938 L 66.470703 77.960938 C 72.446703 77.960938 77.306641 73.099047 77.306641 67.123047 L 77.306641 48.460938 C 77.306641 48.183937 77.082641 47.960938 76.806641 47.960938 C 76.530641 47.960938 76.306641 48.184937 76.306641 48.460938 L 76.306641 67.123047 C 76.306641 72.547047 71.894703 76.960938 66.470703 76.960938 L 33.144531 76.960938 C 27.720531 76.960938 23.306641 72.547047 23.306641 67.123047 L 23.306641 33.798828 C 23.306641 28.374828 27.720531 23.960937 33.144531 23.960938 L 66.806641 23.960938 C 67.082641 23.960938 67.306641 23.736937 67.306641 23.460938 C 67.306641 23.184938 67.082641 22.960937 66.806641 22.960938 L 33.144531 22.960938 z M 50.128906 32.591797 C 48.861906 32.591797 47.751219 33.005266 46.824219 33.822266 C 45.881219 34.655266 45.402344 35.700734 45.402344 36.927734 C 45.402344 37.544734 45.534875 38.128156 45.796875 38.660156 C 46.050875 39.179156 46.393406 39.638344 46.816406 40.027344 C 47.236406 40.413344 47.733016 40.726031 48.291016 40.957031 C 48.856016 41.192031 49.474906 41.310547 50.128906 41.310547 C 51.434906 41.310547 52.551266 40.877484 53.447266 40.021484 C 54.348266 39.158484 54.804687 38.117734 54.804688 36.927734 C 54.804688 35.733734 54.336062 34.699562 53.414062 33.851562 C 52.503062 33.015563 51.398906 32.591797 50.128906 32.591797 z M 50.130859 33.591797 C 51.156859 33.591797 52.008281 33.918844 52.738281 34.589844 C 53.456281 35.249844 53.806641 36.014688 53.806641 36.929688 C 53.806641 37.848687 53.463812 38.624781 52.757812 39.300781 C 52.044812 39.982781 51.184859 40.3125 50.130859 40.3125 C 49.608859 40.3125 49.117828 40.220156 48.673828 40.035156 C 48.223828 39.848156 47.827141 39.599922 47.494141 39.294922 C 47.163141 38.990922 46.894312 38.630656 46.695312 38.222656 C 46.502313 37.826656 46.402344 37.391687 46.402344 36.929688 C 46.402344 35.988687 46.756328 35.216266 47.486328 34.572266 C 48.234328 33.911266 49.099859 33.591797 50.130859 33.591797 z M 76.806641 36.960938 C 76.530641 36.960938 76.306641 37.183937 76.306641 37.460938 L 76.306641 39.460938 C 76.306641 39.736938 76.530641 39.960938 76.806641 39.960938 C 77.082641 39.960938 77.306641 39.736937 77.306641 39.460938 L 76.306641 37.460938 C 77.306641 37.184937 77.082641 36.960938 76.806641 36.960938 z M 76.806641 40.960938 C 76.530641 40.960938 76.306641 41.184938 76.306641 41.460938 L 76.306641 45.460938 C 76.306641 45.736938 76.530641 45.960937 76.806641 45.960938 C 77.082641 45.960938 77.306641 45.736938 77.306641 45.460938 L 77.306641 41.460938 C 77.306641 41.183937 77.082641 40.960938 76.806641 40.960938 z M 42.757812 44.013672 C 42.481812 44.013672 42.257813 44.237672 42.257812 44.513672 L 42.257812 47.087891 C 42.257812 47.363891 42.481812 47.587891 42.757812 47.587891 C 46.390813 47.587891 46.390625 48.797313 46.390625 49.195312 L 46.390625 62.919922 C 46.390625 63.328922 46.390812 64.419922 42.757812 64.419922 C 42.481812 64.419922 42.257813 64.643922 42.257812 64.919922 L 42.257812 67.492188 C 42.257812 67.768187 42.481812 67.992188 42.757812 67.992188 L 57.765625 67.992188 C 58.041625 67.992188 58.265625 67.768187 58.265625 67.492188 L 58.265625 64.919922 C 58.265625 64.643922 58.041625 64.419922 57.765625 64.419922 C 56.038625 64.419922 54.931656 64.173406 54.472656 63.691406 C 54.282656 63.491406 54.20175 63.243156 54.21875 62.910156 L 54.21875 62.886719 L 54.21875 44.513672 C 54.21875 44.237672 53.99475 44.013672 53.71875 44.013672 L 42.757812 44.013672 z M 43.257812 45.013672 L 53.216797 45.013672 L 53.216797 62.876953 C 53.189797 63.479953 53.367094 63.985813 53.746094 64.382812 C 54.364094 65.031813 55.488625 65.361109 57.265625 65.412109 L 57.265625 66.992188 L 43.257812 66.992188 L 43.257812 65.414062 C 44.685812 65.383062 47.390625 65.121922 47.390625 62.919922 L 47.390625 49.195312 C 47.390625 47.560313 46.000812 46.687703 43.257812 46.595703 L 43.257812 45.013672 z"
        fill="#fff"
      />
    </Svg>
  )

  // --- Socket Initialization and Cleanup ---
  useEffect(() => {
    const existingSocket = getSocketInstance()
    if (existingSocket) {
      setSocket(existingSocket)
      console.log("Using existing socket instance for tournament screen")
      existingSocket.onAny((event: string, ...args: any[]) => {
        console.log("[SOCKET EVENT - TOURNAMENT SCREEN]", event, args)
      })
    } else {
      Alert.alert("Connection Error", "Failed to connect to the server.", [
        {
          text: "OK",
          onPress: () => {
            setTimeout(() => {
              router.replace("/choose")
            }, 100)
          },
        },
      ])
    }

    return () => {
      if (existingSocket && existingSocket.connected && !isMatchFound) {
        existingSocket.off("tournament:active_details")
        existingSocket.off("tournament:joined")
        existingSocket.off("tournament:left")
        existingSocket.off("tournament:error")
        existingSocket.off("queue:matched")
        existingSocket.off("tournament:new_active")
        existingSocket.off("queue:cooldown")
      }
    }
  }, [isMatchFound, router])

  // --- Tournament & Matchmaking Listeners ---
  useEffect(() => {
    if (!socket || !userId) {
      console.log("Socket or userId not available for tournament listeners setup.")
      return
    }

    socket.emit("tournament:get_active")

    const handleActiveDetails = (response: { tournament: TournamentDetails | null }) => {
      console.log("Active tournament details:", response.tournament)
      setActiveTournament(response.tournament)
      setIsJoiningTournament(false)
    }

    const handleNewActive = (response: { tournamentId: string; name: string }) => {
      Alert.alert("New Tournament!", `A new tournament "${response.name}" (${response.tournamentId}) has started!`)
      socket.emit("tournament:get_active")
    }

    const handleTournamentJoined = (response: { tournament: TournamentDetails }) => {
      console.log("Joined tournament:", response.tournament)
      setActiveTournament(response.tournament)
      setIsJoiningTournament(false)
      setIsTournamentQueueing(true)
      setTimer(0)
    }

    const handleTournamentLeft = (response: { message: string }) => {
      Alert.alert("Tournament Status", response.message)
      setActiveTournament(null)
      setIsTournamentQueueing(false)
      setOpponent(null)
      setTimer(0)
      setIsJoiningTournament(false)
    }

    const handleTournamentError = (response: { message: string; error?: any }) => {
      console.error("Tournament error:", response)
      Alert.alert("Tournament Error", response.message + (response.error ? `: ${response.error}` : ""))
      setIsJoiningTournament(false)
      setIsTournamentQueueing(false)
    }

    const handleCooldown = (response: { until: number }) => {
      const remainingSeconds = Math.ceil((response.until - Date.now()) / 1000)
      Alert.alert("Cooldown", `You are on cooldown. Try again in ${remainingSeconds} seconds.`)
      setIsJoiningTournament(false)
      setIsTournamentQueueing(false)
    }

    const handleQueueMatched = (response: {
      opponent: { userId: string; name: string }
      variant: string
      subvariant?: string
      sessionId: string
      gameState: GameState
      tournamentMatch?: boolean
    }) => {
      console.log("Received match found response:", response)
      setOpponent(response.opponent.name)
      setGameState(response.gameState)
      setMatchedVariant(response.variant)
      setMatchedSubvariant(response.subvariant || null)
      setTimer(0)

      const matchType = response.tournamentMatch ? "Tournament Match!" : "Match Found!"
      Alert.alert(
        matchType,
        `You've been matched in ${response.variant} ${response.subvariant || ""} with ${response.opponent.name}!`,
      )

      setTimeout(() => {
        setIsMatchFound(true)
        setLoading(true)

        socket.off("tournament:active_details", handleActiveDetails)
        socket.off("tournament:new_active", handleNewActive)
        socket.off("tournament:joined", handleTournamentJoined)
        socket.off("tournament:left", handleTournamentLeft)
        socket.off("tournament:error", handleTournamentError)
        socket.off("queue:cooldown", handleCooldown)
        socket.off("queue:matched", handleQueueMatched)

        console.log("Disconnecting lobby socket for game transition...")
        socket.disconnect()
        console.log("Lobby socket disconnected.")

        const sessionId = response.sessionId
        const gameSocketInstance = getSocket(userId, "game", sessionId, response.variant, response.subvariant)

        if (!gameSocketInstance) {
          console.error("Failed to get game socket instance")
          Alert.alert("Failed to connect to game. Please try again.")
          setLoading(false)
          return
        }

        setGameSocket(gameSocketInstance)
        console.log("Connected to game socket for session:", sessionId)
        setLoading(false)
      }, 2000)
    }

    socket.on("tournament:active_details", handleActiveDetails)
    socket.on("tournament:new_active", handleNewActive)
    socket.on("tournament:joined", handleTournamentJoined)
    socket.on("tournament:left", handleTournamentLeft)
    socket.on("tournament:error", handleTournamentError)
    socket.on("queue:cooldown", handleCooldown)
    socket.on("queue:matched", handleQueueMatched)

    return () => {
      if (socket && socket.connected) {
        socket.off("tournament:active_details", handleActiveDetails)
        socket.off("tournament:new_active", handleNewActive)
        socket.off("tournament:joined", handleTournamentJoined)
        socket.off("tournament:left", handleTournamentLeft)
        socket.off("tournament:error", handleTournamentError)
        socket.off("queue:cooldown", handleCooldown)
        socket.off("queue:matched", handleQueueMatched)
      }
    }
  }, [socket, userId])

  // --- Matchmaking Timer Effect ---
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => prev + 1)
    }, 1000)

    if (!isTournamentQueueing || opponent || isMatchFound) {
      clearInterval(interval)
      return
    }

    if (timer > 60 && timer % 30 === 0) {
      Alert.alert(
        "Still Searching...",
        `No opponent found in ${timer} seconds. Do you want to continue waiting or leave the tournament?`,
        [
          { text: "Continue Waiting", style: "cancel" },
          { text: "Leave Tournament", onPress: () => handleLeaveTournament() },
        ],
      )
    }

    return () => clearInterval(interval)
  }, [timer, opponent, isMatchFound, isTournamentQueueing])

  // --- Handlers ---
  const handleJoinTournament = useCallback(() => {
    if (!socket || !userId) {
      Alert.alert("Error", "Not connected to server or user not identified.")
      return
    }

    if (activeTournament && activeTournament.status !== "open") {
      Alert.alert("Tournament Closed", "Tournament registration is closed.")
      return
    }

    if (activeTournament && activeTournament.participantsCount >= activeTournament.capacity) {
      Alert.alert("Tournament Full", "This tournament has reached its maximum capacity.")
      return
    }

    setIsJoiningTournament(true)
    socket.emit("tournament:join", { userId })
  }, [socket, userId, activeTournament])

  const handleLeaveTournament = useCallback(() => {
    if (!socket || !userId) {
      Alert.alert("Error", "Not connected to server or user not identified.")
      return
    }

    setIsJoiningTournament(false)
    setIsTournamentQueueing(false)
    setOpponent(null)
    setTimer(0)
    setGameState(null)
    setIsMatchFound(false)
    setLoading(false)
    setMatchedVariant(null)
    setMatchedSubvariant(null)

    socket.emit("tournament:leave", { userId })
  }, [socket, userId])

  const handleOptionPress = (action: string) => {
    switch (action) {
      case "leaderboard":
        router.push({ pathname: "/leaderboard" } as any)
        break
      case "tournament":
        if (isTournamentQueueing) {
          handleLeaveTournament()
        } else {
          handleJoinTournament()
        }
        break
      case "rules":
        // Rules are handled by info button
        break
    }
  }

  const handleInfoPress = (option: any) => {
    setSelectedRulesTitle(option.title)
    setSelectedRulesContent(option.rules)
    setShowRulesModal(true)
  }

  const closeRulesModal = () => {
    setShowRulesModal(false)
    setSelectedRulesTitle("")
    setSelectedRulesContent("")
  }

  // Render the appropriate game component
  if (isMatchFound && gameState && gameSocket && matchedVariant) {
    switch (matchedVariant) {
      case "classic":
        return <ChessGame initialGameState={gameState} userId={userId} />
      case "decay":
        return <DecayChessGame initialGameState={gameState} userId={userId} />
      case "sixpointer":
        return <SixPointerChessGame initialGameState={gameState} userId={userId} />
      case "crazyhouse":
        return <CrazyHouseChessGame initialGameState={gameState} userId={userId} />
      default:
        return <Text style={styles.errorText}>Unsupported variant: {matchedVariant}</Text>
    }
  } else if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00A862" />
        <Text style={styles.infoText}>Waiting for match to be established...</Text>
      </View>
    )
  }

  // Tournament Lobby UI with Choose.tsx styling
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* Victory Rush Card */}
        <View style={styles.victoryRushCard}>
          <View style={styles.victoryRushContent}>
            <Image 
              source={require("../assets/tl.png")} 
              style={styles.victoryRushLogo}
              resizeMode="contain"
            />
            <Text style={styles.victoryRushSubtitle}>Rack up wins.</Text>
            <TouchableOpacity 
              style={styles.joinNowButton}
              onPress={() => handleJoinTournament()}
              disabled={isTournamentQueueing || isJoiningTournament}
            >
              <Text style={styles.joinNowText}>Join Now</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tournament Status */}
        {isTournamentQueueing && (
          <View style={styles.connectingContainer}>
            <Text style={styles.connectingText}>Searching for tournament match...</Text>
            <ActivityIndicator size="small" color="#00A862" style={{ marginVertical: 10 }} />
            <Text style={styles.connectingTimer}>Time in queue: {timer}s</Text>
            {opponent && !isMatchFound && <Text style={styles.matchFoundText}>Match Found with {opponent}!</Text>}
          </View>
        )}

        {/* Tournament Options */}
        <View style={styles.variantsColumn}>
          {tournamentOptions.map((option) => (
            option.isMainCard ? (
              <VariantCard
                key={option.title}
                variantName={option.title}
                activePlayers={activeTournament ? activeTournament.participantsCount : 0}
                description={option.description}
                onPlay={() => handleOptionPress(option.action)}
              />
            ) : (
              <View
                key={option.title}
                style={[
                  styles.variantCard,
                  { backgroundColor: "#2C2C2E" }
                ]}
              >
                <TouchableOpacity
                  style={styles.variantCardContent}
                  activeOpacity={0.85}
                  onPress={() => handleOptionPress(option.action)}
                >
                  <View style={styles.cardLeft}>
                    <View style={styles.variantIconContainer}>
                      {option.action === "leaderboard" ? (
                        <Svg width="42" height="42" viewBox="0 0 24 24">
                          <Path
                            d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"
                            fill="#fff"
                          />
                        </Svg>
                      ) : (
                        <Svg width="42" height="42" viewBox="0 0 24 24">
                          <Path
                            d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"
                            fill="#fff"
                          />
                        </Svg>
                      )}
                    </View>
                    <View style={styles.cardTextContainer}>
                      <Text style={styles.variantTitle}>{option.title}</Text>
                      <Text style={styles.variantSubtitle}>{option.description}</Text>
                    </View>
                  </View>
                  <Text style={styles.arrowText}>›</Text>
                </TouchableOpacity>
              </View>
            )
          ))}
          {isTournamentQueueing && (
            <Text style={styles.statusText}>Currently in queue - Tap to leave</Text>
          )}
          {isJoiningTournament && (
            <ActivityIndicator size="small" color="#00A862" style={{ marginTop: 5 }} />
          )}
        </View>
      </ScrollView>
      
      {/* Rules Modal */}
      <Modal visible={showRulesModal} transparent={true} animationType="fade" onRequestClose={closeRulesModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.rulesModal}>
            <Text style={styles.rulesTitle}>{selectedRulesTitle}</Text>
            <ScrollView style={styles.rulesContent}>
              <Text style={styles.rulesText}>{selectedRulesContent}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.closeRulesButton} onPress={closeRulesModal}>
              <Text style={styles.closeRulesButtonText}>Close</Text>
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
    backgroundColor: "#1C1C1E", // Main background color from Choose.tsx
  },
  victoryRushCard: {
    backgroundColor: "#69923e", // Deep purple color
    borderRadius: 16,
    marginBottom: 20,
    marginTop: 100, // Space for the overlapping logo
    padding: 0,
    paddingBottom: 24,
  },
  victoryRushContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  victoryRushLogo: {
    width: '150%',
    height: 250,
    position: 'absolute',
    top: -100, // Pull the logo up to overlap
    zIndex: 1,
  },
  victoryRushTitle: {
    color: "#FFF5E1", // Off-white color
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 8,
    textTransform: 'uppercase',
    letterSpacing: 2,
    lineHeight: 38,
  },
  victoryRushSubtitle: {
    paddingTop: 90,
    color: "#FFF5E1",
    fontSize: 18,
    marginBottom: 20,
    opacity: 0.9,
  },
  joinNowButton: {
    backgroundColor: "#FFA500", // Orange color
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
    minWidth: 160,
  },
  joinNowText: {
    color: "#000",
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // Header and nav styles removed
  topNavButton: {
    alignItems: "center",
    width: "30%",
  },
  iconContainer: {
    position: "relative",
    width: "100%",
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  iconBackground: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.08)", // Icon background from Choose.tsx
    borderRadius: 12,
  },
  icon: {
    zIndex: 1,
    marginBottom: 16,
  },
  topNavButtonText: {
    position: "absolute",
    bottom: 8,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    zIndex: 1,
    opacity: 0.9,
  },
  scrollViewContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 0, // Remove top padding to allow logo to overlap properly
  },
  connectingContainer: {
    marginBottom: 20,
    alignItems: "center",
    backgroundColor: "#2C2C2E", // Card background from Choose.tsx
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  connectingText: {
    color: "#FFFFFF",
    fontSize: 18,
    marginBottom: 10,
    textAlign: "center",
  },
  connectingTimer: {
    color: "#B0B0B0", // Secondary text color from Choose.tsx
    fontSize: 16,
    marginTop: 5,
  },
  matchFoundText: {
    color: "#00A862", // Green accent color from Choose.tsx
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 15,
    textAlign: "center",
  },
  variantsColumn: {
    flexDirection: "column",
    width: "100%",
  },
  variantCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  variantCardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  variantIconContainer: {
    position: "relative",
    width: 52,
    height: 52,
    marginRight: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#769656", // Chess piece background from Choose.tsx
    borderRadius: 12,
  },
  cardTextContainer: {
    flex: 1,
  },
  variantTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  variantSubtitle: {
    color: "rgba(255, 255, 255, 0.8)", // Subtitle color from Choose.tsx
    fontSize: 14,
    marginBottom: 8,
    lineHeight: 18,
  },
  statusText: {
    color: "#00A862",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 5,
  },
  arrowText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "300",
  },
  cardDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)", // Modal overlay from Choose.tsx
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  rulesModal: {
    backgroundColor: "#3A3A3C", // Modal background from Choose.tsx
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    borderColor: "#48484A", // Modal border from Choose.tsx
    borderWidth: 1,
  },
  rulesTitle: {
    color: "#00A862", // Green title from Choose.tsx
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  rulesContent: {
    maxHeight: 300,
    marginBottom: 20,
  },
  rulesText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "left",
  },
  closeRulesButton: {
    backgroundColor: "#00A862", // Green button from Choose.tsx
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: "center",
  },
  closeRulesButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  // Bottom nav bar removed
  // Navigation button styles removed
  errorText: {
    color: "#fff",
    fontSize: 20,
    textAlign: "center",
  },
  infoText: {
    color: "#b0b3b8",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
  },
  mainTournamentCard: {
    borderRadius: 16,
    padding: 0,
    marginBottom: 16,
    width: "100%",
    minHeight: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    overflow: "hidden",
  },
  mainTournamentCardContent: {
    flex: 1,
    height: "100%",
  },
  mainCardLayout: {
    flex: 1,
    flexDirection: "column",
  },
  tournamentImageContainer: {
    height: 160,
    width: "100%",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  tournamentImage: {
    width: "200%",
    height: "200%",
  },
  mainCardTextContainer: {
    padding: 20,
    flex: 1,
    justifyContent: "center",
  },
  mainCardTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  mainCardDescription: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 10,
  },
})
