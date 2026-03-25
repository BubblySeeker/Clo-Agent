import {
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Text,
  StyleSheet,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { listCallLogs } from "../../lib/api/calls";
import { CallRow } from "../../components/CallRow";

export default function CallsScreen() {
  const { getToken } = useAuth();
  const router = useRouter();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["calls"],
    queryFn: async () => {
      const token = await getToken();
      return listCallLogs(token!, { limit: 50 });
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      {isLoading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#3b82f6" />
      ) : !data?.calls?.length ? (
        <Text style={styles.empty}>No calls yet</Text>
      ) : (
        <FlatList
          data={data.calls}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <CallRow
              call={item}
              onPress={() => router.push(`/call/${item.id}`)}
            />
          )}
          refreshing={isRefetching}
          onRefresh={refetch}
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
