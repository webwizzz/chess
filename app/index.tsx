import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from "expo-router";
import React from "react";

export default function Index() {
  const router = useRouter();
  React.useEffect(() => {
    const checkAuth = async () => {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        router.replace('/choose');
      } else {
        router.replace('/Home');
      }
    };
    checkAuth();
  }, [router]);
  return null;
}
