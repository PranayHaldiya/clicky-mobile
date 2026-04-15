import React, { useRef } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useColors } from "@/hooks/useColors";
import { useAssistant } from "@/context/AssistantContext";
import { VoiceOrb } from "@/components/VoiceOrb";
import { MessageBubble } from "@/components/MessageBubble";
import { AssistantStatusBar } from "@/components/StatusBar";
import { ChatInput } from "@/components/TextInput";
import type { Message } from "@/context/AssistantContext";

export default function AssistantScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    messages,
    status,
    isRecording,
    startListening,
    stopListening,
    sendMessage,
    clearHistory,
    currentTranscript,
  } = useAssistant();

  const flatListRef = useRef<FlatList<Message>>(null);

  const handleOrbPress = () => {
    if (isRecording || status === "listening") {
      stopListening();
    } else if (status === "idle") {
      startListening();
    }
  };

  const isDisabled = status !== "idle";

  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.headerOrb,
              { backgroundColor: colors.primary, shadowColor: colors.primary },
            ]}
          >
            <Ionicons name="sparkles" size={14} color="#fff" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              Clicky
            </Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              Your AI assistant
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={clearHistory}
          style={[styles.headerAction, { backgroundColor: colors.surface }]}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          inverted
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          scrollEnabled={messages.length > 0}
          ListHeaderComponent={
            <AssistantStatusBar status={status} transcript={currentTranscript} />
          }
          ListFooterComponent={<View style={{ height: 8 }} />}
        />

        <View
          style={[
            styles.voiceSection,
            { borderTopColor: colors.border },
          ]}
        >
          <VoiceOrb status={status} onPress={handleOrbPress} size={80} />
        </View>

        <View style={[styles.inputSection, { paddingBottom: bottomPad + 4 }]}>
          <ChatInput onSend={sendMessage} disabled={isDisabled} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  messageList: {
    paddingTop: 12,
    paddingBottom: 8,
    flexGrow: 1,
  },
  voiceSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputSection: {
    paddingTop: 4,
  },
});
