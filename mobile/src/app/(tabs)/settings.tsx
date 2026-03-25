import { useState, useEffect } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { getSMSStatus, savePersonalPhone } from "../../lib/api/settings";

export default function SettingsScreen() {
  const { getToken, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sms-status"],
    queryFn: async () => {
      const token = await getToken();
      return getSMSStatus(token!);
    },
  });

  useEffect(() => {
    if (data?.personal_phone) {
      setPhone(data.personal_phone);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return savePersonalPhone(token!, phone);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sms-status"] });
      Alert.alert("Saved", "Personal phone number updated.");
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll}>
        {/* Personal Phone Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Phone Number</Text>
          <Text style={styles.sectionDesc}>
            Your phone number used for outbound calls. When you initiate a call,
            this number will ring first.
          </Text>
          {isLoading ? (
            <ActivityIndicator
              style={styles.loader}
              size="small"
              color="#3b82f6"
            />
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 (555) 123-4567"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
              />
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  mutation.isPending && styles.saveButtonDisabled,
                ]}
                onPress={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scroll: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#111827",
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: "#3b82f6",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  loader: {
    marginTop: 12,
  },
  signOutButton: {
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  signOutText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "500",
  },
});
