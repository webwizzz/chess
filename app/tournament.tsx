import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react"; // Added useCallback
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Socket } from "socket.io-client";
import { getSocket, getSocketInstance } from "../utils/socketManager";
import ChessGame from "./ChessGame";
import DecayChessGame from "./Decay";
import SixPointChessGame from "./SixPointer";
import CrazyHouse from "./crazyHouse";

// Re-use the GameState interface or import it if defined in a shared file
interface GameState {
  sessionId: string;
  variantName: string; // Changed from variantName to 'variant' for consistency
  subvariantName?: string; // Made optional
  description: string;
  players: {
    white: {
      userId: string;
      username: string;
      rating: number;
      avatar: string | null;
      title: string | null;
    };
    black: {
      userId: string;
      username: string;
      rating: number;
      avatar: string | null;
      title: string | null;
    };
  };
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
  };
  timeControl: {
    type: string;
    baseTime: number;
    increment: number;
    timers: {
      white: number;
      black: number;
    };
    flagged: {
      white: boolean;
      black: boolean;
    };
  };
  status: string;
  result: string;
  moves: string[];
  moveCount: number;
  lastMove: string | null;
  gameState: {
    check: boolean;
    checkmate: boolean;
    stalemate: boolean;
  };
  userColor: {
    [key: string]: "white" | "black";
  };
}

interface TournamentDetails {
  id: string;
  name: string;
  capacity: number;
  startTime: number;
  duration: number;
  entryFee: number;
  prizePool: number;
  status: 'open' | 'in-progress' | 'finished';
  participantsCount: number;
  createdAt: number;
}

