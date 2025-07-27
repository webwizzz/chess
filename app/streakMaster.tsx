import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Socket } from "socket.io-client";
import { getSocket } from "../utils/socketManager";
import ChessGame from "./chessboards/classic";
import CrazyHouseChessGame from "./chessboards/crazyHouse";
import DecayChessGame from "./chessboards/Decay";
import SixPointerChessGame from "./chessboards/SixPointer";

interface StreakMasterProps {
  userId?: string;
}

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

export default function StreakMasterScreen({ userId }: StreakMasterProps) {
  const router = useRouter();
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [tournamentSocket, setTournamentSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isMatchFound, setIsMatchFound] = useState(false);
  const [gameSocket, setGameSocket] = useState<Socket | null>(null);
  const [matchedVariant, setMatchedVariant] = useState<string | null>(null);
  const [matchedSubvariant, setMatchedSubvariant] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [tournamentStatus, setTournamentStatus] = useState<'idle' | 'joining' | 'queuing' | 'matched'>('idle');
  const [isJoiningTournament, setIsJoiningTournament] = useState(false);
  const [isTournamentQueueing, setIsTournamentQueueing] = useState(false);
  const [activeButton, setActiveButton] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => prev + 1)
    }, 1000)

    if (!isTournamentQueueing || opponent || isMatchFound) {
      clearInterval(interval)
      return
    }

    return () => clearInterval(interval)
  }, [timer, opponent, isMatchFound, isTournamentQueueing])

  const handlePlayNow = useCallback(async () => {
    try {
      if (!userId) {
        Alert.alert("Error", "User not identified.")
        return
      }

      setActiveButton("tournament")
      setIsConnecting(true)
      setTournamentStatus('joining')

      const tournamentSocketInstance = getSocket(userId, "matchmaking")
      if (!tournamentSocketInstance) {
        throw new Error("Failed to connect to matchmaking server")
      }

      tournamentSocketInstance.onAny((event: string, ...args: any[]) => {
        console.log("[STREAK] Socket event:", event, args)
      })

      tournamentSocketInstance.on("queue:matched", async (response: {
        opponent: { userId: string; name: string }
        variant: string
        subvariant?: string
        sessionId: string
        gameState: GameState
      }) => {
        console.log("[STREAK] Match found:", response)
        setTournamentStatus('matched')
        
        tournamentSocketInstance.disconnect()
        setTournamentSocket(null)
        
        const gameSocketInstance = getSocket(
          userId,
          "game",
          response.sessionId,
          response.variant,
          response.subvariant
        )

        if (!gameSocketInstance) {
          Alert.alert("Error", "Failed to connect to game server")
          return
        }

        setGameSocket(gameSocketInstance)
        setGameState(response.gameState)
        setMatchedVariant(response.variant)
        setMatchedSubvariant(response.subvariant || null)
        setIsMatchFound(true)
        setOpponent(response.opponent.name)
      })

      setTournamentSocket(tournamentSocketInstance)

      // Join tournament
      tournamentSocketInstance.emit("tournament:join")

      setTimeout(() => {
        if (isConnecting) {
          setIsConnecting(false)
          setActiveButton(null)
          if (tournamentSocketInstance.connected) {
            tournamentSocketInstance.disconnect()
          }
          setTournamentSocket(null)
          setTournamentStatus('idle')
          Alert.alert("Connection Timeout", "Failed to join tournament. Please try again.")
        }
      }, 10000)

    } catch (error) {
      console.error("[STREAK] Error:", error)
      setIsConnecting(false)
      setActiveButton(null)
      setTournamentStatus('idle')
      Alert.alert("Error", "Failed to start matchmaking. Please try again.")
    }
  }, [userId])

  if (isMatchFound && gameState && gameSocket && matchedVariant && userId) {
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
  } 

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Back button and wallet */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <View style={styles.wallet}>
            <Text style={styles.walletText}>₹1.00</Text>
          </View>
        </View>

        {/* Victory Rush Card */}
        <View style={styles.victoryRushCard}>
          <View style={styles.victoryRushContent}>
            <Image 
              source={require("../assets/tl.png")} 
              style={styles.victoryRushLogo}
              resizeMode="contain"
            />
            <Text style={styles.subtitle}>Rack up wins.</Text>
            <Text style={styles.motivationText}>Keep your streak alive!</Text>

            <View style={styles.progressBar}>
              <View style={styles.progressFill} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.spotsLeft}>103 spots left</Text>
              <Text style={styles.totalSpots}>240 spots</Text>
            </View>
          </View>
        </View>

        {/* How to Win Section */}
        <View style={styles.rulesContainer}>
          <Text style={styles.rulesTitle}>How to win</Text>
          <View style={styles.rulesList}>
            <Text style={styles.ruleText}>• Win or draw games without losing to form a streak</Text>
            <Text style={styles.ruleText}>• The more games you go unbeaten, the longer your streak</Text>
            <Text style={styles.ruleText}>• The number of games in your unbeaten streak will be your score in the leaderboard</Text>
            <Text style={styles.ruleText}>• Your score will be frozen when you lose a game. But don't worry, we will give you another chance if you lose your first game</Text>
            <Text style={styles.ruleText}>• You should win atleast one game to be eligible for prize money</Text>
          </View>
        </View>
        
        {/* Add padding at the bottom to account for fixed button */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Fixed Play Now Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity 
          style={[styles.playButton, isConnecting && styles.playButtonDisabled]}
          onPress={handlePlayNow}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <Text style={styles.playButtonText}>Play Now</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.timerText}>TOURNAMENT ENDS IN : 6h 16m</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  wallet: {
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  walletText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  victoryRushCard: {
    backgroundColor: "#69923e",
    borderRadius: 16,
    marginBottom: 20,
    marginHorizontal: 16,
    marginTop: 100,
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
    top: -100,
    zIndex: 1,
  },

  subtitle: {
    color: "#FFF5E1",
    fontSize: 18,
    marginBottom: 20,
    paddingTop: 90,
    opacity: 0.9,
  },



  progressBar: {
    width: '90%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    width: '43%',
    height: '100%',
    backgroundColor: '#00FF00',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '90%',
  },
  spotsLeft: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  totalSpots: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  rulesContainer: {
    padding: 16,
  },
  rulesTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
  },
  rulesList: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 16,
  },
  ruleText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 12,
    lineHeight: 22,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  bottomPadding: {
    height: 100, // Height to account for fixed bottom container
  },
  motivationText: {
    color: '#FFF5E1',
    fontSize: 16,
    opacity: 0.8,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  playButton: {
    backgroundColor: '#FFD700',
    width: '100%',
    padding: 16,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 8,
  },
  playButtonText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  timerText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 8,
  },
  playButtonDisabled: {
    opacity: 0.7,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 12,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  infoText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
  },
});
