import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface BottomBarProps {
  onProfile: () => void;
  onTournament: () => void;
  onLogout: () => void;
  onHome: () => void;
  onToggleScreen: () => void;
}

export default function BottomBar({ onProfile, onTournament, onLogout, onHome, onToggleScreen }: BottomBarProps) {
  return (
    <View style={styles.bottomNavBar}>
      {/* Home Button */}
      <TouchableOpacity style={styles.bottomNavButton} onPress={onHome}>
        <View style={styles.iconContainer}>
          <Svg width="24" height="24" viewBox="0 0 45 45" style={styles.icon}>
            <Path
              d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z"
              fill="#fff"
              stroke="#fff"
              strokeWidth="1.5"
            />
            <Path
              d="M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z"
              fill="#fff"
              stroke="#fff"
              strokeWidth="1.5"
            />
            <Path
              d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14"
              fill="#fff"
              stroke="#fff"
              strokeWidth="1.5"
            />
            <Path
              d="M 34,14 L 31,17 L 14,17 L 11,14"
              fill="#fff"
              stroke="#fff"
              strokeWidth="1.5"
            />
            <Path
              d="M 31,17 L 31,29.5 L 14,29.5 L 14,17"
              fill="#fff"
              stroke="#fff"
              strokeWidth="1.5"
            />
          </Svg>
          <Text style={styles.bottomNavButtonText}>Home</Text>
        </View>
      </TouchableOpacity>

      {/* Tournament Button */}
      <TouchableOpacity style={styles.bottomNavButton} onPress={onToggleScreen}>
        <View style={styles.iconContainer}>
          <Image 
            source={require("../../../assets/cup.svg")} 
            style={[styles.icon, { tintColor: '#FFFFFF' }]}
          />
          <Text style={styles.bottomNavButtonText}>Tournament</Text>
        </View>
      </TouchableOpacity>

      {/* Menu Button */}
      <TouchableOpacity style={styles.bottomNavButton} onPress={onProfile}>
        <View style={styles.iconContainer}>
          <Svg width="24" height="24" viewBox="0 0 24 24" style={styles.icon}>
            <Path
              d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"
              fill="#fff"
            />
          </Svg>
          <Text style={styles.bottomNavButtonText}>Menu</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNavBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#2C2C2E",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  bottomNavButton: {
    alignItems: "center",
    width: '33%',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  icon: {
    width: 24,
    height: 24,
    marginBottom: 4,
  },
  bottomNavButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
    textAlign: 'center',
    opacity: 0.9,
  },
});
