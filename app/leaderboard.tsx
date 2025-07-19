import axios from "axios";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

interface Player {
  _id: string;
  name: string;
  email: string;
  ratings?: number;
}

export default function Leaderboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const response = await axios.get("http://localhost:3000/api/leaderboard");
        console.log("Fetched players:", response.data);
        // Adjust this based on how your API returns the data
        const fetchedPlayers = response.data.users || response.data;
        setPlayers(fetchedPlayers);
      } catch (err) {
        console.error("Error fetching players:", err);
        setError("Failed to load leaderboard.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

 

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#00A862" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {players.map((player, idx) => (
            <View key={player._id} style={styles.card}>
              <Text style={styles.rank}>#{idx + 1}</Text>
              <Text style={styles.name}>{player.name}</Text>
              <Text style={styles.email}>{player.email}</Text>
              <View style={styles.statsRow}>
                <Text style={styles.score}>Score: {player.ratings}</Text>
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
    elevation: 3,
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
