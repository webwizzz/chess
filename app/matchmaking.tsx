import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";

export default function MatchMaking({ route }: any) {
  // You can get the variant from route.params if you want to pass it
  const [opponent, setOpponent] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    // Simulate matchmaking delay
    const interval = setInterval(() => setTimer(t => t + 1), 1000);
    const timeout = setTimeout(() => {
      setOpponent("Lader (Opponent)");
      clearInterval(interval);
    }, 4000); // 4 seconds for demo
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#23272A", justifyContent: "center", alignItems: "center", padding: 20 }}>
      <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold", marginBottom: 32 }}>Matchmaking...</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", width: "100%" }}>
        {/* User Side */}
        <View style={{ alignItems: "center", flex: 1 }}>
          <Image source={{ uri: "https://ui-avatars.com/api/?name=You&background=00A862&color=fff&size=128" }} style={{ width: 64, height: 64, borderRadius: 32, marginBottom: 8 }} />
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>You</Text>
        </View>
        {/* VS */}
        <View style={{ alignItems: "center", flex: 0.5 }}>
          <Text style={{ color: "#b0b3b8", fontSize: 22, fontWeight: "bold" }}>VS</Text>
        </View>
        {/* Opponent Side */}
        <View style={{ alignItems: "center", flex: 1 }}>
          <Image source={{ uri: opponent ? "https://ui-avatars.com/api/?name=Lader&background=2C2F33&color=fff&size=128" : "https://cdn-icons-png.flaticon.com/512/189/189792.png" }} style={{ width: 64, height: 64, borderRadius: 32, marginBottom: 8, opacity: opponent ? 1 : 0.5 }} />
          <Text style={{ color: opponent ? "#fff" : "#b0b3b8", fontSize: 18, fontWeight: "bold" }}>{opponent || "Searching..."}</Text>
        </View>
      </View>
      {!opponent && (
        <View style={{ marginTop: 40, alignItems: "center" }}>
          <ActivityIndicator size="large" color="#00A862" />
          <Text style={{ color: "#b0b3b8", fontSize: 16, marginTop: 12 }}>Finding an opponent... ({timer}s)</Text>
        </View>
      )}
      {opponent && (
        <View style={{ marginTop: 40, alignItems: "center" }}>
          <Text style={{ color: "#00A862", fontSize: 20, fontWeight: "bold" }}>Match Found!</Text>
        </View>
      )}
    </View>
  );
}
