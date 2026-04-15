import React from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { AssistantStatus } from "@/context/AssistantContext";

interface StatusBarProps {
  status: AssistantStatus;
  transcript?: string;
}

const STATUS_LABELS: Record<AssistantStatus, string> = {
  idle: "Tap to speak",
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Speaking...",
  error: "Something went wrong",
};

export function AssistantStatusBar({ status, transcript }: StatusBarProps) {
  const colors = useColors();

  const getStatusColor = () => {
    switch (status) {
      case "listening":
        return "#FF4D6A";
      case "thinking":
        return colors.primary;
      case "speaking":
        return colors.accent;
      case "error":
        return colors.destructive;
      default:
        return colors.mutedForeground;
    }
  };

  const statusColor = getStatusColor();
  const label = transcript && status === "listening" ? transcript : STATUS_LABELS[status];

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.dot,
          {
            backgroundColor: statusColor,
            shadowColor: statusColor,
          },
        ]}
      />
      <Text
        style={[styles.label, { color: status === "idle" ? colors.mutedForeground : colors.foreground }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
});
