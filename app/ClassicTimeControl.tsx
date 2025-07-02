import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";

const timeControls = [
  { label: "Blitz", base: 3, increment: 2, description: "3+2 (3 min, 2s increment)" },
  { label: "Bullet", base: 1, increment: 0, description: "1+0 (1 min, no increment)" },
];

export default function ClassicTimeControl() {
  const router = useRouter();
  const { variant } = useLocalSearchParams();
  const [selected, setSelected] = useState(0);

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
        }}
        onPress={() => {
          const tc = timeControls[selected];
          router.push({
            pathname: "/matchmaking",
            params: { variant: variant || "Classic Chess", timeBase: tc.base, timeIncrement: tc.increment, timeLabel: tc.label },
          });
        }}
      >
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}
