import React from 'react';
import { View, Text, StyleSheet, ImageBackground, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const image = require('../assets/images/dorsubg3.jpg');

interface HeaderProps {
  title: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <ImageBackground source={image} style={styles.headerBackground}>
      <LinearGradient
        colors={['rgba(255, 193, 7, 0.9)', 'rgba(255, 193, 7, 0.7)']}
        style={styles.gradient}
      >
                <Text style={styles.headerTitle}>{title}</Text>
        <Image source={require('../assets/images/dorsulogo-removebg-preview (1).png')} style={styles.logo} />
      </LinearGradient>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  headerBackground: {
    width: '100%',
    height: 120, // Adjust height as needed
    justifyContent: 'flex-end',
  },
  gradient: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20, // Adjust for status bar
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#003366', // DOrSU Blue
    textShadowColor: 'rgba(255, 255, 255, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  logo: {
    width: 60,
    height: 60,
  },
});

export default Header;
