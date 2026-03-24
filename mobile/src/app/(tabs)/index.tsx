import { useState, useRef, useCallback } from "react";
import {
  SafeAreaView,
  TextInput,
  FlatList,
  ActivityIndicator,
  Text,
  StyleSheet,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { listContacts } from "../../lib/api/contacts";
import { ContactRow } from "../../components/ContactRow";

export default function ContactsScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((text: string) => {
    setSearch(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(text);
    }, 300);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", { search: debouncedSearch }],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token!, {
        search: debouncedSearch || undefined,
        limit: 50,
      });
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search contacts..."
        placeholderTextColor="#9ca3af"
        value={search}
        onChangeText={handleSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {isLoading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#3b82f6" />
      ) : !data?.contacts?.length ? (
        <Text style={styles.empty}>No contacts found</Text>
      ) : (
        <FlatList
          data={data.contacts}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ContactRow
              contact={item}
              onPress={() => router.push(`/contact/${item.id}`)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  searchInput: {
    padding: 12,
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    color: "#111827",
  },
  loader: {
    marginTop: 40,
  },
  empty: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 16,
    color: "#6b7280",
  },
});
