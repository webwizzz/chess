import { useRouter } from 'expo-router';
import React from 'react';
import { Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface StreakMasterProps {
  userId?: string;
}

export default function StreakMasterScreen({ userId }: StreakMasterProps) {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Back button and wallet */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <View style={styles.wallet}>
            <Text style={styles.walletText}>₹1.00</Text>
          </View>
        </View>

        {/* Victory Rush Card */}
        <View style={styles.victoryRushCard}>
          <View style={styles.victoryRushContent}>
            <Image 
              source={require("../assets/tl.png")} 
              style={styles.victoryRushLogo}
              resizeMode="contain"
            />
            <Text style={styles.subtitle}>Rack up wins.</Text>
            <Text style={styles.motivationText}>Keep your streak alive!</Text>

            <View style={styles.progressBar}>
              <View style={styles.progressFill} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.spotsLeft}>103 spots left</Text>
              <Text style={styles.totalSpots}>240 spots</Text>
            </View>
          </View>
        </View>

        {/* How to Win Section */}
        <View style={styles.rulesContainer}>
          <Text style={styles.rulesTitle}>How to win</Text>
          <View style={styles.rulesList}>
            <Text style={styles.ruleText}>• Win or draw games without losing to form a streak</Text>
            <Text style={styles.ruleText}>• The more games you go unbeaten, the longer your streak</Text>
            <Text style={styles.ruleText}>• The number of games in your unbeaten streak will be your score in the leaderboard</Text>
            <Text style={styles.ruleText}>• Your score will be frozen when you lose a game. But don't worry, we will give you another chance if you lose your first game</Text>
            <Text style={styles.ruleText}>• You should win atleast one game to be eligible for prize money</Text>
          </View>
        </View>
        
        {/* Add padding at the bottom to account for fixed button */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Fixed Play Now Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity style={styles.playButton}>
          <Text style={styles.playButtonText}>Play Now - ₹49</Text>
        </TouchableOpacity>
        <Text style={styles.timerText}>TOURNAMENT ENDS IN : 6h 16m</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  wallet: {
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  walletText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  victoryRushCard: {
    backgroundColor: "#69923e",
    borderRadius: 16,
    marginBottom: 20,
    marginHorizontal: 16,
    marginTop: 100,
    padding: 0,
    paddingBottom: 24,
  },
  victoryRushContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  victoryRushLogo: {
    width: '150%',
    height: 250,
    position: 'absolute',
    top: -100,
    zIndex: 1,
  },

  subtitle: {
    color: "#FFF5E1",
    fontSize: 18,
    marginBottom: 20,
    paddingTop: 90,
    opacity: 0.9,
  },



  progressBar: {
    width: '90%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    width: '43%',
    height: '100%',
    backgroundColor: '#00FF00',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '90%',
  },
  spotsLeft: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  totalSpots: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  rulesContainer: {
    padding: 16,
  },
  rulesTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
  },
  rulesList: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 16,
  },
  ruleText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 12,
    lineHeight: 22,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  bottomPadding: {
    height: 100, // Height to account for fixed bottom container
  },
  motivationText: {
    color: '#FFF5E1',
    fontSize: 16,
    opacity: 0.8,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  playButton: {
    backgroundColor: '#FFD700',
    width: '100%',
    padding: 16,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 8,
  },
  playButtonText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  timerText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 8,
  },
});