export default function TournamentScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeTournament, setActiveTournament] = useState<TournamentDetails | null>(null);
  const [isJoiningTournament, setIsJoiningTournament] = useState(false);
  const [isTournamentQueueing, setIsTournamentQueueing] = useState(false);
  const [opponent, setOpponent] = useState<string | null>(null);
  const [timer, setTimer] = useState(0); // For matchmaking timer
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isMatchFound, setIsMatchFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gameSocket, setGameSocket] = useState<Socket | null>(null); // This needs to be passed to game components
  const [matchedVariant, setMatchedVariant] = useState<string | null>(null);
  const [matchedSubvariant, setMatchedSubvariant] = useState<string | null>(null);

  // --- Socket Initialization and Cleanup ---
  useEffect(() => {
    const existingSocket = getSocketInstance();
    if (existingSocket) {
      setSocket(existingSocket);
      console.log("Using existing socket instance for tournament screen");
      // Keep a general any-event listener for debugging
      existingSocket.onAny((event: string, ...args: any[]) => {
        console.log("[SOCKET EVENT - TOURNAMENT SCREEN]", event, args);
      });
    } else {
      Alert.alert("Connection Error", "Failed to connect to the server.");
      router.replace("/choose"); // Redirect if no socket
    }

    return () => {
      // General cleanup for listeners that *might* still be active if
      // the component unmounts before a match is found or explicitly left.
      // The `queue:matched` handler performs a more targeted cleanup.
      if (existingSocket && existingSocket.connected && !isMatchFound) {
        existingSocket.off("tournament:active_details");
        existingSocket.off("tournament:joined");
        existingSocket.off("tournament:left");
        existingSocket.off("tournament:error");
        existingSocket.off("queue:matched");
        existingSocket.off("tournament:new_active");
        existingSocket.off("queue:cooldown");
        // No disconnect here unless absolutely necessary for the component lifecycle.
        // `getSocketInstance()` implies a singleton, so disconnecting it here might
        // affect other parts of the app if they rely on the same persistent socket.
        // The game transition handles its own socket lifecycle.
      }
    };
  }, [isMatchFound, router]); // Added router to dependencies for safety

  // --- Tournament & Matchmaking Listeners ---
  useEffect(() => {
    if (!socket || !userId) {
      console.log("Socket or userId not available for tournament listeners setup.");
      return;
    }

    // Request active tournament details on mount
    socket.emit("tournament:get_active");

    // Listeners are wrapped in useCallback to prevent re-creation on every render
    // and make cleanup more reliable.

    const handleActiveDetails = (response: { tournament: TournamentDetails | null }) => {
      console.log("Active tournament details:", response.tournament);
      setActiveTournament(response.tournament);
      setIsJoiningTournament(false);
    };

    const handleNewActive = (response: { tournamentId: string, name: string }) => {
      Alert.alert("New Tournament!", `A new tournament "${response.name}" (${response.tournamentId}) has started!`);
      socket.emit("tournament:get_active"); // Re-fetch details for the new tournament
    };

    const handleTournamentJoined = (response: { tournament: TournamentDetails }) => {
      console.log("Joined tournament:", response.tournament);
      setActiveTournament(response.tournament);
      setIsJoiningTournament(false);
      setIsTournamentQueueing(true); // User is now in the tournament matchmaking queue
      setTimer(0); // Start matchmaking timer
    };

    const handleTournamentLeft = (response: { message: string }) => {
      Alert.alert("Tournament Status", response.message);
      setActiveTournament(null);
      setIsTournamentQueueing(false);
      setOpponent(null);
      setTimer(0);
      setIsJoiningTournament(false); // Reset joining state if left
    };

    const handleTournamentError = (response: { message: string; error?: any }) => {
      console.error("Tournament error:", response);
      Alert.alert("Tournament Error", response.message + (response.error ? `: ${response.error}` : ''));
      setIsJoiningTournament(false);
      setIsTournamentQueueing(false);
    };

    const handleCooldown = (response: { until: number }) => {
      const remainingSeconds = Math.ceil((response.until - Date.now()) / 1000);
      Alert.alert("Cooldown", `You are on cooldown. Try again in ${remainingSeconds} seconds.`);
      setIsJoiningTournament(false);
      setIsTournamentQueueing(false);
    };

    const handleQueueMatched = (response: {
      opponent: { userId: string; name: string };
      variant: string;
      subvariant?: string;
      sessionId: string;
      gameState: GameState;
      tournamentMatch?: boolean;
    }) => {
      console.log("Received match found response:", response);
      setOpponent(response.opponent.name);
      setGameState(response.gameState);
      setMatchedVariant(response.variant);
      setMatchedSubvariant(response.subvariant || null);
      setTimer(0);

      const matchType = response.tournamentMatch ? "Tournament Match!" : "Match Found!";
      Alert.alert(matchType, `You've been matched in ${response.variant} ${response.subvariant || ''} with ${response.opponent.name}!`);

      // Give a short delay to show the match found alert before transitioning
      setTimeout(() => {
        setIsMatchFound(true);
        setLoading(true);

        // --- Crucial: Clean up ONLY this component's specific listeners ---
        socket.off("tournament:active_details", handleActiveDetails);
        socket.off("tournament:new_active", handleNewActive);
        socket.off("tournament:joined", handleTournamentJoined);
        socket.off("tournament:left", handleTournamentLeft);
        socket.off("tournament:error", handleTournamentError);
        socket.off("queue:cooldown", handleCooldown);
        socket.off("queue:matched", handleQueueMatched); // Remove this listener too

        // Disconnect the current socket, as a new `gameSocket` will be created.
        // This ensures a clean slate for the game session.
        console.log("Disconnecting lobby socket for game transition...");
        socket.disconnect();
        console.log("Lobby socket disconnected.");

        // Get new game socket instance with session ID and variant details
        const sessionId = response.sessionId;
        const gameSocketInstance = getSocket(userId, "game", sessionId, response.variant, response.subvariant);

        if (!gameSocketInstance) {
          console.error("Failed to get game socket instance");
          Alert.alert("Failed to connect to game. Please try again.");
          setLoading(false);
          // Consider re-joining tournament queue or showing an error state here
          return;
        }
        setGameSocket(gameSocketInstance);
        console.log("Connected to game socket for session:", sessionId);
        setLoading(false);
      }, 2000); // 2 seconds to show the alert
    };

    // Attach all listeners
    socket.on("tournament:active_details", handleActiveDetails);
    socket.on("tournament:new_active", handleNewActive);
    socket.on("tournament:joined", handleTournamentJoined);
    socket.on("tournament:left", handleTournamentLeft);
    socket.on("tournament:error", handleTournamentError);
    socket.on("queue:cooldown", handleCooldown);
    socket.on("queue:matched", handleQueueMatched); // This listens for *any* match

    // Cleanup function for this useEffect
    return () => {
      // Remove all listeners when component unmounts or dependencies change
      if (socket && socket.connected) {
        socket.off("tournament:active_details", handleActiveDetails);
        socket.off("tournament:new_active", handleNewActive);
        socket.off("tournament:joined", handleTournamentJoined);
        socket.off("tournament:left", handleTournamentLeft);
        socket.off("tournament:error", handleTournamentError);
        socket.off("queue:cooldown", handleCooldown);
        socket.off("queue:matched", handleQueueMatched);
      }
    };
  }, [socket, userId]); // Dependencies: socket and userId

  // --- Matchmaking Timer Effect ---
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);

    if (!isTournamentQueueing || opponent || isMatchFound) {
      clearInterval(interval); // Clear any lingering interval if state changes
      return;
    }

    if (timer > 60 && timer % 30 === 0) {
      Alert.alert(
        "Still Searching...",
        `No opponent found in ${timer} seconds. Do you want to continue waiting or leave the tournament?`,
        [
          { text: "Continue Waiting", style: "cancel" },
          { text: "Leave Tournament", onPress: () => handleLeaveTournament() }
        ]
      );
    }

    return () => clearInterval(interval);
  }, [timer, opponent, isMatchFound, isTournamentQueueing]); // Dependencies for timer

  // --- Handlers ---
  const handleJoinTournament = useCallback(() => {
    if (!socket || !userId) {
      Alert.alert("Error", "Not connected to server or user not identified.");
      return;
    }
    if (activeTournament && activeTournament.status !== 'open') {
      Alert.alert("Tournament Closed", "Tournament registration is closed.");
      return;
    }
    if (activeTournament && activeTournament.participantsCount >= activeTournament.capacity) {
        Alert.alert("Tournament Full", "This tournament has reached its maximum capacity.");
        return;
    }
    setIsJoiningTournament(true);
    socket.emit("tournament:join", { userId });
  }, [socket, userId, activeTournament]); // Dependencies for useCallback

  const handleLeaveTournament = useCallback(() => {
    if (!socket || !userId) {
      Alert.alert("Error", "Not connected to server or user not identified.");
      return;
    }
    // Reset states immediately for responsive UI
    setIsJoiningTournament(false);
    setIsTournamentQueueing(false);
    setOpponent(null);
    setTimer(0);
    setGameState(null); // Clear game state
    setIsMatchFound(false); // Clear match found status
    setLoading(false); // Clear loading state
    setMatchedVariant(null); // Clear matched variant
    setMatchedSubvariant(null); // Clear matched subvariant

    // Emit the leave event
    socket.emit("tournament:leave", { userId });
  }, [socket, userId]); // Dependencies for useCallback

  // Render the appropriate game component
  if (isMatchFound && gameState && gameSocket && matchedVariant) {
    switch (matchedVariant) {
      case "classic":
        return <ChessGame initialGameState={gameState} userId={userId}  />;
      case "decay":
        return <DecayChessGame initialGameState={gameState} userId={userId}  />;
      case "sixpointer":
        return <SixPointChessGame initialGameState={gameState} userId={userId} />;
      case "crazyhouse":
        return <CrazyHouse initialGameState={gameState} userId={userId}  />;
      default:
        return (
          <Text style={styles.errorText}>
            Unsupported variant: {matchedVariant}
          </Text>
        );
    }
  } else if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00A862" />
        <Text style={styles.infoText}>
          Waiting for match to be established...
        </Text>
      </View>
    );
  }

  // Tournament Lobby UI
  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Tournament Lobby</Text>

      {activeTournament ? (
        <View style={styles.tournamentCard}>
          <Text style={styles.tournamentName}>{activeTournament.name}</Text>
          <Text style={styles.tournamentDetail}>Participants: {activeTournament.participantsCount}/{activeTournament.capacity}</Text>
          <Text style={styles.tournamentDetail}>Entry Fee: ₹{activeTournament.entryFee}</Text>
          <Text style={styles.tournamentDetail}>Prize Pool: ₹{activeTournament.prizePool}</Text>
          <Text style={styles.tournamentDetail}>Status: {activeTournament.status.toUpperCase()}</Text>
          <Text style={styles.tournamentDetail}>Starts: {new Date(activeTournament.startTime).toLocaleString()}</Text>

          {isTournamentQueueing ? (
            <View style={styles.matchmakingContainer}>
              <Text style={styles.matchmakingText}>Searching for next game...</Text>
              <ActivityIndicator size="small" color="#00A862" style={{ marginVertical: 10 }} />
              <Text style={styles.matchmakingTimer}>Time in queue: {timer}s</Text>
              {opponent && !isMatchFound && (
                <Text style={styles.matchFoundText}>Match Found with {opponent}!</Text>
              )}
              <TouchableOpacity
                style={[styles.button, styles.leaveButton]}
                onPress={handleLeaveTournament}
                disabled={isJoiningTournament}
              >
                <Text style={styles.buttonText}>Leave Tournament</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.button}
              onPress={handleJoinTournament}
              disabled={isJoiningTournament || (activeTournament.status !== 'open') || (activeTournament.participantsCount >= activeTournament.capacity)}
            >
              {isJoiningTournament ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Join Tournament</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.noTournamentContainer}>
          <Text style={styles.infoText}>No active tournaments found. Click "Join Tournament" to start one!</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={handleJoinTournament}
            disabled={isJoiningTournament}
          >
            {isJoiningTournament ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Join Tournament</Text>
            )}
          </TouchableOpacity>
          <ActivityIndicator size="large" color="#00A862" style={{ marginTop: 20 }}/>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#23272A",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  headerText: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 40,
  },
  tournamentCard: {
    backgroundColor: "#2C2F33",
    borderRadius: 15,
    padding: 25,
    width: "90%",
    maxWidth: 400,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  tournamentName: {
    color: "#00A862",
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  tournamentDetail: {
    color: "#b0b3b8",
    fontSize: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#00A862",
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 10,
    marginTop: 20,
    width: "80%",
    alignItems: "center",
  },
  leaveButton: {
    backgroundColor: "#DC3545",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  matchmakingContainer: {
    marginTop: 20,
    alignItems: "center",
    width: "100%",
    padding: 15,
    backgroundColor: "#36393F",
    borderRadius: 10,
  },
  matchmakingText: {
    color: "#fff",
    fontSize: 18,
    marginBottom: 10,
  },
  matchmakingTimer: {
    color: "#b0b3b8",
    fontSize: 16,
    marginTop: 5,
  },
  matchFoundText: {
    color: "#00A862",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 15,
  },
  noTournamentContainer: {
    alignItems: "center",
    marginTop: 50,
  },
  infoText: {
    color: "#b0b3b8",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
  },
  subInfoText: {
    color: "#72767D",
    fontSize: 14,
    textAlign: "center",
  },
  errorText: {
    color: "#fff",
    fontSize: 20,
    textAlign: "center",
  },
});