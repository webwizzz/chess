import { Stack } from "expo-router";
import "./globals.css";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="Home" options={{ headerShown: false }} />
      <Stack.Screen name="Login" options={{ headerTitle: "Login" }} />
      <Stack.Screen name="Signup" options={{ headerTitle: "Sign Up" }} />
    </Stack>
  );
}
