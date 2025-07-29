import { Stack } from "expo-router";

export default function GameLayout() {
  return (
    <Stack>
      <Stack.Screen name="time-controls" options={{ headerShown: false }} />
      <Stack.Screen name="variants" options={{ headerShown: false }} />
    </Stack>
  );
}
