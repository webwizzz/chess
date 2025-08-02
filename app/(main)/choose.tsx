import { getSocket } from "@/utils/socketManager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import Svg, { Path } from 'react-native-svg';
import { shouldHideNavigation } from "../../utils/navigationState";
import Layout from '../components/layout/Layout';
import VariantCard from '../components/ui/VariantCard';
import TournamentScreen from "./tournament";
import { chooseScreenStyles } from "../lib/styles/screens";

export default function Choose() {
  const { width, height } = Dimensions.get("window");
  const router = useRouter();
  
  const variants = [
    {
      name: "decay",
      title: "Decay",
      subtitle: "Pieces decay after some time • 100 coins per win",
      description: "Pieces decay after a set number of moves. Adapt your strategy!",
      rules: "In Decay Chess, each piece has a limited lifespan measured in moves. After a certain number of moves, pieces will 'decay' and be removed from the board. Plan your strategy carefully as your pieces won't last forever!",
      color: "#2C2C2E"
    },
    {
      name: "sixpointer",
      title: "6 Point Chess",
      subtitle: "Win by points after 6 moves each • 100 coins per win",
      description: "Each piece has a point value. Score 6 points to win!",
      rules: "Each piece has a specific point value: Pawn=1, Knight/Bishop=3, Rook=5, Queen=9. Capture opponent pieces to accumulate points. First player to reach 6 points wins the game!",
      color: "#2C2C2E"
    },
    {
      name: "crazyhouse",
      title: "Crazyhouse ",
      subtitle: "Crazyhouse without time pressure • 100 coins per win",
      description: "Captured pieces return to your hand. Play fast!",
      rules: "When you capture an opponent's piece, it joins your reserves and can be dropped back onto the board as your own piece on any empty square. This creates dynamic and tactical gameplay with time pressure!",
      color: "#2C2C2E"
    },
    {
      name: "classic",
      title: "Classic Chess",
      subtitle: "Play offline with a friend",
      description: "The traditional chess game with no special rules.",
      rules: "Standard chess rules apply. The objective is to checkmate your opponent's king. Pieces move according to traditional chess rules with no modifications.",
      color: "#2C2C2E"
    },
  ];

  const [userId, setUserId] = useState<string | null>(null);
  const [socketConnecting, setSocketConnecting] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [selectedVariantRules, setSelectedVariantRules] = useState("");
  const [selectedVariantTitle, setSelectedVariantTitle] = useState("");

  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("user");
        if (storedUser) {
          const user = JSON.parse(storedUser);
          setUserId(user._id);
        }
        console.log("found user")
      } catch (e) {
        console.error("Error fetching user ID:", e);
      }
    };

    fetchUserId();
  }, [])

 

  const handleVariantSelect = async (variant: string) => {
    if (!userId) {
      Alert.alert("Login Required", "Please log in to play games.");
      return;
    }

    if (variant === "classic") {
      router.replace({ pathname: "/(game)/time-controls/classic", params: { userId } } as any);
      return;
    } else if (variant === "crazyhouse") {
      router.replace({ pathname: "/(game)/time-controls/crazy", params: { userId } } as any);
      return;
    }

    setSocketConnecting(true);
    const socketInstance = getSocket(userId, "matchmaking");
    socketInstance.connect();

    const onConnectSuccess = () => {
      console.log("Matchmaking socket connected for variant select.");
      socketInstance.off("connect", onConnectSuccess);
      socketInstance.off("connect_error", onConnectError);
      socketInstance.emit("queue:join", { variant });
      router.replace({ pathname: "/matchmaking", params: { variant, userId } });
      setSocketConnecting(false);
    };

    const onConnectError = (error: Error) => {
      console.error("Matchmaking socket connection error:", error);
      Alert.alert("Connection Failed", "Failed to connect to the game server. Please try again.");
      socketInstance.off("connect", onConnectSuccess);
      socketInstance.off("connect_error", onConnectError);
      setSocketConnecting(false);
    };

    socketInstance.on("connect", onConnectSuccess);
    socketInstance.on("connect_error", onConnectError);
  };

  const handleTournamentSelect = async () => {
    router.replace({ pathname: "/tournament" });
  };

  const handleProfile = () => {
    router.push({ pathname: '/profile' } as any);
  };

  const handleLeaderboard = () => {
    router.push({ pathname: "/leaderboard" } as any);
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem("user");
      router.push("/(auth)/login");
    } catch (e) {
      console.error("Error logging out:", e);
      Alert.alert("Error", "Failed to log out.");
    }
  };

  const closeRulesModal = () => {
    setShowRulesModal(false);
    setSelectedVariantRules("");
    setSelectedVariantTitle("");
  };

  const [isChooseScreen, setIsChooseScreen] = useState(true);

  const handleToggleScreen = () => {
    setIsChooseScreen(!isChooseScreen);
  };

  // Check if navigation should be hidden (tournament match active)
  const [hideNavigation, setHideNavigation] = useState(shouldHideNavigation());
  
  // Poll navigation state to detect changes
  useEffect(() => {
    const checkNavVisibility = () => {
      const currentState = shouldHideNavigation();
      if (currentState !== hideNavigation) {
        setHideNavigation(currentState);
      }
    };
    
    const interval = setInterval(checkNavVisibility, 500);
    return () => clearInterval(interval);
  }, [hideNavigation]);

  return (
    <Layout
      onProfile={handleProfile}
      onTournament={handleTournamentSelect}
      onLogout={handleLogout}
      isChooseScreen={isChooseScreen}
      onToggleScreen={handleToggleScreen}
      hideNavigation={hideNavigation}
    >
      {isChooseScreen ? (
        <ScrollView contentContainerStyle={chooseScreenStyles.scrollViewContent}>
        {/* Navigation Buttons */}
        <View style={chooseScreenStyles.navButtonsContainer}>
          <TouchableOpacity style={chooseScreenStyles.navButton} onPress={handleLeaderboard}>
            <Text style={chooseScreenStyles.navButtonText}>Leaderboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={chooseScreenStyles.navButton} onPress={() => setShowRulesModal(true)}>
            <Text style={chooseScreenStyles.navButtonText}>Rules</Text>
          </TouchableOpacity>
        </View>

        {/* Heading */}
        <Text style={chooseScreenStyles.heading}>Choose Variant</Text>

        {socketConnecting && (
          <View style={chooseScreenStyles.connectingContainer}>
            <ActivityIndicator size="large" color="#00A862" />
            <Text style={chooseScreenStyles.connectingText}>Connecting to server...</Text>
          </View>
        )}

        {/* Variants Section */}
        <View style={chooseScreenStyles.variantsColumn}>
          {variants.map((variant) => (
            <VariantCard
              key={variant.name}
              variantName={variant.title}
              description={variant.description}
              activePlayers={25} // This should be dynamic from your backend
              onPlay={() => handleVariantSelect(variant.name)}
              disabled={userId ? false : true}
            />
          ))}
        </View>
      </ScrollView>
      ) : (
        <TournamentScreen />
      )}

      {/* Rules Modal */}
      <Modal
        visible={showRulesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeRulesModal}
      >
        <View style={chooseScreenStyles.modalOverlay}>
          <View style={chooseScreenStyles.rulesModal}>
            <Text style={chooseScreenStyles.rulesTitle}>{selectedVariantTitle} Rules</Text>
            <ScrollView style={chooseScreenStyles.rulesContent}>
              <Text style={chooseScreenStyles.rulesText}>{selectedVariantRules}</Text>
            </ScrollView>
            <TouchableOpacity style={chooseScreenStyles.closeRulesButton} onPress={closeRulesModal}>
              <Text style={chooseScreenStyles.closeRulesButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Layout>
  );
}
