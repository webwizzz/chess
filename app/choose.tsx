import { getSocket } from "@/utils/socketManager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function Choose() {
  const { width } = Dimensions.get("window");
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
        alert("Connection failed!");
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
    if (!userId) return;
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
    socketInstance.on("connect", () => {
      socketInstance.emit("queue:join", { userId, variant });
      setSocketConnecting(false);
      router.replace({ pathname: "/matchmaking", params: { variant, userId } });
    });
    socketInstance.on("connect_error", () => {
      alert("Failed to connect to server!");
      setSocketConnecting(false);
    });
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
      alert("Logout failed!");
    }
  };

  const handleCloseProfileCard = () => {
    setShowProfileCard(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Navbar */}
      <View style={styles.navbar}>
        <TouchableOpacity onPress={toggleSidebar} style={styles.menuIcon}>
          <Text style={styles.menuIconText}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.userNameText}>{userName || "Loading..."}</Text>
        <View style={styles.navbarRightPlaceholder} /> {/* Placeholder for alignment */}
      </View>

      {/* Main Content */}
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <Text style={styles.title}>Choose Your Variant</Text>
        {socketConnecting && (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color="#00A862" />
            <Text style={styles.connectingText}>Connecting to server...</Text>
          </View>
        )}
        {variants.map((variant) => (
          <TouchableOpacity
            key={variant.title}
            style={[
              styles.card,
              { width: cardWidth },
              (!userId || socketConnecting) && styles.cardDisabled,
            ]}
            activeOpacity={0.85}
            onPress={() => handleVariantSelect(variant.name)}
            disabled={!userId || socketConnecting}
          >
            <Text style={styles.cardTitle}>{variant.title}</Text>
            <Text style={styles.cardDescription}>{variant.description}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={closeSidebar}
        />
      )}

      {/* Sidebar */}
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
    backgroundColor: "#23272A",
  },
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#2C2F33",
    borderBottomWidth: 1,
    borderBottomColor: "#36393F",
  },
  menuIcon: {
    padding: 5,
  },
  menuIconText: {
    color: "#fff",
    fontSize: 24,
  },
  userNameText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  navbarRightPlaceholder: {
    width: 34, // Same width as menuIcon to balance the layout
  },
  scrollViewContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 24,
    textAlign: "center",
  },
  connectingContainer: {
    marginBottom: 32,
    alignItems: "center",
  },
  connectingText: {
    color: "#b0b3b8",
    fontSize: 16,
    marginTop: 12,
  },
  card: {
    backgroundColor: "#2C2F33",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardTitle: {
    color: "#00A862",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 6,
    textAlign: "center",
  },
  cardDescription: {
    color: "#b0b3b8",
    fontSize: 15,
    textAlign: "center",
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
    // width will be set dynamically in component
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
    color: "#FF4D4D", // A red color for logout
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