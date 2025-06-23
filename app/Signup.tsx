import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function Signup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSignup = () => {
    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    // TODO: Add signup logic
    alert(`Signup with ${email}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#23272A", justifyContent: "center", alignItems: "center", padding: 20 }}>
      <Image
        source={{ uri: "https://www.chess.com/bundles/web/images/offline-play/standardboard.84a92436.png" }}
        style={{ width: 80, height: 80, marginBottom: 16, borderRadius: 12 }}
      />
      <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold", marginBottom: 8 }}>Create Account</Text>
      <Text style={{ color: "#b0b3b8", fontSize: 16, marginBottom: 24 }}>Join the game and challenge the world!</Text>
      <TextInput
        placeholder="Name"
        placeholderTextColor="#b0b3b8"
        value={name}
        onChangeText={setName}
        style={{ width: "100%", backgroundColor: "#2C2F33", color: "#fff", borderWidth: 0, marginBottom: 12, padding: 14, borderRadius: 10, fontSize: 16 }}
      />
      <TextInput
        placeholder="Email"
        placeholderTextColor="#b0b3b8"
        value={email}
        onChangeText={setEmail}
        style={{ width: "100%", backgroundColor: "#2C2F33", color: "#fff", borderWidth: 0, marginBottom: 12, padding: 14, borderRadius: 10, fontSize: 16 }}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        placeholder="Password"
        placeholderTextColor="#b0b3b8"
        value={password}
        onChangeText={setPassword}
        style={{ width: "100%", backgroundColor: "#2C2F33", color: "#fff", borderWidth: 0, marginBottom: 12, padding: 14, borderRadius: 10, fontSize: 16 }}
        secureTextEntry
      />
      <TextInput
        placeholder="Confirm Password"
        placeholderTextColor="#b0b3b8"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        style={{ width: "100%", backgroundColor: "#2C2F33", color: "#fff", borderWidth: 0, marginBottom: 20, padding: 14, borderRadius: 10, fontSize: 16 }}
        secureTextEntry
      />
      <TouchableOpacity
        onPress={handleSignup}
        style={{ backgroundColor: "#00A862", paddingVertical: 16, borderRadius: 30, width: "100%", alignItems: "center", marginBottom: 16 }}
      >
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>Sign Up & Play</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/Login")}
        style={{ marginTop: 8 }}>
        <Text style={{ color: "#b0b3b8", fontSize: 16 }}>Already have an account? <Text style={{ color: "#00A862", fontWeight: "bold" }}>Login</Text></Text>
      </TouchableOpacity>
      <View style={{ marginTop: 32, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>🎉 Unlock achievements as you play!</Text>
        <Text style={{ color: "#b0b3b8", fontSize: 14, marginTop: 4 }}>Earn trophies, badges, and more.</Text>
      </View>
    </View>
  );
}
