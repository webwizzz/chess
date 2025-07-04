import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { Socket } from "socket.io-client";
import { getSocketInstance } from "../utils/socketManager";

export default function MatchMaking() {
  const router = useRouter();
  const { variant, timeBase, timeIncrement, timeLabel } = useLocalSearchParams();
  const [opponent, setOpponent] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Always get a connected socket instance
    const existingSocket = getSocketInstance();
    if (existingSocket) {
      setSocket(existingSocket);
      console.log("Using existing socket instance");
      // Debug: Log socket details
      console.log("Socket namespace:", existingSocket.nsp);
      console.log("Socket id:", existingSocket.id);
      console.log("Socket connected:", existingSocket.connected);
      // Listen for all events for debugging
      existingSocket.onAny((event: string, ...args: any[]) => {
        console.log("[SOCKET EVENT]", event, args);
      });
    } else {
      alert("Connection failed");
    }
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on("queue:matched", (response) => {
        console.log("Received initialContextResponse:", response);
        setOpponent(response.opponent.name);
        setTimer(0); // Reset timer when match is found
      });
    socket.on("queue:error", (response) => {
        console.log("Received initialContextResponse:", response);
        setOpponent(null);
        setTimer(0); // Reset timer on error
        alert(response.error || "An error occurred while matching");
      });

    return () => {
      socket.off("queue:matched",  (response) => {
        console.log("Received initialContextResponse:", response);
        setOpponent(response.opponent.name);
        setTimer(0); // Reset timer when match is found
      });
      socket.off("queue:error", (response) => {
        console.log("Received initialContextResponse:", response);
        setOpponent(null);
        setTimer(0); // Reset timer on error
        alert(response.error || "An error occurred while matching");
      });
    };
  }, [socket]);

  useEffect(() => {
    if (!opponent && timer > 30) {
      alert("No opponent found within 30 seconds. Redirecting to choose page.");
      router.replace("/choose");
    }
  }, [timer, opponent, router]);

  useEffect(() => {
    // if (opponent && variant) {
    //   if (variant === "Classic Chess") {
      //   router.replace({ pathname: "/Classic", params: { timeBase, timeIncrement, timeLabel } });
      // } 
    //   else if(variant === "Decay Chess") {
    //     router.replace({ pathname: "/decay/[opponent]", params: { opponent } });
    //   }
    //   // else if(variant === "Bullet") {
    //   //   router.replace({ pathname: "/Bullet", params: { opponent } });
    //   // }
    //   // else if(variant === "Chess960") {
    //   //   router.replace({ pathname: "/Chess960", params: { opponent } });
    //   // }
    // }
  }, [opponent, variant, router]);

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
      {/* Show timer and spinner if not matched */}
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
