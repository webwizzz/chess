import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

interface Player {
  _id: string;
  name: string;
  email: string;
  matchesWon: number;
  matchesLost: number;
}

export default function Leaderboard() {
  // Dummy data for leaderboard
  const dummyPlayers: Player[] = [
    {
      _id: "1",
      name: "Alice",
      email: "alice@example.com",
      matchesWon: 10,
      matchesLost: 2,
    },
    {
      _id: "2",
      name: "Bob",
      email: "bob@example.com",
      matchesWon: 8,
      matchesLost: 5,
    },
    {
      _id: "3",
      name: "Charlie",
      email: "charlie@example.com",
      matchesWon: 6,
      matchesLost: 7,
    },
    {
      _id: "4",
      name: "David",
      email: "david@example.com",
      matchesWon: 4,
      matchesLost: 10,
    },
    {
      _id: "5",
      name: "Eve",
      email: "eve@example.com",
      matchesWon: 12,
      matchesLost: 1,
    },
  ];

  const [players, setPlayers] = useState<Player[]>(dummyPlayers);
  const [loading, setLoading] = useState(false); // No loading for dummy
  const [error, setError] = useState<string | null>(null);

  // Calculate score for each player
  const getScore = (player: Player) => player.matchesWon * 3 + player.matchesLost * -2;

  // Sort players by score descending
  const sortedPlayers = [...players].sort((a, b) => getScore(b) - getScore(a));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#00A862" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {sortedPlayers.map((player, idx) => (
            <View key={player._id} style={styles.card}>
              <Text style={styles.rank}>#{idx + 1}</Text>
              <Text style={styles.name}>{player.name}</Text>
              <Text style={styles.email}>{player.email}</Text>
              <View style={styles.statsRow}>
                <Text style={styles.stat}>Won: {player.matchesWon}</Text>
                <Text style={styles.stat}>Lost: {player.matchesLost}</Text>
                <Text style={styles.score}>Score: {getScore(player)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#23272A",
    paddingTop: 40,
    paddingHorizontal: 16,
  },
  title: {
    color: "#00A862",
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 24,
  },
  error: {
    color: "#FF4D4D",
    fontSize: 18,
    textAlign: "center",
    marginTop: 20,
  },
  listContent: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#2C2F33",
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  rank: {
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  name: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  email: {
    color: "#b0b3b8",
    fontSize: 14,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 8,
  },
  stat: {
    color: "#00A862",
    fontSize: 16,
    fontWeight: "bold",
    marginRight: 16,
  },
  score: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "bold",
  },
});
