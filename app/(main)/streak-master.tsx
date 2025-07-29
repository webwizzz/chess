import axios from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Socket } from "socket.io-client";

import SixPointerChessGame from '../(game)/variants/six-pointer';
import { ClassicChess, CrazyHouseChess, DecayChess } from '../(game)/variants';
import { getSocket } from '../../utils/socketManager';



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

export default function StreakMasterScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  // Keep exactly the same state variables as tournament.tsx
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
  const [leaderboardData, setLeaderboardData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [matchDetails, setMatchDetails] = useState<{
    variant: string;
    subvariant?: string;
    opponent: string;
  } | null>(null);

  // Timer effect exactly same as tournament.tsx
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
        `No opponent found in ${timer} seconds. Do you want to continue waiting?`,
        [
          { text: "Continue Waiting", style: "cancel" },
          { text: "Leave Queue", onPress: () => handleLeaveTournament() },
        ],
      )
    }

    return () => clearInterval(interval)
  }, [timer, opponent, isMatchFound, isTournamentQueueing])

  // Modified handlePlayNow function
  const handlePlayNow = useCallback(async () => {
    try {
      if (!userId) {
        Alert.alert("Error", "User not identified.")
        return
      }

      setActiveButton("tournament")
      setIsConnecting(true)
      setTournamentStatus('joining')

      // Create tournament socket connection
      const tournamentSocketInstance = getSocket(userId, "matchmaking")
      if (!tournamentSocketInstance) {
        throw new Error("Failed to connect to matchmaking server")
      }

      // Set up tournament event listeners
      tournamentSocketInstance.onAny((event: string, ...args: any[]) => {
        console.log("[STREAK] Socket event:", event, args)
      })

      // Handle tournament join success
      tournamentSocketInstance.on("tournament:joined", (response: { 
        tournament: any,
        status: 'already_joined' | 'newly_joined' 
      }) => {
        console.log("Queue joined:", response)
        setIsJoiningTournament(false)
        setIsTournamentQueueing(true)
        setTournamentStatus('queuing')
        setTimer(0)
        setIsConnecting(false)
        setActiveButton(null)
      })

      // Handle match found
      tournamentSocketInstance.on("queue:matched", async (response: {
        opponent: { userId: string; name: string }
        variant: string
        subvariant?: string
        sessionId: string
        gameState: GameState
      }) => {
        console.log("Match found:", response)
        setTournamentStatus('matched')
        
        // Set match details for display
        setMatchDetails({
          variant: response.variant,
          subvariant: response.subvariant,
          opponent: response.opponent.name
        })
        
        // Show match details for 3 seconds before starting game
        setTimeout(async () => {
          // Disconnect tournament socket
          tournamentSocketInstance.disconnect()
          setTournamentSocket(null)
          
          // Create game socket
          const gameSocketInstance = getSocket(
            userId,
            "game",
            response.sessionId,
            response.variant,
            response.subvariant,
            "tournament" // Keep tournament mode for consistency
          )

          if (!gameSocketInstance) {
            Alert.alert("Error", "Failed to connect to game server")
            return
          }

          // Set up game state
          setGameSocket(gameSocketInstance)
          setGameState(response.gameState)
          setMatchedVariant(response.variant)
          setMatchedSubvariant(response.subvariant || null)
          setIsMatchFound(true)
          setOpponent(response.opponent.name)
          setMatchDetails(null) // Clear match details
        }, 3000) // 3 second delay to show match details
      })

      // Handle errors
      tournamentSocketInstance.on("error", (error: { message: string; error?: any }) => {
        console.error("Matchmaking error:", error)
        Alert.alert("Error", error.message)
        handleLeaveTournament()
      })

      // Store socket reference
      setTournamentSocket(tournamentSocketInstance)

      // Join tournament
      tournamentSocketInstance.emit("tournament:join")

      // Set connection timeout
      setTimeout(() => {
        if (isConnecting) {
          setIsConnecting(false)
          setActiveButton(null)
          if (tournamentSocketInstance.connected) {
            tournamentSocketInstance.disconnect()
          }
          setTournamentSocket(null)
          setTournamentStatus('idle')
          Alert.alert("Connection Timeout", "Failed to join queue. Please try again.")
        }
      }, 10000)

    } catch (error) {
      console.error("Queue join error:", error)
      setIsConnecting(false)
      setActiveButton(null)
      setTournamentStatus('idle')
      Alert.alert("Error", "Failed to start matchmaking. Please try again.")
    }
  }, [userId])

  // Modified handleLeaveTournament function
  const handleLeaveTournament = useCallback(() => {
    if (tournamentSocket) {
      tournamentSocket.emit("tournament:leave")
      tournamentSocket.disconnect()
      setTournamentSocket(null)
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
    setTournamentStatus('idle')
    setActiveButton(null)
    setMatchDetails(null)
  }, [tournamentSocket])

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:3000/api/tournaments');
      const data = response.data;

      if (data.success) {
        setLeaderboardData(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [])

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard])

  // Helper function to format variant name
  const formatVariantName = (variant: string, subvariant?: string) => {
    const variantNames = {
      'classic': 'Classic Chess',
      'decay': 'Decay Chess', 
      'sixpointer': '6-Point Chess',
      'crazyhouse': 'Crazyhouse'
    }
    
    let name = variantNames[variant as keyof typeof variantNames] || variant
    if (subvariant) {
      name += ` (${subvariant})`
    }
    return name
  }

  // Exact same game rendering logic as tournament.tsx
  if (isMatchFound && gameState && gameSocket && matchedVariant && userId) {
    switch (matchedVariant) {
      case "classic":
        return <ClassicChess initialGameState={gameState} userId={userId} />
      case "decay":
        return <DecayChess initialGameState={gameState} userId={userId} />
      case "sixpointer":
        return <SixPointerChessGame initialGameState={gameState} userId={userId} />
      case "crazyhouse":
        return <CrazyHouseChess initialGameState={gameState} userId={userId} />
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Streak Master</Text>
          <View style={styles.wallet}>
            <Text style={styles.walletText}>₹1.00</Text>
          </View>
        </View>

        {/* Victory Rush Card */}
        <View style={styles.victoryRushCard}>
          <View style={styles.cardBackground}>
             <View style={styles.victoryRushContent}>
              <Image 
                source={require("../../assets/tl.png")} 
                style={styles.victoryRushLogo}
                resizeMode="contain"
              />
              <View style={styles.textContainer}>
                <Text style={styles.subtitle}>Rack up wins.</Text>
                <Text style={styles.motivationText}>Keep your streak alive!</Text>
              </View>

            </View>
          </View>
        </View>

        {/* Queue Status */}
        {isTournamentQueueing && (
          <View style={styles.queueStatusContainer}>
            <ActivityIndicator size="large" color="#00A862" />
            <Text style={styles.queueStatusText}>Searching for match...</Text>
            <Text style={styles.queueTimerText}>Time in queue: {timer}s</Text>
          </View>
        )}

        {/* Match Found Details */}
        {matchDetails && (
          <View style={styles.matchFoundContainer}>
            <View style={styles.matchFoundCard}>
              <Text style={styles.matchFoundTitle}>🎯 Match Found!</Text>
              
              <View style={styles.matchDetailsSection}>
                <View style={styles.opponentSection}>
                  <Text style={styles.opponentLabel}>Opponent</Text>
                  <Text style={styles.opponentName}>{matchDetails.opponent}</Text>
                </View>
                
                <View style={styles.variantSection}>
                  <Text style={styles.variantLabel}>Game Mode</Text>
                  <Text style={styles.variantName}>
                    {formatVariantName(matchDetails.variant, matchDetails.subvariant)}
                  </Text>
                  {matchDetails.subvariant && (
                    <Text style={styles.subvariantName}>
                      {matchDetails.subvariant}
                    </Text>
                  )}
                </View>
              </View>
              
              <View style={styles.startingGameSection}>
                <ActivityIndicator size="small" color="#00A862" />
                <Text style={styles.startingGameText}>Starting game...</Text>
              </View>
            </View>
          </View>
        )}

        {/* How to Win Section */}
        <View style={styles.rulesContainer}>
          <Text style={styles.sectionTitle}>How to Win</Text>
          <View style={styles.rulesCard}>
            {[
              "Win or draw games without losing to form a streak",
              "The more games you go unbeaten, the longer your streak",
              "The number of games in your unbeaten streak will be your score in the leaderboard",
              "Your score will be frozen when you lose a game. But don't worry, we will give you another chance if you lose your first game",
              "You should win at least one game to be eligible for prize money"
            ].map((rule, index) => (
              <View key={index} style={styles.ruleItem}>
                <View style={styles.ruleBullet} />
                <Text style={styles.ruleText}>{rule}</Text>
              </View>
            ))}
          </View>
        </View>
        
        {/* Personal Stats */}
        {leaderboardData && (
          <View style={styles.personalStatsContainer}>
            <Text style={styles.sectionTitle}>Your Stats</Text>
            <View style={styles.personalStatsCard}>
              {(() => {
                const currentUser = leaderboardData.leaderboard.find((player: any) => player.player.id === userId);
                return currentUser ? (
                  <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{currentUser.player.currentTournamentStreak}</Text>
                      <Text style={styles.statLabel}>Current Streak</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{currentUser.player.personalBestStreak}</Text>
                      <Text style={styles.statLabel}>Personal Best</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>#{currentUser.rank}</Text>
                      <Text style={styles.statLabel}>Current Rank</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.noStatsContainer}>
                    <Text style={styles.noStatsText}>🎯</Text>
                    <Text style={styles.noStatsSubtext}>Join tournament to see your stats</Text>
                  </View>
                );
              })()}
            </View>
          </View>
        )}

        {/* Leaderboard */}
        <View style={styles.leaderboardContainer}>
          <Text style={styles.sectionTitle}>Leaderboard</Text>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#00A862" />
              <Text style={styles.loadingText}>Loading leaderboard...</Text>
            </View>
          ) : leaderboardData ? (
            <View>
              {leaderboardData.leaderboard.slice(0, 10).map((player: any, index: number) => (
                <View 
                  key={player.player.id} 
                  style={[
                    styles.playerCard,
                    player.player.id === userId && styles.currentPlayerCard
                  ]}
                >
                  <View style={styles.playerRow}>
                    <Text style={styles.playerRank}>#{player.rank}</Text>
                    <View style={styles.playerDetails}>
                      <Text style={[
                        styles.playerName,
                        player.player.id === userId && styles.currentPlayerName
                      ]}>
                        {player.player.name}
                        {player.player.id === userId && (
                          <Text style={styles.youIndicator}> (You)</Text>
                        )}
                      </Text>
                    </View>
                    <Text style={styles.playerStreak}>{player.player.currentTournamentStreak}</Text>
                  </View>
                </View>
              ))}
              
              <View style={styles.tournamentInfo}>
                <Text style={styles.tournamentName}>{leaderboardData.tournament.name}</Text>
                <Text style={styles.participantCount}>
                  {leaderboardData.tournament.totalParticipants} participants
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorEmoji}>⚠️</Text>
              <Text style={styles.errorText}>Failed to load leaderboard</Text>
              <TouchableOpacity onPress={fetchLeaderboard} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Fixed Bottom Section */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity 
          style={[
            styles.playButton, 
            (isConnecting || tournamentStatus !== 'idle') && styles.playButtonDisabled
          ]}
          onPress={tournamentStatus === 'idle' ? handlePlayNow : handleLeaveTournament}
          disabled={tournamentStatus === 'matched'}
          activeOpacity={0.8}
        >
          {isConnecting || tournamentStatus !== 'idle' ? (
            <View style={styles.loadingButtonContent}>
              <ActivityIndicator size="small" color="#000000" />
              <Text style={styles.playButtonText}>
                {tournamentStatus === 'joining' ? 'Connecting...' : 
                 tournamentStatus === 'queuing' ? `Finding Match (${timer}s)` :
                 matchDetails ? 'Starting Game...' : 'Match Found!'}
              </Text>
            </View>
          ) : (
            <Text style={styles.playButtonText}>Play Now</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  infoText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 60,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  wallet: {
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 98, 0.3)', // Changed from yellow to green
    minWidth: 80,
    alignItems: 'center',
  },
  walletText: {
    color: '#00A862', // Changed from yellow to green
    fontSize: 16,
    fontWeight: '700',
  },

  // Victory Rush Card
  victoryRushCard: {
    marginHorizontal: 20,
    marginVertical: 20,
    borderRadius: 25,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  cardBackground: {
    backgroundColor: '#69923e',
    position: 'relative',
  },
  victoryRushContent: {
    padding: 24,
    alignItems: 'center',
    minHeight: 240,
  },
  victoryRushLogo: {
    position: 'absolute',
    top: -50,
    width: '120%',
    height: 200,
    zIndex: 1,
  },
  textContainer: {
    alignItems: 'center',
    paddingTop: 100,
    marginBottom: 24,
    zIndex: 2,
  },
  subtitle: {
    color: '#FFF5E1',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  motivationText: {
    color: '#FFF5E1',
    fontSize: 16,
    opacity: 0.9,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  progressSection: {
    width: '100%',
    alignItems: 'center',
  },
  progressBar: {
    width: '90%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    width: '43%',
    height: '100%',
    backgroundColor: '#32D74B',
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
    fontWeight: '600',
  },
  totalSpots: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Section Titles
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: 0.5,
  },

  // Rules Section
  rulesContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  rulesCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  ruleBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00A862', // Changed from yellow to green
    marginRight: 16,
    marginTop: 8,
    flexShrink: 0,
  },
  ruleText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 24,
    flex: 1,
  },

  // Personal Stats
  personalStatsContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  personalStatsCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 98, 0.2)', // Changed from yellow to green
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: '#00A862', // Changed from yellow to green
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 16,
  },
  statDivider: {
    width: 1,
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 16,
  },
  noStatsContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noStatsText: {
    fontSize: 48,
    marginBottom: 12,
  },
  noStatsSubtext: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    textAlign: 'center',
  },

  // Leaderboard
  leaderboardContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  playerCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  currentPlayerCard: {
    backgroundColor: 'rgba(0, 168, 98, 0.1)',
    borderColor: '#00A862',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  playerRank: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '600',
    width: 40,
  },
  playerDetails: {
    flex: 1,
    marginLeft: 12,
  },
  playerName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  currentPlayerName: {
    color: '#00A862',
    fontWeight: '700',
  },
  youIndicator: {
    color: '#00A862',
    fontSize: 14,
    fontWeight: '500',
  },
  playerStreak: {
    color: '#00A862',
    fontSize: 16,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'center',
  },
  tournamentInfo: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tournamentName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  participantCount: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '500',
  },

  // Loading and Error States
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500',
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: '#00A862', // Changed from yellow to green
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  retryButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },

  // Bottom Container
  bottomContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 40,
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  playButton: {
    backgroundColor: '#00A862', // Changed from yellow to green
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 12,
    elevation: 6,
    shadowColor: '#00A862', // Changed from yellow to green
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  playButtonDisabled: {
    opacity: 0.7,
  },
  loadingButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playButtonText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginLeft: 8,
  },
  timerText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  bottomPadding: {
    height: 140,
  },

  // Queue Status
  queueStatusContainer: {
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 98, 0.3)',
  },
  queueStatusText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  queueTimerText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  matchFoundText: {
    color: '#00A862',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
    textAlign: 'center',
  },

  // Match Found Styles
  matchFoundContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  matchFoundCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: '#00A862',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#00A862',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  matchFoundTitle: {
    color: '#00A862',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
  },
  matchDetailsSection: {
    width: '100%',
    marginBottom: 20,
  },
  opponentSection: {
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  opponentLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  opponentName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  variantSection: {
    alignItems: 'center',
  },
  variantLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  variantName: {
    color: '#00A862',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  subvariantName: {
    color: 'rgba(0, 168, 98, 0.8)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  startingGameSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  startingGameText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
