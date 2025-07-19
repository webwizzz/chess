import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
} from "react-native";
import { Socket } from "socket.io-client";
import { getSocket, getSocketInstance } from "../utils/socketManager";
import ChessGame from "./ChessGame";
import DecayChessGame from "./Decay";
import SixPointChessGame from "./SixPointer";
import CrazyHouse from "./crazyHouse";
import Svg, { Path } from 'react-native-svg';

// Re-use the GameState interface or import it if defined in a shared file
interface GameState {
  sessionId: string;
  variantName: string;
  subvariantName?: string;
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
  const [timer, setTimer] = useState(0);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isMatchFound, setIsMatchFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gameSocket, setGameSocket] = useState<Socket | null>(null);
  const [matchedVariant, setMatchedVariant] = useState<string | null>(null);
  const [matchedSubvariant, setMatchedSubvariant] = useState<string | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [selectedRulesTitle, setSelectedRulesTitle] = useState("");
  const [selectedRulesContent, setSelectedRulesContent] = useState("");

  // Tournament options data
  const tournamentOptions = [
    {
      title: "Leaderboard",
      description: "View tournament rankings and top players",
      action: "leaderboard",
      rules: "Tournament leaderboard shows player rankings based on their performance in tournaments. Points are awarded based on placement: 1st place gets 100 points, 2nd gets 75 points, 3rd gets 50 points, and participation gives 10 points."
    },
    {
      title: "Active Tournament",
      description: activeTournament ? `${activeTournament.name} - ${activeTournament.participantsCount}/${activeTournament.capacity} players` : "Join the current active tournament",
      action: "tournament",
      rules: activeTournament ? `Tournament: ${activeTournament.name}\nEntry Fee: ₹${activeTournament.entryFee}\nPrize Pool: ₹${activeTournament.prizePool}\nCapacity: ${activeTournament.capacity} players\nStatus: ${activeTournament.status.toUpperCase()}` : "No active tournament available. Join to create or participate in tournaments."
    },
    {
      title: "Rules & Terms",
      description: "Tournament rules and terms of service",
      action: "rules",
      rules: "Tournament Rules:\n\n1. Fair Play: No cheating or external assistance allowed\n2. Time Control: Standard tournament time controls apply\n3. Conduct: Respectful behavior required at all times\n4. Entry Fees: Non-refundable once tournament starts\n5. Prizes: Distributed based on final standings\n6. Disputes: Contact support for any issues\n\nTerms of Service:\n- Players must be 13+ years old\n- Account suspension for rule violations\n- Prize distribution within 24 hours of tournament completion"
    }
  ];

  // Custom Info Icon Component
  const InfoIcon = () => (
    <Svg width="24" height="24" viewBox="0 0 100 100">
      <Path
        d="M 30.306641 17.960938 C 23.138641 17.960938 17.306641 23.792938 17.306641 30.960938 L 17.306641 69.960938 C 17.306641 77.128938 23.138641 82.960938 30.306641 82.960938 L 69.306641 82.960938 C 76.474641 82.960938 82.306641 77.128938 82.306641 69.960938 L 82.306641 30.960938 C 82.306641 23.791938 76.475641 17.960938 69.306641 17.960938 L 30.306641 17.960938 z M 30.306641 19.960938 L 69.306641 19.960938 C 75.371641 19.960938 80.306641 24.895937 80.306641 30.960938 L 80.306641 69.960938 C 80.306641 76.025937 75.371641 80.960938 69.306641 80.960938 L 30.306641 80.960938 C 24.241641 80.960938 19.306641 76.025937 19.306641 69.960938 L 19.306641 30.960938 C 19.306641 24.895937 24.241641 19.960938 30.306641 19.960938 z M 33.144531 22.960938 C 27.168531 22.960938 22.306641 27.822828 22.306641 33.798828 L 22.306641 67.123047 C 22.306641 73.099047 27.168531 77.960938 33.144531 77.960938 L 66.470703 77.960938 C 72.446703 77.960938 77.306641 73.099047 77.306641 67.123047 L 77.306641 48.460938 C 77.306641 48.183937 77.082641 47.960938 76.806641 47.960938 C 76.530641 47.960938 76.306641 48.184937 76.306641 48.460938 L 76.306641 67.123047 C 76.306641 72.547047 71.894703 76.960938 66.470703 76.960938 L 33.144531 76.960938 C 27.720531 76.960938 23.306641 72.547047 23.306641 67.123047 L 23.306641 33.798828 C 23.306641 28.374828 27.720531 23.960937 33.144531 23.960938 L 66.806641 23.960938 C 67.082641 23.960938 67.306641 23.736937 67.306641 23.460938 C 67.306641 23.184938 67.082641 22.960937 66.806641 22.960938 L 33.144531 22.960938 z M 50.128906 32.591797 C 48.861906 32.591797 47.751219 33.005266 46.824219 33.822266 C 45.881219 34.655266 45.402344 35.700734 45.402344 36.927734 C 45.402344 37.544734 45.534875 38.128156 45.796875 38.660156 C 46.050875 39.179156 46.393406 39.638344 46.816406 40.027344 C 47.236406 40.413344 47.733016 40.726031 48.291016 40.957031 C 48.856016 41.192031 49.474906 41.310547 50.128906 41.310547 C 51.434906 41.310547 52.551266 40.877484 53.447266 40.021484 C 54.348266 39.158484 54.804687 38.117734 54.804688 36.927734 C 54.804688 35.733734 54.336062 34.699562 53.414062 33.851562 C 52.503062 33.015563 51.398906 32.591797 50.128906 32.591797 z M 50.130859 33.591797 C 51.156859 33.591797 52.008281 33.918844 52.738281 34.589844 C 53.456281 35.249844 53.806641 36.014688 53.806641 36.929688 C 53.806641 37.848687 53.463812 38.624781 52.757812 39.300781 C 52.044812 39.982781 51.184859 40.3125 50.130859 40.3125 C 49.608859 40.3125 49.117828 40.220156 48.673828 40.035156 C 48.223828 39.848156 47.827141 39.599922 47.494141 39.294922 C 47.163141 38.990922 46.894312 38.630656 46.695312 38.222656 C 46.502313 37.826656 46.402344 37.391687 46.402344 36.929688 C 46.402344 35.988687 46.756328 35.216266 47.486328 34.572266 C 48.234328 33.911266 49.099859 33.591797 50.130859 33.591797 z M 76.806641 36.960938 C 76.530641 36.960938 76.306641 37.183937 76.306641 37.460938 L 76.306641 39.460938 C 76.306641 39.736938 76.530641 39.960938 76.806641 39.960938 C 77.082641 39.960938 77.306641 39.736937 77.306641 39.460938 L 76.306641 37.460938 C 77.306641 37.184937 77.082641 36.960938 76.806641 36.960938 z M 76.806641 40.960938 C 76.530641 40.960938 76.306641 41.184938 76.306641 41.460938 L 76.306641 45.460938 C 76.306641 45.736938 76.530641 45.960937 76.806641 45.960938 C 77.082641 45.960938 77.306641 45.736938 77.306641 45.460938 L 77.306641 41.460938 C 77.306641 41.183937 77.082641 40.960938 76.806641 40.960938 z M 42.757812 44.013672 C 42.481812 44.013672 42.257813 44.237672 42.257812 44.513672 L 42.257812 47.087891 C 42.257812 47.363891 42.481812 47.587891 42.757812 47.587891 C 46.390813 47.587891 46.390625 48.797313 46.390625 49.195312 L 46.390625 62.919922 C 46.390625 63.328922 46.390812 64.419922 42.757812 64.419922 C 42.481812 64.419922 42.257813 64.643922 42.257812 64.919922 L 42.257812 67.492188 C 42.257812 67.768187 42.481812 67.992188 42.757812 67.992188 L 57.765625 67.992188 C 58.041625 67.992188 58.265625 67.768187 58.265625 67.492188 L 58.265625 64.919922 C 58.265625 64.643922 58.041625 64.419922 57.765625 64.419922 C 56.038625 64.419922 54.931656 64.173406 54.472656 63.691406 C 54.282656 63.491406 54.20175 63.243156 54.21875 62.910156 L 54.21875 62.886719 L 54.21875 44.513672 C 54.21875 44.237672 53.99475 44.013672 53.71875 44.013672 L 42.757812 44.013672 z M 43.257812 45.013672 L 53.216797 45.013672 L 53.216797 62.876953 C 53.189797 63.479953 53.367094 63.985813 53.746094 64.382812 C 54.364094 65.031813 55.488625 65.361109 57.265625 65.412109 L 57.265625 66.992188 L 43.257812 66.992188 L 43.257812 65.414062 C 44.685812 65.383062 47.390625 65.121922 47.390625 62.919922 L 47.390625 49.195312 C 47.390625 47.560313 46.000812 46.687703 43.257812 46.595703 L 43.257812 45.013672 z"
        fill="#00A862"
      />
    </Svg>
  );

  // --- Socket Initialization and Cleanup ---
  useEffect(() => {
    const existingSocket = getSocketInstance();
    if (existingSocket) {
      setSocket(existingSocket);
      console.log("Using existing socket instance for tournament screen");
      existingSocket.onAny((event: string, ...args: any[]) => {
        console.log("[SOCKET EVENT - TOURNAMENT SCREEN]", event, args);
      });
    } else {
      Alert.alert("Connection Error", "Failed to connect to the server.");
      router.replace("/choose");
    }

    return () => {
      if (existingSocket && existingSocket.connected && !isMatchFound) {
        existingSocket.off("tournament:active_details");
        existingSocket.off("tournament:joined");
        existingSocket.off("tournament:left");
        existingSocket.off("tournament:error");
        existingSocket.off("queue:matched");
        existingSocket.off("tournament:new_active");
        existingSocket.off("queue:cooldown");
      }
    };
  }, [isMatchFound, router]);

  // --- Tournament & Matchmaking Listeners ---
  useEffect(() => {
    if (!socket || !userId) {
      console.log("Socket or userId not available for tournament listeners setup.");
      return;
    }

    socket.emit("tournament:get_active");

    const handleActiveDetails = (response: { tournament: TournamentDetails | null }) => {
      console.log("Active tournament details:", response.tournament);
      setActiveTournament(response.tournament);
      setIsJoiningTournament(false);
    };

    const handleNewActive = (response: { tournamentId: string, name: string }) => {
      Alert.alert("New Tournament!", `A new tournament "${response.name}" (${response.tournamentId}) has started!`);
      socket.emit("tournament:get_active");
    };

    const handleTournamentJoined = (response: { tournament: TournamentDetails }) => {
      console.log("Joined tournament:", response.tournament);
      setActiveTournament(response.tournament);
      setIsJoiningTournament(false);
      setIsTournamentQueueing(true);
      setTimer(0);
    };

    const handleTournamentLeft = (response: { message: string }) => {
      Alert.alert("Tournament Status", response.message);
      setActiveTournament(null);
      setIsTournamentQueueing(false);
      setOpponent(null);
      setTimer(0);
      setIsJoiningTournament(false);
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

      setTimeout(() => {
        setIsMatchFound(true);
        setLoading(true);

        socket.off("tournament:active_details", handleActiveDetails);
        socket.off("tournament:new_active", handleNewActive);
        socket.off("tournament:joined", handleTournamentJoined);
        socket.off("tournament:left", handleTournamentLeft);
        socket.off("tournament:error", handleTournamentError);
        socket.off("queue:cooldown", handleCooldown);
        socket.off("queue:matched", handleQueueMatched);

        console.log("Disconnecting lobby socket for game transition...");
        socket.disconnect();
        console.log("Lobby socket disconnected.");

        const sessionId = response.sessionId;
        const gameSocketInstance = getSocket(userId, "game", sessionId, response.variant, response.subvariant);
        if (!gameSocketInstance) {
          console.error("Failed to get game socket instance");
          Alert.alert("Failed to connect to game. Please try again.");
          setLoading(false);
          return;
        }
        setGameSocket(gameSocketInstance);
        console.log("Connected to game socket for session:", sessionId);
        setLoading(false);
      }, 2000);
    };

    socket.on("tournament:active_details", handleActiveDetails);
    socket.on("tournament:new_active", handleNewActive);
    socket.on("tournament:joined", handleTournamentJoined);
    socket.on("tournament:left", handleTournamentLeft);
    socket.on("tournament:error", handleTournamentError);
    socket.on("queue:cooldown", handleCooldown);
    socket.on("queue:matched", handleQueueMatched);

    return () => {
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
  }, [socket, userId]);

  // --- Matchmaking Timer Effect ---
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);

    if (!isTournamentQueueing || opponent || isMatchFound) {
      clearInterval(interval);
      return;
    }

    if (timer > 60 && timer % 30 === 0) {
      Alert.alert("Still Searching...",
        `No opponent found in ${timer} seconds. Do you want to continue waiting or leave the tournament?`,
        [
          { text: "Continue Waiting", style: "cancel" },
          { text: "Leave Tournament", onPress: () => handleLeaveTournament() }
        ]
      );
    }

    return () => clearInterval(interval);
  }, [timer, opponent, isMatchFound, isTournamentQueueing]);

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
  }, [socket, userId, activeTournament]);

  const handleLeaveTournament = useCallback(() => {
    if (!socket || !userId) {
      Alert.alert("Error", "Not connected to server or user not identified.");
      return;
    }

    setIsJoiningTournament(false);
    setIsTournamentQueueing(false);
    setOpponent(null);
    setTimer(0);
    setGameState(null);
    setIsMatchFound(false);
    setLoading(false);
    setMatchedVariant(null);
    setMatchedSubvariant(null);

    socket.emit("tournament:leave", { userId });
  }, [socket, userId]);

  const handleOptionPress = (action: string) => {
    switch (action) {
      case "leaderboard":
        router.push({ pathname: "/leaderboard" } as any);
        break;
      case "tournament":
        if (isTournamentQueueing) {
          handleLeaveTournament();
        } else {
          handleJoinTournament();
        }
        break;
      case "rules":
        // Rules are handled by info button
        break;
    }
  };

  const handleInfoPress = (option: any) => {
    setSelectedRulesTitle(option.title);
    setSelectedRulesContent(option.rules);
    setShowRulesModal(true);
  };

  const closeRulesModal = () => {
    setShowRulesModal(false);
    setSelectedRulesTitle("");
    setSelectedRulesContent("");
  };

  // Render the appropriate game component
  if (isMatchFound && gameState && gameSocket && matchedVariant) {
    switch (matchedVariant) {
      case "classic":
        return <ChessGame initialGameState={gameState} userId={userId} />;
      case "decay":
        return <DecayChessGame initialGameState={gameState} userId={userId} />;
      case "sixpointer":
        return <SixPointChessGame initialGameState={gameState} userId={userId} />;
      case "crazyhouse":
        return <CrazyHouse initialGameState={gameState} userId={userId} />;
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

  // Tournament Lobby UI with Choose.tsx styling
  return (
    <SafeAreaView style={styles.container}>
      {/* Top Navigation Bar */}
      <View style={styles.topNavBar}>
        <TouchableOpacity style={styles.topNavButton} onPress={() => router.back()}>
          <Text style={styles.topNavButtonText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topNavButton} onPress={() => router.push({ pathname: "/leaderboard" } as any)}>
          <Text style={styles.topNavButtonText}>🏆</Text>
          <Text style={styles.topNavButtonText}>Leaderboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topNavButton}>
          <Text style={styles.topNavButtonText}>✉️</Text>
          <Text style={styles.topNavButtonText}>Help</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* Tournament Header */}
        <View style={styles.tournamentModeContainer}>
          <Text style={styles.tournamentModeTitle}>Tournament</Text>
        </View>

        <Text style={styles.sectionTitle}>Options</Text>

        {/* Tournament Status */}
        {isTournamentQueueing && (
          <View style={styles.matchmakingContainer}>
            <Text style={styles.matchmakingText}>Searching for tournament match...</Text>
            <ActivityIndicator size="small" color="#00A862" style={{ marginVertical: 10 }} />
            <Text style={styles.matchmakingTimer}>Time in queue: {timer}s</Text>
            {opponent && !isMatchFound && (
              <Text style={styles.matchFoundText}>Match Found with {opponent}!</Text>
            )}
          </View>
        )}

        {/* Tournament Options */}
        <View style={styles.optionsColumn}>
          {tournamentOptions.map((option) => (
            <View
              key={option.title}
              style={[
                styles.optionCardNew,
                (option.action === "tournament" && isJoiningTournament) && styles.cardDisabled,
              ]}
            >
              <TouchableOpacity
                style={styles.optionCardContent}
                activeOpacity={0.85}
                onPress={() => handleOptionPress(option.action)}
                disabled={option.action === "tournament" && isJoiningTournament}
              >
                <View>
                  <Text style={styles.optionCardTitleNew}>{option.title}</Text>
                  <Text style={styles.optionCardDescription}>{option.description}</Text>
                  {option.action === "tournament" && isTournamentQueueing && (
                    <Text style={styles.statusText}>Currently in queue - Tap to leave</Text>
                  )}
                  {option.action === "tournament" && isJoiningTournament && (
                    <ActivityIndicator size="small" color="#00A862" style={{ marginTop: 5 }} />
                  )}
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.infoButton}
                onPress={() => handleInfoPress(option)}
              >
                <InfoIcon />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Rules Modal */}
      <Modal
        visible={showRulesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeRulesModal}
      >
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A1A",
  },
  topNavBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "#222222",
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  topNavButton: {
    alignItems: "center",
    paddingHorizontal: 10,
  },
  topNavButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  scrollViewContent: {
    flexGrow: 1,
    padding: 15,
    alignItems: "center",
  },
  tournamentModeContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 30,
    marginTop: 20,
  },
  tournamentModeTitle: {
    fontSize: 42,
    fontWeight: "bold",
    color: "#00A862",
    fontFamily: "Knewave-Regular",
    textAlign: "center",
    textShadowColor: "rgba(0, 168, 98, 0.4)",
    textShadowOffset: { width: 2, height: 3 },
    textShadowRadius: 6,
    letterSpacing: 1,
    transform: [{ rotate: '-1deg' }],
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 15,
    alignSelf: 'flex-start',
    marginLeft: 10,
  },
  matchmakingContainer: {
    marginBottom: 20,
    alignItems: "center",
    backgroundColor: "#222222",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    borderColor: '#444444',
    borderWidth: 1,
  },
  matchmakingText: {
    color: "#FFFFFF",
    fontSize: 18,
    marginBottom: 10,
    textAlign: "center",
  },
  matchmakingTimer: {
    color: "#B0B0B0",
    fontSize: 16,
    marginTop: 5,
  },
  matchFoundText: {
    color: "#00A862",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 15,
    textAlign: "center",
  },
  optionsColumn: {
    flexDirection: 'column',
    width: '100%',
  },
  optionCardNew: {
    backgroundColor: "#222222",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderColor: '#444444',
    borderWidth: 1,
    minHeight: 70,
  },
  optionCardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  optionCardTitleNew: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "left",
    marginBottom: 5,
  },
  optionCardDescription: {
    color: "#B0B0B0",
    fontSize: 14,
    textAlign: "left",
  },
  statusText: {
    color: "#00A862",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 5,
  },
  infoButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0, 168, 98, 0.1)",
    borderWidth: 1,
    borderColor: "#00A862",
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  rulesModal: {
    backgroundColor: "#222222",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    borderColor: "#444444",
    borderWidth: 1,
  },
  rulesTitle: {
    color: "#00A862",
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
    backgroundColor: "#00A862",
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
});