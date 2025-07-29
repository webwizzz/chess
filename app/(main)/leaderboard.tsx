import axios from "axios";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

interface Player {
  _id: string;
  name: string;
  email: string;
  ratings?: number;
  win?: number;
  lose?: number;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axios.get("http://localhost:3000/api/leaderboard");
      console.log("Fetched players:", response.data);
      const fetchedPlayers = response.data.users || response.data;
      setPlayers(fetchedPlayers);
      setError(null);
    } catch (err) {
      console.error("Error fetching players:", err);
      setError("Failed to load leaderboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getRankStyle = (rank: number) => {
    if (rank === 1) return styles.goldRank;
    if (rank === 2) return styles.silverRank;
    if (rank === 3) return styles.bronzeRank;
    return styles.defaultRank;
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return "👑";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  const calculateWinRate = (wins: number = 0, losses: number = 0) => {
    const total = wins + losses;
    if (total === 0) return "0%";
    return `${Math.round((wins / total) * 100)}%`;
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00A862" />
          <Text style={styles.loadingText}>Loading leaderboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🏆 Leaderboard</Text>
        <Text style={styles.subtitle}>Top players ranking</Text>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchData} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#00A862']}
              tintColor="#00A862"
            />
          }
        >

          {/* Full Rankings */}
          <View style={styles.fullRankingsContainer}>
            <Text style={styles.fullRankingsTitle}>Full Rankings</Text>
            
            {players.map((player, idx) => {
              const rank = idx + 1;
              const winRate = calculateWinRate(player.win, player.lose);
              
              return (
                <View key={player._id} style={[styles.playerCard, rank <= 3 && styles.topThreeCard]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.rankBadge, getRankStyle(rank)]}>
                      <Text style={styles.rankText}>
                        {getRankIcon(rank)}
                      </Text>
                    </View>
                    
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{player.name}</Text>
                      <Text style={styles.playerEmail}>{player.email}</Text>
                    </View>
                    
                    <View style={styles.ratingContainer}>
                      <Text style={styles.ratingValue}>{player.ratings || 0}</Text>
                      <Text style={styles.ratingLabel}>Rating</Text>
                    </View>
                  </View>

                  <View style={styles.statsContainer}>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{player.win || 0}</Text>
                      <Text style={styles.statLabel}>Wins</Text>
                    </View>
                    
                    <View style={styles.statDivider} />
                    
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{player.lose || 0}</Text>
                      <Text style={styles.statLabel}>Losses</Text>
                    </View>
                    
                    <View style={styles.statDivider} />
                    
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{winRate}</Text>
                      <Text style={styles.statLabel}>Win Rate</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.footerSpace} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1C1C1E",
  },
  
  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  title: {
    color: "#FFFFFF",
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: "500",
    textAlign: "center",
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    marginTop: 12,
  },

  // Error
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: "#2C2C2E",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },

  // Scroll Content
  scrollContent: {
    paddingBottom: 40,
  },

  // Full Rankings
  fullRankingsContainer: {
    paddingHorizontal: 20,
  },
  fullRankingsTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },

  // Player Cards
  playerCard: {
    backgroundColor: "#2C2C2E",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  topThreeCard: {
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    backgroundColor: "#2C2C2E",
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  
  // Rank Badge
  rankBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  goldRank: {
    backgroundColor: '#3A3A3C',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  silverRank: {
    backgroundColor: '#3A3A3C',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  bronzeRank: {
    backgroundColor: '#3A3A3C',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  defaultRank: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  rankText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Player Info
  playerInfo: {
    flex: 1,
    marginRight: 12,
  },
  playerName: {
    color: "#FFFFFF",
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: "600",
    marginBottom: 4,
  },
  playerEmail: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: "400",
  },

  // Rating
  ratingContainer: {
    alignItems: 'center',
  },
  ratingValue: {
    color: "#FFFFFF",
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: "700",
    marginBottom: 2,
  },
  ratingLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: Math.min(screenWidth * 0.03, 12),
    fontWeight: "500",
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: "600",
    marginBottom: 4,
  },
  statLabel: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: Math.min(screenWidth * 0.03, 12),
    fontWeight: "500",
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 8,
  },

  // Footer
  footerSpace: {
    height: 40,
  },
});
