import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { initiateCall } from "../lib/api/calls";

interface CallButtonProps {
  contactId: string;
  phone: string;
}

export function CallButton({ contactId, phone }: CallButtonProps) {
  const { getToken } = useAuth();

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return initiateCall(token!, { to: phone, contact_id: contactId });
    },
    onSuccess: () => {
      Alert.alert(
        "Calling",
        "Your phone will ring shortly. Answer to connect."
      );
    },
    onError: (err: Error) => {
      Alert.alert("Call Failed", err.message);
    },
  });

  return (
    <TouchableOpacity
      style={[styles.button, mutation.isPending && styles.buttonDisabled]}
      onPress={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text style={styles.text}>Call {phone}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#22c55e",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  text: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
});
