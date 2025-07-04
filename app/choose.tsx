import { getSocket } from "@/utils/socketManager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, ScrollView, Text, TouchableOpacity, View } from "react-native";

export default function Choose() {
  const { width } = Dimensions.get("window");
  const router = useRouter();
  const cardWidth = width > 400 ? 360 : width - 40;

  const variants = [
    {
      title: "Classic Chess",
      description: "Pieces decay after a set number of moves. Adapt your strategy!",
    },
    {
      title: "Decay chess",
      description: "Each piece has a point value. Score 6 points to win!",
    },
    {
      title: "Crazyhouse with Timer",
      description: "Captured pieces return to your hand. Play fast!",
    },
    {
      title: "Classic",
      description: "The traditional chess game with no special rules.",
    }
  ];

  const [userId, setUserId] = useState<string | null>(null);
  const [socketConnecting, setSocketConnecting] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("user");
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setUserId(parsedUser._id);
        }
      } catch (err) {
        console.error("Error initializing user:", err);
        alert("Connection failed!");
      }
    };
    init();
  }, []);

  const handleVariantSelect = async (variant: string) => {
    if (!userId) return;

    // if (variant.title === "Classic") {
    //   router.push({ pathname: "/ClassicTimeControl", params: { variant: variant.title } });
    // }

    setSocketConnecting(true);
    const socketInstance = getSocket(userId, "matchmaking");

    socketInstance.connect();

    socketInstance.on("connect", () => {
      socketInstance.emit("queue:join", { userId, variant });
      setSocketConnecting(false);
      router.replace({ pathname: "/matchmaking", params: { variant } });
    });

    socketInstance.on("connect_error", () => {
      alert("Failed to connect to server!");
      setSocketConnecting(false);
    });
  };

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: "#23272A",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
      }}
    >
      <Text
        style={{
          color: "#fff",
          fontSize: 28,
          fontWeight: "bold",
          marginBottom: 24,
          textAlign: "center",
        }}
      >
        Choose Your Variant
      </Text>

      {socketConnecting && (
        <View style={{ marginBottom: 32, alignItems: "center" }}>
          <ActivityIndicator size="large" color="#00A862" />
          <Text style={{ color: "#b0b3b8", fontSize: 16, marginTop: 12 }}>Connecting to server...</Text>
        </View>
      )}

      {variants.map((variant) => (
        <TouchableOpacity
          key={variant.title}
          style={{
            backgroundColor: "#2C2F33",
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
            width: cardWidth,
            alignItems: "center",
            opacity: userId && !socketConnecting ? 1 : 0.5,
            elevation: 3,
          }}
          activeOpacity={0.85}
          onPress={() => handleVariantSelect(variant.title)}
          disabled={!userId || socketConnecting}
        >
          <Text
            style={{
              color: "#00A862",
              fontSize: 22,
              fontWeight: "bold",
              marginBottom: 6,
              textAlign: "center",
            }}
          >
            {variant.title}
          </Text>
          <Text
            style={{
              color: "#b0b3b8",
              fontSize: 15,
              textAlign: "center",
            }}
          >
            {variant.description}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
