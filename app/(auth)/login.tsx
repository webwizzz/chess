import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleLogin = async () => {
    try {
      const response = await axios.post('http://localhost:3000/api/auth/login', {
        email,
        password
      });
      if (response.status === 200) {
        const data = response.data;
        await AsyncStorage.setItem('token', data.token);
        await AsyncStorage.setItem('user', JSON.stringify(data.user));
        router.replace('/(main)/choose');
      } else {
        alert(response.data.error || 'Login failed');
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'An error occurred. Please try again.';
      alert(errorMsg);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#23272A", justifyContent: "center", alignItems: "center", padding: 20 }}>
      <Image
        source={{ uri: "https://www.chess.com/bundles/web/images/offline-play/standardboard.84a92436.png" }}
        style={{ width: 80, height: 80, marginBottom: 16, borderRadius: 12 }}
      />
      <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold", marginBottom: 8 }}>Welcome Back</Text>
      <Text style={{ color: "#b0b3b8", fontSize: 16, marginBottom: 24 }}>Log in to continue your chess journey!</Text>
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
        style={{ width: "100%", backgroundColor: "#2C2F33", color: "#fff", borderWidth: 0, marginBottom: 20, padding: 14, borderRadius: 10, fontSize: 16 }}
        secureTextEntry
      />
      <TouchableOpacity
        onPress={handleLogin}
        style={{ backgroundColor: "#00A862", paddingVertical: 16, borderRadius: 30, width: "100%", alignItems: "center", marginBottom: 16 }}
      >
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>Login & Play</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push("/(auth)/signup")}
        style={{ marginTop: 8 }}>
        <Text style={{ color: "#b0b3b8", fontSize: 16 }}>Don't have an account? <Text style={{ color: "#00A862", fontWeight: "bold" }}>Sign up</Text></Text>
      </TouchableOpacity>
      <View style={{ marginTop: 32, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>🏆 Compete, win, and climb the leaderboard!</Text>
        <Text style={{ color: "#b0b3b8", fontSize: 14, marginTop: 4 }}>Track your stats and earn rewards.</Text>
      </View>
    </View>
  );
}
