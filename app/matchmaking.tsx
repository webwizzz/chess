import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { Socket } from "socket.io-client";
import { getSocket, getSocketInstance } from "../utils/socketManager";
import ChessGame from "./ChessGame";

interface GameState {
  sessionId: string;
  variantName: string;
  subvariantName: string;
  description: string;
  players: {
    white: {
      userId: string;
      username: string;
      rating: number;
      avatar: string | null;
      title: string | null;
    };
    black: {
      userId: string;
      username: string;
      rating: number;
      avatar: string | null;
      title: string | null;
    };
  };
  board: {
    fen: string;
    position: string;
    activeColor: "white" | "black";
    castlingRights: string;
    enPassantSquare: string;
    halfmoveClock: number;
    fullmoveNumber: number;
  };
  timeControl: {
    type: string;
    baseTime: number;
    increment: number;
    timers: {
      white: number;
      black: number;
    };
    flagged: {
      white: boolean;
      black: boolean;
    };
  };
  status: string;
  result: string;
  moves: string[];
  moveCount: number;
  lastMove: string | null;
  gameState: {
    check: boolean;
    checkmate: boolean;
    stalemate: boolean;
  };
  userColor: {
    [key: string]: "white" | "black";
  };
}

export default function MatchMaking() {
  const router = useRouter();
  const { variant, subvariant, userId } = useLocalSearchParams<{ variant: string; subvariant: string, userId: string }>();
  const [opponent, setOpponent] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isMatchFound, setIsMatchFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gameSocket, setGameSocket] = useState<Socket | null>(null);

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
      console.log("Received match found response:", response);
      setOpponent(response.opponent.name);
      setGameState(response.gameState);
      setTimer(0); // Reset timer when match is found
      
      // Switch from matchmaking to game mode
      setTimeout(() => {
        setIsMatchFound(true);
        setLoading(true);
        
        // Clean up matchmaking listeners
        socket.off("queue:matched");
        socket.emit("queue:leave");
        socket.disconnect();        

        const sessionId = response.sessionId;
        console.log("Match found! Session ID:", sessionId);
        const gameSocket = getSocket(userId, "game", sessionId);
        if (!gameSocket) {
          console.error("Failed to get game socket instance");
          alert("Failed to connect to game. Please try again.");
          setLoading(false);
          return;
        }
        setGameSocket(gameSocket);
        console.log("Connected to game socket for session:", sessionId);  
        setLoading(false);

      }, 2000); // Show "Match Found!" for 2 seconds before transitioning
    });

    socket.on("queue:error", (response) => {
      console.log("Received queue error:", response);
      setOpponent(null);
      setTimer(0); // Reset timer on error
      alert(response.error || "An error occurred while matching");
    });

    return () => {
      socket.off("queue:matched");
      socket.off("queue:error");
      console.log("Cleaned up matchmaking listeners");
    };
  }, [socket]);

  useEffect(() => {
    if (opponent || isMatchFound) return; // Stop timer if opponent is found or match is found

    const interval = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);

    if (timer > 30) {
      alert("No opponent found within 30 seconds. Redirecting to choose page.");
      router.replace("/choose");
    }

    return () => clearInterval(interval);
  }, [timer, opponent, isMatchFound, router]);

  // If match is found and game state is available, show the chess game
  if (isMatchFound && gameState && gameSocket) {
    return (
      <ChessGame 
        initialGameState={gameState}
        userId={userId}
      />
    );
  } else if (loading) {
    // Show loading spinner while waiting for match to be established
    return (
      <View style={{ flex: 1, backgroundColor: "#23272A", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#00A862" />
        <Text style={{ color: "#b0b3b8", fontSize: 16, marginTop: 12 }}>
          Waiting for match to be established...
        </Text>
      </View>
    );
  }

  // Show matchmaking UI
  return (
    <View style={{ flex: 1, backgroundColor: "#23272A", justifyContent: "center", alignItems: "center", padding: 20 }}>
      <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold", marginBottom: 32 }}>
        Matchmaking...
      </Text>
      
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", width: "100%" }}>
        {/* User Side */}
        <View style={{ alignItems: "center", flex: 1 }}>
          <Image 
            source={{ uri: "https://ui-avatars.com/api/?name=You&background=00A862&color=fff&size=128" }} 
            style={{ width: 64, height: 64, borderRadius: 32, marginBottom: 8 }} 
          />
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>You</Text>
        </View>
        
        {/* VS */}
        <View style={{ alignItems: "center", flex: 0.5 }}>
          <Text style={{ color: "#b0b3b8", fontSize: 22, fontWeight: "bold" }}>VS</Text>
        </View>
        
        {/* Opponent Side */}
        <View style={{ alignItems: "center", flex: 1 }}>
          <Image 
            source={{ 
              uri: opponent 
                ? `https://ui-avatars.com/api/?name=${opponent}&background=2C2F33&color=fff&size=128` 
                : "https://cdn-icons-png.flaticon.com/512/189/189792.png" 
            }} 
            style={{ 
              width: 64, 
              height: 64, 
              borderRadius: 32, 
              marginBottom: 8, 
              opacity: opponent ? 1 : 0.5 
            }} 
          />
          <Text style={{ 
            color: opponent ? "#fff" : "#b0b3b8", 
            fontSize: 18, 
            fontWeight: "bold" 
          }}>
            {opponent || "Searching..."}
          </Text>
        </View>
      </View>
      
      {/* Show timer and spinner if not matched */}
      {!opponent && (
        <View style={{ marginTop: 40, alignItems: "center" }}>
          <ActivityIndicator size="large" color="#00A862" />
          <Text style={{ color: "#b0b3b8", fontSize: 16, marginTop: 12 }}>
            Finding an opponent... ({timer}s)
          </Text>
        </View>
      )}
      
      {/* Show match found message */}
      {opponent && !isMatchFound && (
        <View style={{ marginTop: 40, alignItems: "center" }}>
          <Text style={{ color: "#00A862", fontSize: 20, fontWeight: "bold" }}>
            Match Found!
          </Text>
          <Text style={{ color: "#b0b3b8", fontSize: 14, marginTop: 8 }}>
            Starting game...
          </Text>
        </View>
      )}
    </View>
  );
}