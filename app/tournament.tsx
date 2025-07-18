import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
    fen: string;
    position: string;
    activeColor: "white" | "black";
    castlingRights: string;
    enPassantSquare: string;
    halfmoveClock: number;
    fullmoveNumber: number;
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


  // Effect for socket initialization and cleanup
  useEffect(() => {
    const existingSocket = getSocketInstance();
    if (existingSocket) {
      setSocket(existingSocket);
      console.log("Using existing socket instance for tournament screen");
      existingSocket.onAny((event: string, ...args: any[]) => {
        console.log("[SOCKET EVENT - TOURNAMENT]", event, args);
      });
      
      // Immediately request active tournament details when socket is ready
      // This ensures the display updates quickly upon navigating to this screen.
      // Make sure userId is available here if tournament:get_active needs it as payload.
      // (However, typically tournament:get_active would just rely on socket ID for auth)
      // socket.emit("tournament:get_active"); // Moved this line here
      // No, keep it in the second useEffect as it depends on `socket` state which is set here.
      // The dependency array of the second useEffect will handle this.

    } else {
      Alert.alert("Connection Error", "Failed to connect to the server.");
      router.replace("/choose"); // Redirect if no socket
    }

    return () => {
      // Clean up listeners when component unmounts
      if (existingSocket) {
        existingSocket.off("tournament:active_details");
        existingSocket.off("tournament:joined");
        existingSocket.off("tournament:left");
        existingSocket.off("tournament:error");
        existingSocket.off("queue:matched");
        existingSocket.off("tournament:new_active");
        existingSocket.off("queue:cooldown");
      }
    };
  }, []); // Empty dependency array, runs once on mount

  // Effect for socket listeners and initial active tournament fetch
  useEffect(() => {
    if (!socket || !userId) { // Ensure socket and userId are available
        console.log("Socket or userId not available for tournament listeners setup.");
        return;
    }

    socket.emit("tournament:join", {userId})

    // --- Tournament Specific Listeners ---
    socket.on("tournament:active_details", (response: { tournament: TournamentDetails | null }) => {
      console.log("Active tournament details:", response.tournament);
      // Backend sometimes sends as an array, sometimes as object. Adjust for robust handling.
      setActiveTournament(response.tournament);
      setIsJoiningTournament(false);
    });

    socket.on("tournament:new_active", (response: { tournamentId: string, name: string }) => {
      Alert.alert("New Tournament!", `A new tournament "${response.name}" (${response.tournamentId}) has started!`);
      // Re-fetch active tournament details
      socket.emit("tournament:get_active");
    });

    socket.on("tournament:joined", (response: { tournament: TournamentDetails }) => {
      console.log("Joined tournament:", response.tournament);
      setActiveTournament(response.tournament);
      setIsJoiningTournament(false);
      setIsTournamentQueueing(true); // User is now in the tournament matchmaking queue
      setTimer(0); // Start matchmaking timer
    });

    socket.on("tournament:left", (response: { message: string }) => {
      Alert.alert("Tournament Status", response.message);
      setActiveTournament(null);
      setIsTournamentQueueing(false);
      setOpponent(null);
      setTimer(0);
    });

    socket.on("tournament:error", (response: { message: string; error?: any }) => {
      console.error("Tournament error:", response);
      Alert.alert("Tournament Error", response.message + (response.error ? `: ${response.error}` : ''));
      setIsJoiningTournament(false);
      setIsTournamentQueueing(false);
    });

    socket.on("queue:cooldown", (response: { until: number }) => {
      const remainingSeconds = Math.ceil((response.until - Date.now()) / 1000);
      Alert.alert("Cooldown", `You are on cooldown. Try again in ${remainingSeconds} seconds.`);
      setIsJoiningTournament(false);
      setIsTournamentQueueing(false);
    });

    // --- Matchmaking Listener (shared with regular queue) ---
    // This listener will now also handle matches originating from the tournament queue.
    socket.on("queue:matched", (response: {
      opponent: { userId: string; name: string };
      variant: string;
      subvariant?: string;
      sessionId: string;
      gameState: GameState;
      tournamentMatch?: boolean; // New flag
    }) => {
      console.log("Received match found response:", response);
      setOpponent(response.opponent.name);
      setGameState(response.gameState);
      setMatchedVariant(response.variant); // Store the assigned variant
      setMatchedSubvariant(response.subvariant || null); // Store assigned subvariant
      setTimer(0); // Reset timer when match is found

      if (response.tournamentMatch) {
        Alert.alert("Tournament Match!", `You've been matched in ${response.variant} ${response.subvariant || ''} with ${response.opponent.name}!`);
      } else {
        Alert.alert("Match Found!", `You've been matched in ${response.variant} ${response.subvariant || ''} with ${response.opponent.name}!`);
      }

      // Switch from matchmaking to game mode
      setTimeout(() => {
        setIsMatchFound(true);
        setLoading(true);

        // Clean up matchmaking listeners relevant to this screen
        // IMPORTANT: Do NOT disconnect the socket here if you want to keep tournament session
        // Instead, the backend should handle removing from queue and setting status.
        // We just need to stop listening for new queue:matched events after game starts.
        socket.off("queue:matched");
        socket.off("tournament:joined"); // No longer need this after joining and being matched
        socket.off("tournament:error"); // Game socket will handle errors for game

        // Get game socket instance
        const sessionId = response.sessionId;
        console.log("Match found! Session ID:", sessionId);
        // Pass the assigned variant and subvariant to the game socket
        // Ensure getSocket can use the main socket's userId if needed, or pass it explicitly.
        // (Assuming getSocket internally handles connection if already connected)
        const gameSocketInstance = getSocket(userId, "game", sessionId, response.variant, response.subvariant);
        if (!gameSocketInstance) {
          console.error("Failed to get game socket instance");
          Alert.alert("Failed to connect to game. Please try again.");
          setLoading(false);
          // Consider re-joining tournament queue if game connection fails
          return;
        }
        setGameSocket(gameSocketInstance);
        console.log("Connected to game socket for session:", sessionId);
        setLoading(false);
      }, 2000); // Show "Match Found!" for 2 seconds before transitioning
    });

    // Initial fetch for active tournament details
    socket.emit("tournament:get_active");

  }, [socket, userId]); // Dependency array, runs when socket or userId changes

  // Matchmaking timer for tournament queue
  useEffect(() => {
    if (!isTournamentQueueing || opponent || isMatchFound) return;

    const interval = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);

    // Optional: If no opponent found after a long time, consider giving option to leave
    if (timer > 60 && timer % 30 === 0) { // Every 30 seconds after first minute
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
  }, [timer, opponent, isMatchFound, isTournamentQueueing]);


  const handleJoinTournament = () => {
    if (!socket || !userId) {
      Alert.alert("Error", "Not connected to server or user not identified.");
      return;
    }
    if (!activeTournament) {
        Alert.alert("No Tournament", "No active tournament available to join.");
        return;
    }
    if (activeTournament.status !== 'open') {
        Alert.alert("Tournament Closed", "Tournament registration is closed.");
        return;
    }
    setIsJoiningTournament(true);
    // CRITICAL FIX: Emit userId with the tournament:join event
    socket.emit("tournament:join", { userId });
  };

  const handleLeaveTournament = () => {
    if (!socket || !userId) {
      Alert.alert("Error", "Not connected to server or user not identified.");
      return;
    }
    setIsJoiningTournament(false); // Reset state
    setIsTournamentQueueing(false); // Reset queueing state
    setOpponent(null); // Reset opponent
    setTimer(0); // Reset timer
    socket.emit("tournament:leave", { userId }); // Emit userId for leave as well
  };

  // Render the appropriate game component based on the matched variant
  if (isMatchFound && gameState && gameSocket && matchedVariant) {
    switch (matchedVariant) {
      case "classic":
        return (
          <ChessGame
            initialGameState={gameState}
            userId={userId}
          />
        );
      case "decay":
        return (
          <DecayChessGame
            initialGameState={gameState}
            userId={userId}
          />
        );
      case "sixpointer":
        return (
          <SixPointChessGame
            initialGameState={gameState}
            userId={userId}
          />
        );
      case "crazyhouse":
        return (
          <CrazyHouse
            initialGameState={gameState}
            userId={userId}
          />
        );
      default:
        return (
          <Text style={styles.errorText}>
            Unsupported variant: {matchedVariant}
          </Text>
        );
    }
  } else if (loading) {
    // Show loading spinner while waiting for match to be established
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
              disabled={isJoiningTournament || activeTournament.status !== 'open' || activeTournament.participantsCount >= activeTournament.capacity}
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
          <Text style={styles.infoText}>No active tournaments found.</Text>
          <Text style={styles.subInfoText}>Stay tuned for upcoming events!</Text>
          <ActivityIndicator size="large" color="#00A862" style={{ marginTop: 20 }}/>
        </View>
      )}

      {/* For admin to create tournament (optional, add proper authorization) */}
      {/* <TouchableOpacity
        style={[styles.button, { marginTop: 20 }]}
        onPress={() => Alert.alert('Admin', 'Implement admin tournament creation here')}
      >
        <Text style={styles.buttonText}>Create New Tournament (Admin)</Text>
      </TouchableOpacity> */}

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
    backgroundColor: "#DC3545", // Red for leave
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