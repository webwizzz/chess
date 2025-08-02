import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Layout from '../components/layout/Layout';
import { profileScreenStyles } from '../lib/styles/screens';

function Profile() {
  const [user, setUser] = useState<{name: string, email: string} | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await AsyncStorage.getItem('user');
        if (userData) {
          setUser(JSON.parse(userData));
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };
    
    loadUser();
  }, []);

  const name = user?.name || 'Guest';
  const email = user?.email || 'Not provided';
  const firstLetter = name.charAt(0).toUpperCase();

  return (
    <ScrollView style={profileScreenStyles.container} showsVerticalScrollIndicator={false}>
      {/* Profile Header Box */}
      <View style={profileScreenStyles.profileBox}>
        <View style={profileScreenStyles.profileHeader}>
          <View style={profileScreenStyles.avatar}>
            <Text style={profileScreenStyles.avatarText}>{firstLetter}</Text>
          </View>
          <Text style={profileScreenStyles.profileName}>{name}</Text>
          <Text style={profileScreenStyles.profilePhone}>{email}</Text>
        </View>
      </View>

      <View style={profileScreenStyles.optionsContainer}>
        {/* My Balance */}
        <TouchableOpacity style={profileScreenStyles.optionButton}>
          <View style={profileScreenStyles.iconContainer}>
            <Svg width="24" height="24" viewBox="0 0 24 24">
              <Path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" fill="#00A862"/>
            </Svg>
          </View>
          <Text style={profileScreenStyles.optionText}>My Balance</Text>
        </TouchableOpacity>
        
        {/* Invite & Earn */}
        <TouchableOpacity style={profileScreenStyles.optionButton}>
          <View style={profileScreenStyles.iconContainer}>
            <Svg width="24" height="24" viewBox="0 0 24 24">
              <Path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" fill="#00A862" />
            </Svg>
          </View>
          <Text style={profileScreenStyles.optionText}>Invite & Earn</Text>
        </TouchableOpacity>

        {/* Play with Friends */}
        <TouchableOpacity style={profileScreenStyles.optionButton}>
          <View style={profileScreenStyles.iconContainer}>
            <Svg width="24" height="24" viewBox="0 0 24 24">
              <Path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="#00A862" />
            </Svg>
          </View>
          <Text style={profileScreenStyles.optionText}>Play with Friends</Text>
        </TouchableOpacity>

        {/* How to Play */}
        <TouchableOpacity style={profileScreenStyles.optionButton}>
          <View style={profileScreenStyles.iconContainer}>
            <Svg width="24" height="24" viewBox="0 0 24 24">
              <Path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" fill="#00A862" />
            </Svg>
          </View>
          <Text style={profileScreenStyles.optionText}>How to Play</Text>
        </TouchableOpacity>

        {/* About Us */}
        <TouchableOpacity style={profileScreenStyles.optionButton}>
          <View style={profileScreenStyles.iconContainer}>
            <Svg width="24" height="24" viewBox="0 0 24 24">
              <Path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#00A862" />
            </Svg>
          </View>
          <Text style={profileScreenStyles.optionText}>About Us</Text>
        </TouchableOpacity>

        {/* Terms & Conditions */}
        <TouchableOpacity style={profileScreenStyles.optionButton}>
          <View style={profileScreenStyles.iconContainer}>
            <Svg width="24" height="24" viewBox="0 0 24 24">
              <Path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm4-6h4v2h-4v-2zm0-3h4v2h-4v-2zm0-3h4v2h-4V8z" fill="#00A862" />
            </Svg>
          </View>
          <Text style={profileScreenStyles.optionText}>Terms & Conditions</Text>
        </TouchableOpacity>

        {/* Help & Support */}
        <TouchableOpacity style={profileScreenStyles.optionButton}>
          <View style={profileScreenStyles.iconContainer}>
            <Svg width="24" height="24" viewBox="0 0 24 24">
              <Path d="M12 1C5.9 1 1 5.9 1 12s4.9 11 11 11 11-4.9 11-11S18.1 1 12 1zm0 20c-5 0-9-4-9-9s4-9 9-9 9 4 9 9-4 9-9 9zm1-15h-2v2h2V6zm0 4h-2v8h2v-8z" fill="#00A862" />
            </Svg>
          </View>
          <Text style={profileScreenStyles.optionText}>Help & Support</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}


export default function ProfilePage() {
  const router = useRouter();

  const handleProfile = () => {
    router.push('/profile');
  };

  const handleTournament = () => {
    router.push('/tournament');
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

  const handleHome = () => {
    router.push('/choose');
  };

  return (
    <Layout
      onProfile={handleProfile}
      onTournament={handleTournament}
      onLogout={handleLogout}
      isChooseScreen={false}
      onToggleScreen={handleHome}
      hideTopNav={true}
    >
      <Profile />
    </Layout>
  );
}
