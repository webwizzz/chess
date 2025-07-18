import { getSocket } from "@/utils/socketManager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function Choose() {
  const { width, height } = Dimensions.get("window");
  const router = useRouter();
  const cardWidth = width > 400 ? 360 : width - 40;

  const variants = [
    {
      name: "decay",
      title: "Decay Chess",
      description: "Pieces decay after a set number of moves. Adapt your strategy!",
    },
    {
      name: "sixpointer",
      title: "Six Pointer",
      description: "Each piece has a point value. Score 6 points to win!",
    },
    {
      name: "crazyhouse",
      title: "Crazyhouse with Timer",
      description: "Captured pieces return to your hand. Play fast!",
    },
    {
      name: "classic",
      title: "Classic",
      description: "The traditional chess game with no special rules.",
    },
  ];

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null); // State for user's name
  const [userEmail, setUserEmail] = useState<string | null>(null); // State for user's email
  const [socketConnecting, setSocketConnecting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false); // State for profile card
  const sidebarAnim = useRef(new Animated.Value(-width)).current; // Initial position off-screen left

  useEffect(() => {
    const init = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("user");
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setUserId(parsedUser._id);
          setUserName(parsedUser.name || `User ${parsedUser._id.substring(0, 4)}`);
          setUserEmail(parsedUser.email || "No email");
        } else {
          setUserName("Guest"); // Default if no user is stored
          setUserEmail("No email");
        }
      } catch (err) {
        console.error("Error initializing user:", err);
        Alert.alert("Error", "Failed to load user data."); // Use Alert
        setUserName("Guest"); // Default on error
        setUserEmail("No email");
      }
    };
    init();
  }, []);

  useEffect(() => {
    Animated.timing(sidebarAnim, {
      toValue: isSidebarOpen ? 0 : -width, // 0 for open, -width for closed
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isSidebarOpen, sidebarAnim, width]);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  const handleVariantSelect = async (variant: string) => {
    if (!userId) {
      Alert.alert("Login Required", "Please log in to play games.");
      return;
    }

    // Connect to matchmaking socket and join queue for regular games
    setSocketConnecting(true);
    const socketInstance = getSocket(userId, "matchmaking"); // Ensure this gets the shared instance

    socketInstance.connect(); // Ensure connection attempt

    const onConnectSuccess = () => {
      console.log("Matchmaking socket connected for variant select.");

      socketInstance.off("connect", onConnectSuccess);
      socketInstance.off("connect_error", onConnectError); 
      socketInstance.emit("tournament:join", { userId });
      
      // Navigate to matchmaking screen, which will then emit queue:join
      // The variant and userId are passed as params to MatchMaking.tsx
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

    // For classic and crazyhouse, you are routing to specific time control screens first.
    // Those screens should handle the getSocket and queue:join logic.
    // For other variants, this `handleVariantSelect` directly joins the queue.
    if (variant === "classic") {
      router.replace({ pathname: "/classictimecontrol", params: { userId } } as any);
      setSocketConnecting(false); // No socket connection needed here directly
      return;
    } else if (variant === "crazyhouse") {
      router.replace({ pathname: "/crazytimecontrol", params: { userId } } as any);
      setSocketConnecting(false); // No socket connection needed here directly
      return;
    }
  };

const handleTournamentSelect = async () => {
  if (!userId) {
    Alert.alert("Login Required", "Please log in to join tournaments.");
    return;
  }

  setSocketConnecting(true);
  const socketInstance = getSocket(userId, "matchmaking"); // Re-using the matchmaking socket for tournament entry

  socketInstance.connect(); // Ensure connection attempt

  const onConnectSuccess = () => {
    console.log("Matchmaking socket connected for tournament.");
    socketInstance.off("connect", onConnectSuccess); // Clean up self-listening
    socketInstance.off("connect_error", onConnectError); // Clean up error listener

    // Navigate to the TournamentScreen.
    // The TournamentScreen will then handle emitting "tournament:join" and other tournament-specific events.
    router.replace({ pathname: "/tournament", params: { userId } });
    setSocketConnecting(false);
  };

  const onConnectError = (error: Error) => {
    console.error("Matchmaking socket connection error:", error);
    Alert.alert("Connection Failed", "Failed to connect to the server for tournaments. Please try again.");
    socketInstance.off("connect", onConnectSuccess);
    socketInstance.off("connect_error", onConnectError);
    setSocketConnecting(false);
  };

  socketInstance.on("connect", onConnectSuccess);
  socketInstance.on("connect_error", onConnectError);
};

  const handleProfile = () => {
    closeSidebar();
    setShowProfileCard(true); // Show profile card
  };

  const handleLeaderboard = () => {
    closeSidebar();
    router.push({ pathname: "/leaderboard" } as any); // Use object format for navigation
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem("user");
      setUserId(null);
      setUserName("Guest");
      closeSidebar();
      setTimeout(() => {
        router.replace({ pathname: "/Login" } as any); // Ensure navigation after state update
      }, 100);
    } catch (e) {
      console.error("Failed to logout", e);
      Alert.alert("Logout Failed", "There was an error logging out. Please try again.");
    }
  };

  const handleCloseProfileCard = () => {
    setShowProfileCard(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Navigation Bar */}
      <View style={styles.topNavBar}>
        <TouchableOpacity style={styles.topNavButton} onPress={handleProfile}>
          {/* Placeholder for profile icon/image */}
          <View style={styles.profileIconPlaceholder} />
          <Text style={styles.topNavButtonText}>Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topNavButton} onPress={handleLeaderboard}>
          {/* Placeholder for leaderboard icon */}
          <Text style={styles.topNavButtonText}>🏆</Text>
          <Text style={styles.topNavButtonText}>Leaderboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topNavButton}>
          {/* Placeholder for newsletter icon */}
          <Text style={styles.topNavButtonText}>✉️</Text>
          <Text style={styles.topNavButtonText}>Newsletter</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* Placeholder for the "Get 10% Cashback" banner */}
        <View style={styles.bannerContainer}>
          <Image
            source={{ uri: 'https://via.placeholder.com/350x150?text=Get+10%25+Cashback' }} // Replace with actual image
            style={styles.bannerImage}
            resizeMode="cover"
          />
          <TouchableOpacity style={styles.rechargeButton}>
            <Text style={styles.rechargeButtonText}>Recharge Now</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>For You</Text>

        {socketConnecting && (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color="#00A862" />
            <Text style={styles.connectingText}>Connecting to server...</Text>
          </View>
        )}

        {/* Variants Section - Modified to be a column of cards */}
        <View style={styles.variantsColumn}>
          {variants.map((variant) => (
            <TouchableOpacity
              key={variant.title}
              style={[
                styles.variantCardFullWidth, // New style for full width
                (!userId || socketConnecting) && styles.cardDisabled,
              ]}
              activeOpacity={0.85}
              onPress={() => handleVariantSelect(variant.name)}
              disabled={!userId || socketConnecting}
            >
              <Text style={styles.variantCardTitle}>{variant.title}</Text>
              <Text style={styles.variantCardDescription}>{variant.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNavBar}>
        <TouchableOpacity style={styles.bottomNavButton} onPress={handleProfile}>
          {/* Placeholder for profile icon */}
          <Text style={styles.bottomNavButtonIcon}>👤</Text>
          <Text style={styles.bottomNavButtonText}>Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavButton} onPress={handleTournamentSelect}>
          {/* Placeholder for tournament icon */}
          <Text style={styles.bottomNavButtonIcon}>🏆</Text>
          <Text style={styles.bottomNavButtonText}>Tournament</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavButton} onPress={handleLogout}>
          {/* Placeholder for logout icon */}
          <Text style={styles.bottomNavButtonIcon}>➡️</Text>
          <Text style={styles.bottomNavButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Sidebar Overlay and Sidebar (kept for existing functionality) */}
      {isSidebarOpen && (
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={closeSidebar}
        />
      )}

      <Animated.View
        style={[
          styles.sidebar,
          { width: width * 0.75, transform: [{ translateX: sidebarAnim }] },
        ]}
      >
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarHeaderText}>Menu</Text>
          <TouchableOpacity onPress={closeSidebar} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.sidebarItem} onPress={handleProfile}>
          <Text style={styles.sidebarItemText}>Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sidebarItem} onPress={handleLeaderboard}>
          <Text style={styles.sidebarItemText}>Leaderboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sidebarItem} onPress={handleLogout}>
          <Text style={[styles.sidebarItemText, styles.logoutText]}>Logout</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Profile Card Overlay (kept for existing functionality) */}
      {showProfileCard && (
        <View style={styles.profileOverlay}>
          <View style={styles.profileCard}>
            <Text style={styles.profileTitle}>Profile</Text>
            <Text style={styles.profileLabel}>Name:</Text>
            <Text style={styles.profileValue}>{userName}</Text>
            <Text style={styles.profileLabel}>Email:</Text>
            <Text style={styles.profileValue}>{userEmail}</Text>
            <Text style={styles.profileLabel}>Matches Won:</Text>
            <Text style={styles.profileValue}>12</Text>
            <Text style={styles.profileLabel}>Matches Lost:</Text>
            <Text style={styles.profileValue}>5</Text>
            <TouchableOpacity style={styles.closeProfileBtn} onPress={handleCloseProfileCard}>
              <Text style={styles.closeProfileBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A1A", // Darker background for the whole app
  },
  topNavBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "#222222", // Slightly lighter than background
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  topNavButton: {
    alignItems: "center",
    paddingHorizontal: 10,
  },
  profileIconPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#00A862", // Example color for profile icon
    marginBottom: 4,
  },
  topNavButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  scrollViewContent: {
    flexGrow: 1,
    padding: 15,
    alignItems: "center",
  },
  bannerContainer: {
    width: "100%",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 20,
    alignItems: 'center',
    backgroundColor: '#333333', // Fallback background for banner
  },
  bannerImage: {
    width: '100%',
    height: 150, // Adjust height as needed
  },
  rechargeButton: {
    backgroundColor: '#FFD700', // Gold color for the button
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginTop: -20, // Overlap with the image slightly
    marginBottom: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  rechargeButtonText: {
    color: '#333333',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
    alignSelf: 'flex-start', // Align title to the left
    marginLeft: 10,
  },
  connectingContainer: {
    marginBottom: 20,
    alignItems: "center",
  },
  connectingText: {
    color: "#B0B0B0",
    fontSize: 14,
    marginTop: 8,
  },
  // New style for variants to be in a column
  variantsColumn: {
    flexDirection: 'column', // Ensures items stack vertically
    width: '100%', // Takes full width of the parent
  },
  // New style for variant cards to take full width
  variantCardFullWidth: {
    backgroundColor: "#222222",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15, // Add margin bottom for spacing between cards
    width: '100%', // Takes full width of its parent (variantsColumn)
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderColor: '#444444',
    borderWidth: 1,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  variantCardTitle: {
    color: "#00A862",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
    textAlign: "center",
  },
  variantCardDescription: {
    color: "#B0B0B0",
    fontSize: 12,
    textAlign: "center",
  },
  bottomNavBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "#222222",
    borderTopWidth: 1,
    borderTopColor: "#333333",
  },
  bottomNavButton: {
    alignItems: "center",
    paddingHorizontal: 10,
  },
  bottomNavButtonIcon: {
    fontSize: 24,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  bottomNavButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 10,
  },
  sidebar: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: "#2C2F33",
    zIndex: 20,
    paddingTop: 20,
  },
  sidebarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#36393F",
  },
  sidebarHeaderText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 24,
  },
  sidebarItem: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#36393F",
  },
  sidebarItemText: {
    color: "#fff",
    fontSize: 18,
  },
  logoutText: {
    color: "#FF4D4D",
  },
  profileOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
  },
  profileCard: {
    backgroundColor: "#23272A",
    borderRadius: 16,
    padding: 28,
    width: 320,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  profileTitle: {
    color: "#00A862",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 18,
  },
  profileLabel: {
    color: "#b0b3b8",
    fontSize: 16,
    marginTop: 8,
  },
  profileValue: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  closeProfileBtn: {
    marginTop: 24,
    backgroundColor: "#00A862",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  closeProfileBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});