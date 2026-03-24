import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { getContact } from "../../lib/api/contacts";
import { CallButton } from "../../components/CallButton";

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();

  const { data: contact, isLoading } = useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      const token = await getToken();
      return getContact(token!, id);
    },
    enabled: !!id,
  });

  if (isLoading || !contact) {
    return (
      <>
        <Stack.Screen options={{ title: "Contact" }} />
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{ title: `${contact.first_name} ${contact.last_name}` }}
      />
      <ScrollView style={styles.container}>
        <Text style={styles.name}>
          {contact.first_name} {contact.last_name}
        </Text>

        {contact.email && (
          <View style={styles.row}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{contact.email}</Text>
          </View>
        )}

        {contact.phone && (
          <View style={styles.row}>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.value}>{contact.phone}</Text>
          </View>
        )}

        {contact.source && (
          <View style={styles.row}>
            <Text style={styles.label}>Source</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{contact.source}</Text>
            </View>
          </View>
        )}

        <View style={styles.callSection}>
          {contact.phone ? (
            <CallButton contactId={contact.id} phone={contact.phone} />
          ) : (
            <View style={styles.noPhoneButton}>
              <Text style={styles.noPhoneText}>No phone number</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 16,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 24,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  label: {
    fontSize: 14,
    color: "#6b7280",
  },
  value: {
    fontSize: 16,
    color: "#111827",
  },
  badge: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 14,
    color: "#3b82f6",
    fontWeight: "500",
  },
  callSection: {
    marginTop: 32,
  },
  noPhoneButton: {
    backgroundColor: "#d1d5db",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  noPhoneText: {
    color: "#6b7280",
    fontSize: 16,
  },
});
