import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import BottomBar from './BottomBar';
import HeaderBar from './HeaderBar';
import TopNavBar from './TopNavBar';

interface LayoutProps {
  children: React.ReactNode;
  onProfile: () => void;
  onTournament: () => void;
  onLogout: () => void;
  isChooseScreen?: boolean;
  onToggleScreen: () => void;
  hideTopNav?: boolean;
}

export default function Layout({ 
  children, 
  onProfile, 
  onTournament, 
  onLogout, 
  isChooseScreen = true,
  onToggleScreen,
  hideTopNav = false
}: LayoutProps) {
  return (
    <SafeAreaView style={styles.container}>
      <HeaderBar />
      {!hideTopNav && (
        <TopNavBar 
          isChooseScreen={isChooseScreen}
          onToggleScreen={onToggleScreen}
        />
      )}
      <View style={styles.content}>
        {children}
      </View>
      <BottomBar
        onProfile={onProfile}
        onTournament={onTournament}
        onLogout={onLogout}
        onHome={onToggleScreen}
        onToggleScreen={onToggleScreen}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1C1C1E",
  },
  content: {
    flex: 1,
  },
});
