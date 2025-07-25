import { getSocket } from "@/utils/socketManager";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const timeControls = [
  { label: "Blitz", description: "3+2 (3 min, 2s increment)" },
  { label: "Bullet", description: "1+0 (1 min, no increment)" },
  { label: "Standard", description: "10 mins" },
];

export default function ClassicTimeControl() {
  const router = useRouter();
  const {userId}  = useLocalSearchParams();
  const [selected, setSelected] = useState(0);
  const [socketConnecting, setSocketConnecting] = useState(false);
  console.log("ClassicTimeControl userId:", userId);

  const handleSubVariantSelect = async () => {
      if (!userId) return;
  
      const tc = timeControls[selected];
      const subvariant = tc.label.toLowerCase();
      if (!tc) return;
      setSocketConnecting(true);
      const socketInstance = getSocket(userId, "matchmaking");
      console.log("Connecting to socket for Classic matchmaking with time control:", tc.label);
      console.log("Socket instance:", socketInstance);
  
      socketInstance.connect();
  
      socketInstance.on("connect", () => {
        socketInstance.emit("queue:join", { userId, variant: "classic", subvariant });
        setSocketConnecting(false);
        router.push({
          pathname: "/matchmaking",
          params: { variant: "classic", subvariant, userId},
        });
      });
  
      socketInstance.on("connect_error", () => {
        alert("Failed to connect to server!");
        setSocketConnecting(false);
      });
    };

  return (
    <View style={{ flex: 1, backgroundColor: "#23272A", justifyContent: "center", alignItems: "center", padding: 24 }}>
      <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold", marginBottom: 32, textAlign: "center" }}>
        Choose Time Control
      </Text>
      {timeControls.map((tc, idx) => (
        <TouchableOpacity
          key={tc.label}
          onPress={() => setSelected(idx)}
          style={{
            backgroundColor: selected === idx ? "#00A862" : "#2C2F33",
            borderRadius: 14,
            padding: 22,
            marginBottom: 18,
            width: 320,
            alignItems: "center",
            borderWidth: selected === idx ? 2 : 0,
            borderColor: selected === idx ? "#fff" : undefined,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 7,
            elevation: 2,
          }}
        >
          <Text style={{ color: selected === idx ? "#fff" : "#00A862", fontSize: 22, fontWeight: "bold", marginBottom: 6 }}>{tc.label}</Text>
          <Text style={{ color: "#b0b3b8", fontSize: 16 }}>{tc.description}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={{
          backgroundColor: "#00A862",
          borderRadius: 10,
          paddingVertical: 14,
          paddingHorizontal: 40,
          marginTop: 30,
          opacity: socketConnecting ? 0.6 : 1,
        }}
        onPress={handleSubVariantSelect}
        disabled={socketConnecting}
      >
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>
          {socketConnecting ? "Connecting..." : "Continue"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
