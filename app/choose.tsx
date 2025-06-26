import { useRouter } from "expo-router";
import React from "react";
import { Dimensions, Image, ScrollView, Text, TouchableOpacity } from "react-native";

export default function Choose() {
  const { width } = Dimensions.get("window");
  const router = useRouter();
  const cardWidth = width > 400 ? 360 : width - 40;
  const variants = [
    {
      title: "Classic Chess",
      description: "Pieces decay after a set number of moves. Adapt your strategy!",
      image: "https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/PhilippK/PiecesDecay.png",
    },
    {
      title: "Decay chess",
      description: "Each piece has a point value. Score 6 points to win!",
      image: "https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/PhilippK/6Pointer.png",
    },
    {
      title: "Crazyhouse with Timer",
      description: "Captured pieces return to your hand. Play fast!",
      image: "https://images.chesscomfiles.com/uploads/v1/images_users/tiny_mce/PhilippK/Crazyhouse.png",
    },
  ];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: "#23272A", justifyContent: "center", alignItems: "center", padding: 20 }}>
      <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold", marginBottom: 24, textAlign: "center" }}>Choose Your Variant</Text>
      {variants.map((variant, idx) => (
        <TouchableOpacity
          key={variant.title}
          style={{
            backgroundColor: "#2C2F33",
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
            width: cardWidth,
            alignItems: "center",
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 3,
          }}
          activeOpacity={0.85}
          onPress={() => router.push({ pathname: "/matchmaking", params: { variant: variant.title } })}
        >
          <Image source={{ uri: variant.image }} style={{ width: 80, height: 80, borderRadius: 10, marginBottom: 12, resizeMode: "contain" }} />
          <Text style={{ color: "#00A862", fontSize: 22, fontWeight: "bold", marginBottom: 6, textAlign: "center" }}>{variant.title}</Text>
          <Text style={{ color: "#b0b3b8", fontSize: 15, textAlign: "center" }}>{variant.description}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
