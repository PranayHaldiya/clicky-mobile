import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { AssistantStatus } from "@/context/AssistantContext";

interface VoiceOrbProps {
  status: AssistantStatus;
  onPress: () => void;
  size?: number;
}

export function VoiceOrb({ status, onPress, size = 88 }: VoiceOrbProps) {
  const colors = useColors();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let pulseLoop: Animated.CompositeAnimation | null = null;
    let glowLoop: Animated.CompositeAnimation | null = null;
    let rotateLoop: Animated.CompositeAnimation | null = null;

    if (status === "listening") {
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 600,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );
      pulseLoop.start();

      glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );
      glowLoop.start();
    } else if (status === "thinking") {
      rotateLoop = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: Platform.OS !== "web",
        })
      );
      rotateLoop.start();

      glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );
      glowLoop.start();
    } else if (status === "speaking") {
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 300,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );
      pulseLoop.start();

      glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 0.8,
            duration: 300,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(glowAnim, {
            toValue: 0.2,
            duration: 300,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );
      glowLoop.start();
    } else {
      Animated.parallel([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    }

    return () => {
      pulseLoop?.stop();
      glowLoop?.stop();
      rotateLoop?.stop();
    };
  }, [status, pulseAnim, glowAnim, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  const getOrbColor = () => {
    switch (status) {
      case "listening":
        return "#FF4D6A";
      case "thinking":
        return colors.primary;
      case "speaking":
        return colors.accent;
      default:
        return colors.primary;
    }
  };

  const getIcon = () => {
    switch (status) {
      case "listening":
        return "mic";
      case "thinking":
        return "ellipsis-horizontal";
      case "speaking":
        return "volume-high";
      case "error":
        return "warning";
      default:
        return "mic-outline";
    }
  };

  const orbColor = getOrbColor();

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 2,
            height: size * 2,
            borderRadius: size,
            backgroundColor: orbColor,
            opacity: glowOpacity,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 1.4,
            height: size * 1.4,
            borderRadius: size * 0.7,
            borderColor: orbColor,
            transform:
              status === "thinking"
                ? [{ rotate: spin }, { scale: pulseAnim }]
                : [{ scale: pulseAnim }],
            opacity: status === "idle" ? 0.3 : 0.7,
          },
        ]}
      />
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[
          styles.orb,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: orbColor,
            shadowColor: orbColor,
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Ionicons
            name={getIcon() as keyof typeof Ionicons.glyphMap}
            size={size * 0.38}
            color="#fff"
          />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    opacity: 0,
  },
  ring: {
    position: "absolute",
    borderWidth: 2,
    borderStyle: "dashed",
  },
  orb: {
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
  },
});
