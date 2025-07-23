import { getSocket } from "@/utils/socketManager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
} from "react-native";
import Svg, { Path } from 'react-native-svg';

export default function Choose() {
  const { width, height } = Dimensions.get("window");
  const router = useRouter();
  
  const variants = [
    {
      name: "decay",
      title: "Decay Chess",
      description: "Pieces decay after a set number of moves. Adapt your strategy!",
      rules: "In Decay Chess, each piece has a limited lifespan measured in moves. After a certain number of moves, pieces will 'decay' and be removed from the board. Plan your strategy carefully as your pieces won't last forever!"
    },
    {
      name: "sixpointer",
      title: "Six Pointer",
      description: "Each piece has a point value. Score 6 points to win!",
      rules: "Each piece has a specific point value: Pawn=1, Knight/Bishop=3, Rook=5, Queen=9. Capture opponent pieces to accumulate points. First player to reach 6 points wins the game!"
    },
    {
      name: "crazyhouse",
      title: "Crazyhouse with Timer",
      description: "Captured pieces return to your hand. Play fast!",
      rules: "When you capture an opponent's piece, it joins your reserves and can be dropped back onto the board as your own piece on any empty square. This creates dynamic and tactical gameplay with time pressure!"
    },
    {
      name: "classic",
      title: "Classic",
      description: "The traditional chess game with no special rules.",
      rules: "Standard chess rules apply. The objective is to checkmate your opponent's king. Pieces move according to traditional chess rules with no modifications."
    },
  ];

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [socketConnecting, setSocketConnecting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [selectedVariantRules, setSelectedVariantRules] = useState("");
  const [selectedVariantTitle, setSelectedVariantTitle] = useState("");
  
  const sidebarAnim = useRef(new Animated.Value(-width)).current;

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
          setUserName("Guest");
          setUserEmail("No email");
        }
      } catch (err) {
        console.error("Error initializing user:", err);
        Alert.alert("Error", "Failed to load user data.");
        setUserName("Guest");
        setUserEmail("No email");
      }
    };
    init();
  }, []);

  useEffect(() => {
    Animated.timing(sidebarAnim, {
      toValue: isSidebarOpen ? 0 : -width,
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

    if (variant === "classic") {
      router.replace({ pathname: "/classictimecontrol", params: { userId } } as any);
      return;
    } else if (variant === "crazyhouse") {
      router.replace({ pathname: "/crazytimecontrol", params: { userId } } as any);
      return;
    }

    setSocketConnecting(true);
    const socketInstance = getSocket(userId, "matchmaking");
    socketInstance.connect();

    const onConnectSuccess = () => {
      console.log("Matchmaking socket connected for variant select.");
      socketInstance.off("connect", onConnectSuccess);
      socketInstance.off("connect_error", onConnectError);
      socketInstance.emit("tournament:join", { userId });
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
    if (!userId) {
      Alert.alert("Login Required", "Please log in to join tournaments.");
      return;
    }

    setSocketConnecting(true);
    const socketInstance = getSocket(userId, "matchmaking");
    socketInstance.connect();

    const onConnectSuccess = () => {
      console.log("Matchmaking socket connected for tournament.");
      socketInstance.off("connect", onConnectSuccess);
      socketInstance.off("connect_error", onConnectError);
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
    setShowProfileCard(true);
  };

  const handleLeaderboard = () => {
    closeSidebar();
    router.push({ pathname: "/leaderboard" } as any);
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem("user");
      setUserId(null);
      setUserName("Guest");
      closeSidebar();
      setTimeout(() => {
        router.replace({ pathname: "/Login" } as any);
      }, 100);
    } catch (e) {
      console.error("Failed to logout", e);
      Alert.alert("Logout Failed", "There was an error logging out. Please try again.");
    }
  };

  const handleCloseProfileCard = () => {
    setShowProfileCard(false);
  };

  const handleInfoPress = (variant: any) => {
    setSelectedVariantRules(variant.rules);
    setSelectedVariantTitle(variant.title);
    setShowRulesModal(true);
  };

  const closeRulesModal = () => {
    setShowRulesModal(false);
    setSelectedVariantRules("");
    setSelectedVariantTitle("");
  };

  // Custom Info Icon Component
  const InfoIcon = () => (
    <Svg width="24" height="24" viewBox="0 0 100 100">
      <Path
        d="M 30.306641 17.960938 C 23.138641 17.960938 17.306641 23.792938 17.306641 30.960938 L 17.306641 69.960938 C 17.306641 77.128938 23.138641 82.960938 30.306641 82.960938 L 69.306641 82.960938 C 76.474641 82.960938 82.306641 77.128938 82.306641 69.960938 L 82.306641 30.960938 C 82.306641 23.791938 76.475641 17.960938 69.306641 17.960938 L 30.306641 17.960938 z M 30.306641 19.960938 L 69.306641 19.960938 C 75.371641 19.960938 80.306641 24.895937 80.306641 30.960938 L 80.306641 69.960938 C 80.306641 76.025937 75.371641 80.960938 69.306641 80.960938 L 30.306641 80.960938 C 24.241641 80.960938 19.306641 76.025937 19.306641 69.960938 L 19.306641 30.960938 C 19.306641 24.895937 24.241641 19.960938 30.306641 19.960938 z M 33.144531 22.960938 C 27.168531 22.960938 22.306641 27.822828 22.306641 33.798828 L 22.306641 67.123047 C 22.306641 73.099047 27.168531 77.960938 33.144531 77.960938 L 66.470703 77.960938 C 72.446703 77.960938 77.306641 73.099047 77.306641 67.123047 L 77.306641 48.460938 C 77.306641 48.183937 77.082641 47.960938 76.806641 47.960938 C 76.530641 47.960938 76.306641 48.184937 76.306641 48.460938 L 76.306641 67.123047 C 76.306641 72.547047 71.894703 76.960938 66.470703 76.960938 L 33.144531 76.960938 C 27.720531 76.960938 23.306641 72.547047 23.306641 67.123047 L 23.306641 33.798828 C 23.306641 28.374828 27.720531 23.960937 33.144531 23.960938 L 66.806641 23.960938 C 67.082641 23.960938 67.306641 23.736937 67.306641 23.460938 C 67.306641 23.184938 67.082641 22.960937 66.806641 22.960938 L 33.144531 22.960938 z M 50.128906 32.591797 C 48.861906 32.591797 47.751219 33.005266 46.824219 33.822266 C 45.881219 34.655266 45.402344 35.700734 45.402344 36.927734 C 45.402344 37.544734 45.534875 38.128156 45.796875 38.660156 C 46.050875 39.179156 46.393406 39.638344 46.816406 40.027344 C 47.236406 40.413344 47.733016 40.726031 48.291016 40.957031 C 48.856016 41.192031 49.474906 41.310547 50.128906 41.310547 C 51.434906 41.310547 52.551266 40.877484 53.447266 40.021484 C 54.348266 39.158484 54.804687 38.117734 54.804688 36.927734 C 54.804688 35.733734 54.336062 34.699562 53.414062 33.851562 C 52.503062 33.015563 51.398906 32.591797 50.128906 32.591797 z M 50.130859 33.591797 C 51.156859 33.591797 52.008281 33.918844 52.738281 34.589844 C 53.456281 35.249844 53.806641 36.014688 53.806641 36.929688 C 53.806641 37.848687 53.463812 38.624781 52.757812 39.300781 C 52.044812 39.982781 51.184859 40.3125 50.130859 40.3125 C 49.608859 40.3125 49.117828 40.220156 48.673828 40.035156 C 48.223828 39.848156 47.827141 39.599922 47.494141 39.294922 C 47.163141 38.990922 46.894312 38.630656 46.695312 38.222656 C 46.502313 37.826656 46.402344 37.391687 46.402344 36.929688 C 46.402344 35.988687 46.756328 35.216266 47.486328 34.572266 C 48.234328 33.911266 49.099859 33.591797 50.130859 33.591797 z M 76.806641 36.960938 C 76.530641 36.960938 76.306641 37.183937 76.306641 37.460938 L 76.306641 39.460938 C 76.306641 39.736938 76.530641 39.960938 76.806641 39.960938 C 77.082641 39.960938 77.306641 39.736937 77.306641 39.460938 L 77.306641 37.460938 C 77.306641 37.184937 77.082641 36.960938 76.806641 36.960938 z M 76.806641 40.960938 C 76.530641 40.960938 76.306641 41.184938 76.306641 41.460938 L 76.306641 45.460938 C 76.306641 45.736938 76.530641 45.960937 76.806641 45.960938 C 77.082641 45.960938 77.306641 45.736938 77.306641 45.460938 L 77.306641 41.460938 C 77.306641 41.183937 77.082641 40.960938 76.806641 40.960938 z M 42.757812 44.013672 C 42.481812 44.013672 42.257813 44.237672 42.257812 44.513672 L 42.257812 47.087891 C 42.257812 47.363891 42.481812 47.587891 42.757812 47.587891 C 46.390813 47.587891 46.390625 48.797313 46.390625 49.195312 L 46.390625 62.919922 C 46.390625 63.328922 46.390812 64.419922 42.757812 64.419922 C 42.481812 64.419922 42.257813 64.643922 42.257812 64.919922 L 42.257812 67.492188 C 42.257812 67.768187 42.481812 67.992188 42.757812 67.992188 L 57.765625 67.992188 C 58.041625 67.992188 58.265625 67.768187 58.265625 67.492188 L 58.265625 64.919922 C 58.265625 64.643922 58.041625 64.419922 57.765625 64.419922 C 56.038625 64.419922 54.931656 64.173406 54.472656 63.691406 C 54.282656 63.491406 54.20175 63.243156 54.21875 62.910156 L 54.21875 62.886719 L 54.21875 44.513672 C 54.21875 44.237672 53.99475 44.013672 53.71875 44.013672 L 42.757812 44.013672 z M 43.257812 45.013672 L 53.216797 45.013672 L 53.216797 62.876953 C 53.189797 63.479953 53.367094 63.985813 53.746094 64.382812 C 54.364094 65.031813 55.488625 65.361109 57.265625 65.412109 L 57.265625 66.992188 L 43.257812 66.992188 L 43.257812 65.414062 C 44.685812 65.383062 47.390625 65.121922 47.390625 62.919922 L 47.390625 49.195312 C 47.390625 47.560313 46.000812 46.687703 43.257812 46.595703 L 43.257812 45.013672 z"
        fill="#fff"
      />
    </Svg>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Navigation Bar */}
      <View style={styles.topNavBar}>
        <TouchableOpacity style={styles.topNavButton} onPress={handleProfile}>
          <View style={styles.profileIconPlaceholder} />
          <Text style={styles.topNavButtonText}>Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topNavButton} onPress={handleLeaderboard}>
          <Text style={styles.topNavButtonText}>🏆</Text>
          <Text style={styles.topNavButtonText}>Leaderboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topNavButton}>
          <Text style={styles.topNavButtonText}>✉️</Text>
          <Text style={styles.topNavButtonText}>Newsletter</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* Battle Mode Header */}
        <View style={styles.battleModeContainer}>
          <Text style={styles.battleModeTitle}>Battle Mode</Text>
        </View>

        <Text style={styles.sectionTitle}>For You</Text>

        {socketConnecting && (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color="#00A862" />
            <Text style={styles.connectingText}>Connecting to server...</Text>
          </View>
        )}

        {/* Variants Section */}
        <View style={styles.variantsColumn}>
          {variants.map((variant) => (
            <View
              key={variant.title}
              style={[
                styles.variantCardNew,
                (!userId || socketConnecting) && styles.cardDisabled,
              ]}
            >
              <TouchableOpacity
                style={styles.variantCardContent}
                activeOpacity={0.85}
                onPress={() => handleVariantSelect(variant.name)}
                disabled={!userId || socketConnecting}
              >
                <Text style={styles.variantCardTitleNew}>{variant.title}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                
                onPress={() => handleInfoPress(variant)}
              >
                <InfoIcon />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNavBar}>
        <TouchableOpacity style={styles.bottomNavButton} onPress={handleProfile}>
          <Text style={styles.bottomNavButtonIcon}>👤</Text>
          <Text style={styles.bottomNavButtonText}>Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavButton} onPress={handleTournamentSelect}>
          <Text style={styles.bottomNavButtonIcon}>🏆</Text>
          <Text style={styles.bottomNavButtonText}>Tournament</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavButton} onPress={handleLogout}>
          <Text style={styles.bottomNavButtonIcon}>➡️</Text>
          <Text style={styles.bottomNavButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Rules Modal */}
      <Modal
        visible={showRulesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeRulesModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.rulesModal}>
            <Text style={styles.rulesTitle}>{selectedVariantTitle} Rules</Text>
            <ScrollView style={styles.rulesContent}>
              <Text style={styles.rulesText}>{selectedVariantRules}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.closeRulesButton} onPress={closeRulesModal}>
              <Text style={styles.closeRulesButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sidebar Overlay and Sidebar */}
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

      {/* Profile Card Overlay */}
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
    backgroundColor: "#1A1A1A",
  },
  topNavBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "#222222",
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
    backgroundColor: "#00A862",
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
  battleModeContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 30,
    marginTop: 20,
  },
  battleModeTitle: {
    fontSize: 42,
    fontWeight: "bold",
    color: "#00A862",
    fontFamily: "Knewave-Regular",
    textAlign: "center",
    textShadowColor: "rgba(0, 168, 98, 0.4)",
    textShadowOffset: { width: 2, height: 3 },
    textShadowRadius: 6,
    letterSpacing: 1,
    transform: [{ rotate: '-1deg' }],
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 16, // Reduced from 20 to 16
    fontWeight: "bold",
    marginBottom: 15,
    alignSelf: 'flex-start',
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
  variantsColumn: {
    flexDirection: 'column',
    width: '100%',
  },
  variantCardNew: {
    backgroundColor: "#222222",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderColor: '#444444',
    borderWidth: 1,
    minHeight: 70,
  },
  variantCardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  variantCardTitleNew: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "left",
  },
  infoButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0, 168, 98, 0.1)",
    borderWidth: 1,
    borderColor: "#00A862",
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  rulesModal: {
    backgroundColor: "#222222",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    borderColor: "#444444",
    borderWidth: 1,
  },
  rulesTitle: {
    color: "#00A862",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  rulesContent: {
    maxHeight: 300,
    marginBottom: 20,
  },
  rulesText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "left",
  },
  closeRulesButton: {
    backgroundColor: "#00A862",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: "center",
  },
  closeRulesButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
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